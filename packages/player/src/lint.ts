import type { Anchor, Box, Breakpoint, Clip, Layer, Scene, TextLayer } from './types';
import { groupDuration } from './groups';
import { presetMeta } from './presets/catalog';

/**
 * "Check scene": motion and layout problems a scene can have even though it is valid, found from the
 * scene file alone (no rendering). The editor lists them with one-click fixes; the AI gets them as
 * things to repair. The rules are the measurable ones from professional motion design: text has to
 * stay up long enough to be read, be big enough to read, stay on the stage and not sit on other text,
 * and two clips shouldn't fight over one layer.
 *
 * Text sizes are estimated (a letter is about 0.55 em wide), so the layout checks say "about".
 */

export interface LintIssue {
  /** Stable for a given problem, so the editor can keep its place in the list. */
  id: string;
  severity: 'warn' | 'info';
  message: string;
  layerId?: string;
  clipId?: string;
  breakpoint?: string;
  fix?: { label: string; apply: (scene: Scene) => Scene };
}

/** Seconds a line of text needs to be read once it has landed. */
export function readingTime(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(0.8, 0.3 * words);
}

/** The smallest text worth showing, in CSS pixels. */
const MIN_TEXT_PX = 12;
/** Width assumed for the narrowest breakpoint (minWidth 0). */
const NARROW_PX = 360;
/** Longest stretch with nothing moving before a scene feels stalled. */
const MAX_STILL = 1.5;

interface Entry {
  layer: Layer;
  /** Scene time of the layer's own time 0 (its container's start). */
  offset: number;
  /** End of the layer's container in scene time. */
  containerEnd: number;
  topLevel: boolean;
}

function entries(scene: Scene): Entry[] {
  const out: Entry[] = [];
  const walk = (list: Layer[], offset: number, end: number, top: boolean) => {
    for (const l of list) {
      out.push({ layer: l, offset, containerEnd: end, topLevel: top });
      if (l.type === 'group') {
        const s = offset + (l.start ?? 0);
        walk(l.layers, s, Math.min(end, s + groupDuration(l)), false);
      }
    }
  };
  walk(scene.layers, 0, scene.duration, true);
  return out;
}

const dirOf = (c: Clip): 'in' | 'out' | null => {
  const meta = presetMeta[c.preset];
  if (!meta || !meta.fields.some((f) => f.key === 'direction')) return null;
  const d = c.params && 'direction' in c.params ? c.params.direction : meta.defaults.direction;
  return d === 'out' ? 'out' : 'in';
};
const isMover = (c: Clip) => {
  const cat = presetMeta[c.preset]?.category;
  return cat === 'text' || cat === 'reveal' || cat === 'motion';
};

/** When a layer is fully on screen and when it starts to leave, in scene time. */
function window(e: Entry, scene: Scene) {
  const l = e.layer;
  const ins = l.clips.filter((c) => dirOf(c) === 'in' || c.preset === 'text-scramble');
  const outs = l.clips.filter((c) => dirOf(c) === 'out').sort((a, b) => a.start - b.start);
  const start = e.offset + (l.start ?? 0);
  const landed = ins.length ? e.offset + Math.max(...ins.map((c) => c.start + c.duration)) : start;
  const lastOut = outs[outs.length - 1];
  const gone = lastOut ? e.offset + lastOut.start + lastOut.duration : e.offset + (l.end ?? Infinity);
  const leaving = outs.length ? e.offset + outs[0].start : e.offset + (l.end ?? Infinity);
  // A layer that never leaves stays up after the last frame unless the scene loops.
  const cap = scene.playback.loop ? Math.min(e.containerEnd, scene.duration) + (scene.playback.repeatDelay ?? 0) : Infinity;
  return { start, landed, leaving: Math.min(leaving, cap), gone: Math.min(gone, cap), firstOut: outs[0] };
}

const anchorFactors = (a: Anchor = 'center'): [number, number] => [
  a.endsWith('left') ? 0 : a.endsWith('right') ? 1 : 0.5,
  a.startsWith('top') ? 0 : a.startsWith('bottom') ? 1 : 0.5,
];

function resolved(l: Layer, bp: string) {
  const o = l.overrides?.[bp] ?? {};
  const box: Box = { ...(l.box ?? { x: 0, y: 0 }), ...(o.box ?? {}) };
  const style = l.type === 'text' ? { ...l.style, ...(o.style ?? {}) } : undefined;
  const text = l.type === 'text' ? (o.text ?? l.text) : undefined;
  return { box, style, text, hidden: !!o.hidden };
}

/** A text layer's estimated rectangle on a breakpoint, in % of the stage (left, top, width, height). */
function textRect(l: TextLayer, bp: Breakpoint) {
  const r = resolved(l, bp.id);
  const size = r.style!.fontSize;
  const lh = r.style!.lineHeight ?? 1.1;
  const lines = (r.text ?? '').split('\n');
  const charW = size * 0.55 * (1 + (r.style!.letterSpacing ?? 0));
  const natural = Math.max(...lines.map((s) => s.length)) * charW;
  const w = r.box.w ?? natural;
  const rows = lines.reduce((n, s) => n + Math.max(1, Math.ceil((s.length * charW) / Math.max(1, w))), 0);
  const h = rows * size * lh * (bp.aspect[0] / bp.aspect[1]);
  const [ax, ay] = anchorFactors(r.box.anchor);
  return { left: r.box.x - w * ax, top: r.box.y - h * ay, w, h, hidden: r.hidden };
}

/** The part of a text rectangle the letters fill: about the middle 70% of each line's height. */
const inkRect = (r: ReturnType<typeof textRect>) => ({ ...r, top: r.top + r.h * 0.15, h: r.h * 0.7 });

const widthOf = (bp: Breakpoint, all: Breakpoint[]) => {
  if (bp.minWidth > 0) return bp.minWidth;
  const next = all.filter((b) => b.minWidth > 0).map((b) => b.minWidth).sort((a, b) => a - b)[0];
  return Math.min(next ?? NARROW_PX, NARROW_PX);
};

const clone = (s: Scene): Scene => JSON.parse(JSON.stringify(s));
function mapLayer(scene: Scene, id: string, fn: (l: Layer) => Layer): Scene {
  const walk = (list: Layer[]): Layer[] => list.map((l) => (l.id === id ? fn(l) : l.type === 'group' ? { ...l, layers: walk(l.layers) } : l));
  return { ...scene, layers: walk(scene.layers) };
}
const nameOf = (l: Layer) => l.name || (l.type === 'text' ? `"${l.text.split('\n')[0].slice(0, 28)}"` : l.id);
const secs = (n: number) => `${Math.round(n * 10) / 10} s`;

export function lintScene(scene: Scene): LintIssue[] {
  const issues: LintIssue[] = [];
  const all = entries(scene);
  const bps = scene.stage.breakpoints;
  const safe = scene.stage.safeArea ?? 0.06;

  for (const e of all) {
    const l = e.layer;

    // Two moving clips at once on one layer can fight over the same property.
    const movers = l.clips.filter(isMover).sort((a, b) => a.start - b.start);
    for (let i = 1; i < movers.length; i++) {
      const a = movers[i - 1];
      const b = movers[i];
      if (b.start < a.start + a.duration - 0.02) {
        const at = Math.round((a.start + a.duration) * 100) / 100;
        issues.push({
          id: `overlap:${l.id}:${b.id}`, severity: 'warn', layerId: l.id, clipId: b.id,
          message: `${nameOf(l)}: "${presetMeta[b.preset]?.label ?? b.preset}" starts before "${presetMeta[a.preset]?.label ?? a.preset}" ends, so they may fight over the same movement.`,
          fix: { label: `Start it at ${at} s`, apply: (s) => mapLayer(s, l.id, (x) => ({ ...x, clips: x.clips.map((c) => (c.id === b.id ? { ...c, start: at } : c)) })) },
        });
      }
    }

    if (l.type !== 'text') continue;

    // Long enough on screen to read.
    const w = window(e, scene);
    const need = readingTime(l.text);
    const up = w.leaving - w.landed;
    if (Number.isFinite(up) && up < need - 0.05) {
      const short = Math.round((need - up) * 100) / 100;
      const exit = w.firstOut;
      issues.push({
        id: `read:${l.id}`, severity: 'warn', layerId: l.id, clipId: exit?.id,
        message: `${nameOf(l)} is fully visible for ${secs(Math.max(0, up))}; reading it takes about ${secs(need)}.`,
        fix: e.topLevel ? {
          label: `Hold it ${secs(short)} longer`,
          apply: (s) => {
            let next = mapLayer(clone(s), l.id, (x) => ({
              ...x,
              end: typeof x.end === 'number' ? x.end + short : x.end,
              clips: x.clips.map((c) => (dirOf(c) === 'out' ? { ...c, start: c.start + short } : c)),
            }));
            const lastEnd = Math.max(0, ...next.layers.flatMap((x) => x.clips.map((c) => c.start + c.duration)));
            if (lastEnd > next.duration) next = { ...next, duration: Math.round(lastEnd * 100) / 100 };
            return next;
          },
        } : undefined,
      });
    }

    // A headline typed letter by letter reads slowly.
    for (const c of l.clips) {
      if (c.preset === 'text-typewriter' && l.style.fontSize >= 5 && dirOf(c) === 'in') {
        issues.push({
          id: `type:${l.id}:${c.id}`, severity: 'info', layerId: l.id, clipId: c.id,
          message: `${nameOf(l)}: typing a headline letter by letter reads slowly. Typing suits small text, like a search box or a prompt.`,
          fix: { label: 'Use Rise instead', apply: (s) => mapLayer(s, l.id, (x) => ({ ...x, clips: x.clips.map((k) => (k.id === c.id ? { ...k, preset: 'text-rise', ease: undefined, params: { ...presetMeta['text-rise'].defaults, by: 'words' } } : k)) })) },
        });
      }
    }

    for (const bp of bps) {
      const r = resolved(l, bp.id);
      if (r.hidden) continue;
      const bpName = bp.label ?? bp.id;

      // Big enough to read at the narrowest width this breakpoint covers.
      const px = (r.style!.fontSize / 100) * widthOf(bp, bps);
      if (px < MIN_TEXT_PX - 0.5) {
        const target = Math.ceil((MIN_TEXT_PX * 100 / widthOf(bp, bps)) * 10) / 10;
        issues.push({
          id: `size:${l.id}:${bp.id}`, severity: 'warn', layerId: l.id, breakpoint: bp.id,
          message: `${nameOf(l)} is about ${Math.round(px)} px tall on ${bpName} screens, hard to read.`,
          fix: {
            label: `Make it ${target} on ${bpName}`,
            apply: (s) => mapLayer(s, l.id, (x) => ({ ...x, overrides: { ...(x.overrides ?? {}), [bp.id]: { ...(x.overrides?.[bp.id] ?? {}), style: { ...(x.overrides?.[bp.id]?.style ?? {}), fontSize: target } } } })),
          },
        });
      }

      // On the stage and inside the safe area.
      const rect = textRect(l, bp);
      const inset = safe * 100;
      const out = rect.left < -0.5 || rect.left + rect.w > 100.5 || rect.top < -0.5 || rect.top + rect.h > 100.5;
      const unsafe = rect.left < inset - 0.5 || rect.left + rect.w > 100 - inset + 0.5 || rect.top < inset - 0.5 || rect.top + rect.h > 100 - inset + 0.5;
      if (out || unsafe) {
        issues.push({
          id: `edge:${l.id}:${bp.id}`, severity: out ? 'warn' : 'info', layerId: l.id, breakpoint: bp.id,
          message: out
            ? `${nameOf(l)} runs past the edge of the stage on ${bpName} screens (about), so part of it is cut off.`
            : `${nameOf(l)} reaches outside the safe area on ${bpName} screens (about), so it may be trimmed when the stage is shorter than its shape.`,
        });
      }
    }
  }

  // Text sitting on other text while both are on screen.
  const texts = all.filter((e) => e.layer.type === 'text');
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const A = texts[i];
      const B = texts[j];
      const wa = window(A, scene);
      const wb = window(B, scene);
      if (Math.min(wa.gone, wb.gone) - Math.max(wa.start, wb.start) <= 0.05) continue;
      for (const bp of bps) {
        // Compare the letters' visible bodies, not their line boxes: tightly stacked lines share leading by design.
        const a = inkRect(textRect(A.layer as TextLayer, bp));
        const b = inkRect(textRect(B.layer as TextLayer, bp));
        if (a.hidden || b.hidden) continue;
        const ix = Math.min(a.left + a.w, b.left + b.w) - Math.max(a.left, b.left);
        const iy = Math.min(a.top + a.h, b.top + b.h) - Math.max(a.top, b.top);
        if (ix <= 0 || iy <= 0) continue;
        if ((ix * iy) / Math.min(a.w * a.h, b.w * b.h) < 0.2) continue;
        issues.push({
          id: `cover:${A.layer.id}:${B.layer.id}:${bp.id}`, severity: 'warn', layerId: B.layer.id, breakpoint: bp.id,
          message: `${nameOf(A.layer)} and ${nameOf(B.layer)} overlap on ${bp.label ?? bp.id} screens (about) while both are showing.`,
        });
        break;
      }
    }
  }

  // Long stretches where nothing moves.
  const spans = all.flatMap((e) => e.layer.clips.map((c) => [e.offset + c.start, e.offset + c.start + c.duration] as [number, number])).sort((a, b) => a[0] - b[0]);
  let reach = spans.length ? spans[0][1] : 0;
  for (const [s0, s1] of spans) {
    if (s0 - reach > MAX_STILL) {
      const from = reach;
      const len = s0 - reach;
      const target = texts
        .filter((e) => e.topLevel && window(e, scene).landed <= from && window(e, scene).leaving >= s0)
        .sort((a, b) => (b.layer as TextLayer).style.fontSize - (a.layer as TextLayer).style.fontSize)[0];
      issues.push({
        id: `still:${Math.round(from * 10)}`, severity: 'info', layerId: target?.layer.id,
        message: `Nothing moves for ${secs(len)} (${secs(from)} to ${secs(s0)}). A slow drift keeps a held frame alive.`,
        fix: target ? {
          label: `Add a slow float to ${nameOf(target.layer)}`,
          apply: (s) => mapLayer(s, target.layer.id, (x) => ({
            ...x,
            clips: [...x.clips, { id: `drift${Math.round(from * 100)}`, preset: 'float', start: Math.round(from * 100) / 100, duration: Math.round(len * 100) / 100, params: { height: 3, cycles: 1 } }],
          })),
        } : undefined,
      });
    }
    reach = Math.max(reach, s1);
  }

  // Everything entering the same way reads as a template.
  const entrances = all.map((e) => e.layer.clips.filter((c) => dirOf(c) === 'in').sort((a, b) => a.start - b.start)[0]).filter(Boolean) as Clip[];
  const counts = new Map<string, number>();
  for (const c of entrances) {
    const key = `${c.preset}|${c.duration}|${JSON.stringify(c.params ?? {})}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, n] of counts) {
    if (n >= 3) {
      const preset = key.split('|')[0];
      issues.push({ id: `same:${preset}`, severity: 'info', message: `${n} layers enter with identical "${presetMeta[preset]?.label ?? preset}" clips. Varying the timing or the preset gives the scene a lead and a rhythm.` });
    }
  }

  return issues;
}
