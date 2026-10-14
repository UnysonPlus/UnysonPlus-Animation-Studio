/**
 * The Studio's in-preview editor. Runs inside the preview iframe next to the player (which it uses
 * only through the public window.UnysonPlusScene API) and talks to the Studio with postMessage:
 *
 *   Studio → preview  play · pause · seek {time} · safe {show} · scene {scene} · select {id} · ui {scale}
 *   preview → Studio  upw:ready · upw:state · upw:error · upw:select {id} · upw:layout {id, box}
 *                     upw:text {id, text} · upw:key {key, code, mod, shift, alt}
 *
 * It draws the selection and hover outlines, moves and resizes layers (with snapping to the centre
 * and the safe area), and edits text in place. Nothing here ships in exported scenes.
 */
import type { Anchor, Box, Scene } from './types';
import type { ScenePlayer } from './player';

type Api = { mount: (host: HTMLElement, scene: unknown, opts: Record<string, unknown>) => ScenePlayer };

const ANCHOR: Record<Anchor, [number, number]> = {
  'top-left': [0, 0], top: [0.5, 0], 'top-right': [1, 0],
  left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
  'bottom-left': [0, 1], bottom: [0.5, 1], 'bottom-right': [1, 1],
};
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];

const round = (n: number) => Math.round(n * 100) / 100;
const send = (msg: Record<string, unknown>) => parent.postMessage(msg, '*');

const CSS = `
#upw-ed{position:fixed;inset:0;pointer-events:none;z-index:2147483600;--k:1}
#upw-ed .box{position:fixed;box-sizing:border-box;display:none}
#upw-ed .hover{outline:calc(1px*var(--k)) solid rgba(80,220,160,.55)}
#upw-ed .sel{outline:calc(1.5px*var(--k)) solid #2ad38b}
#upw-ed .sel.locked{outline-style:dashed}
#upw-ed .h{position:absolute;width:calc(9px*var(--k));height:calc(9px*var(--k));margin:calc(-4.5px*var(--k)) 0 0 calc(-4.5px*var(--k));
  background:#fff;border:calc(1.5px*var(--k)) solid #2ad38b;box-sizing:border-box;pointer-events:auto;border-radius:calc(2px*var(--k))}
#upw-ed .h[data-h=nw],#upw-ed .h[data-h=se]{cursor:nwse-resize}
#upw-ed .h[data-h=ne],#upw-ed .h[data-h=sw]{cursor:nesw-resize}
#upw-ed .h[data-h=n],#upw-ed .h[data-h=s]{cursor:ns-resize}
#upw-ed .h[data-h=e],#upw-ed .h[data-h=w]{cursor:ew-resize}
#upw-ed .tag{position:absolute;left:0;bottom:100%;margin-bottom:calc(4px*var(--k));padding:calc(1px*var(--k)) calc(6px*var(--k));
  font:600 calc(11px*var(--k))/1.5 system-ui,sans-serif;color:#0b1a12;background:#2ad38b;border-radius:calc(3px*var(--k));white-space:nowrap}
#upw-ed .guide{position:fixed;display:none;background:#ff4fa3}
#upw-ed .gx{width:calc(1px*var(--k))}
#upw-ed .gy{height:calc(1px*var(--k))}
.upw-stage{cursor:default}
.upw-layer{cursor:move}
#upw-ed-text{position:fixed;z-index:2147483601;margin:0;padding:0;border:0;resize:none;overflow:hidden;
  background:rgba(10,13,17,.55);outline:calc(1.5px*var(--k,1)) solid #2ad38b;box-sizing:content-box;white-space:pre-wrap}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function start() {
  const api = (window as unknown as { UnysonPlusScene: Api }).UnysonPlusScene;
  const host = document.getElementById('scene')!;
  const initial = JSON.parse(document.getElementById('scene-json')!.textContent || '{}');
  const safeInitial = document.body.dataset.safe === 'true';

  let player: ScenePlayer;
  try {
    player = api.mount(host, initial, { editor: true, autoplay: false, safeArea: safeInitial });
  } catch (e) {
    const box = el('div', 'err');
    box.textContent = (e as Error).message;
    host.appendChild(box);
    send({ type: 'upw:error', message: (e as Error).message });
    return;
  }

  const style = el('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const ov = el('div');
  ov.id = 'upw-ed';
  const hover = el('div', 'box hover');
  const sel = el('div', 'box sel');
  const tag = el('div', 'tag');
  sel.appendChild(tag);
  const handleEls = HANDLES.map((h) => {
    const d = el('div', 'h');
    d.dataset.h = h;
    sel.appendChild(d);
    return d;
  });
  const gx = el('div', 'guide gx');
  const gy = el('div', 'guide gy');
  ov.append(hover, sel, gx, gy);
  document.body.appendChild(ov);

  let selected: string | null = null;
  let hovered: string | null = null;
  let k = 1;
  let editing: { id: string; ta: HTMLTextAreaElement; layer: HTMLElement } | null = null;

  const scene = () => player.scene as Scene;
  const layerOf = (id: string) => scene().layers.find((l) => l.id === id);
  const safe = () => (scene().stage.safeArea ?? 0.06) * 100;

  /** A layer's frame in canvas percentages (left, top, width, height), from its laid-out size. */
  function frame(id: string, box?: Box) {
    const lay = player.layout(id);
    const node = player.layerElement(id);
    const cv = player.canvas();
    if (!lay || !node || lay.hidden) return null;
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    const b = box ?? lay.box;
    const w = (node.offsetWidth / W) * 100;
    const h = (node.offsetHeight / H) * 100;
    const [ax, ay] = ANCHOR[b.anchor ?? 'center'];
    return { l: b.x - w * ax, t: b.y - h * ay, w, h, W, H, box: b, ax, ay };
  }

  function place(div: HTMLElement, f: { l: number; t: number; w: number; h: number; W: number; H: number }) {
    const cr = player.canvas().getBoundingClientRect();
    Object.assign(div.style, {
      display: 'block',
      left: `${cr.left + (f.l / 100) * f.W}px`,
      top: `${cr.top + (f.t / 100) * f.H}px`,
      width: `${(f.w / 100) * f.W}px`,
      height: `${(f.h / 100) * f.H}px`,
    });
  }

  function handlesFor(id: string): Handle[] {
    const layer = layerOf(id);
    if (!layer) return [];
    if (layer.type === 'text') return ['e', 'w'];
    if (typeof player.layout(id)?.box.ratio === 'number') return ['nw', 'ne', 'se', 'sw'];
    // On a thin layer (a line, a bar) the corner handles would sit on top of the side ones, so keep
    // only the handles that stretch it along its length.
    const f = frame(id);
    const min = 27 * k;
    if (f && (f.h / 100) * f.H < min) return ['e', 'w'];
    if (f && (f.w / 100) * f.W < min) return ['n', 's'];
    return [...HANDLES];
  }

  let drawQueued = false;
  function draw(live?: { l: number; t: number; w: number; h: number; W: number; H: number }) {
    hover.style.display = 'none';
    sel.style.display = 'none';
    if (hovered && hovered !== selected && !drag) {
      const f = frame(hovered);
      if (f) place(hover, f);
    }
    if (selected && !editing) {
      const f = live ?? frame(selected);
      if (f) {
        place(sel, f);
        const layer = layerOf(selected);
        tag.textContent = layer?.name || layer?.id || '';
        const shown = handlesFor(selected);
        const pos: Record<Handle, [number, number]> = {
          nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50], se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50],
        };
        handleEls.forEach((d) => {
          const h = d.dataset.h as Handle;
          d.style.display = shown.includes(h) ? 'block' : 'none';
          d.style.left = `${pos[h][0]}%`;
          d.style.top = `${pos[h][1]}%`;
        });
      }
    }
  }
  const redraw = () => {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      if (!drag) draw();
    });
  };

  // ---- state reporting ----
  let reportQueued = false;
  const report = () => {
    if (reportQueued) return;
    reportQueued = true;
    requestAnimationFrame(() => {
      reportQueued = false;
      const stage = document.querySelector('.upw-stage');
      send({
        type: 'upw:state', time: player.time, duration: player.duration, playing: player.playing,
        breakpoint: player.breakpoint, stageHeight: stage ? Math.round(stage.getBoundingClientRect().height) : 0,
      });
    });
  };
  (['update', 'play', 'pause', 'complete', 'breakpoint', 'rebuild'] as const).forEach((e) => player.on(e, report));
  (['breakpoint', 'rebuild'] as const).forEach((e) => player.on(e, redraw));
  addEventListener('resize', () => { report(); redraw(); });
  addEventListener('scroll', redraw, { passive: true });

  // ---- selection ----
  function select(id: string | null, notify: boolean) {
    selected = id && layerOf(id) ? id : null;
    if (notify) send({ type: 'upw:select', id: selected });
    redraw();
  }

  function layerAt(x: number, y: number): string | null {
    for (const node of document.elementsFromPoint(x, y)) {
      const layer = (node as HTMLElement).closest?.('.upw-layer') as HTMLElement | null;
      if (layer && player.root.contains(layer)) return layer.dataset.layer ?? null;
      if ((node as HTMLElement).classList?.contains('upw-stage')) return null;
    }
    return null;
  }

  // ---- move and resize ----
  interface Drag {
    id: string;
    mode: 'move' | Handle;
    x0: number;
    y0: number;
    f0: NonNullable<ReturnType<typeof frame>>;
    moved: boolean;
    patch: Partial<Box>;
  }
  let drag: Drag | null = null;

  function snapAxis(edges: number[], lines: number[], thr: number): { delta: number; line: number | null } {
    let best: { delta: number; line: number | null } = { delta: 0, line: null };
    let bestDist = thr;
    for (const e of edges) for (const line of lines) {
      const d = line - e;
      if (Math.abs(d) < bestDist) {
        bestDist = Math.abs(d);
        best = { delta: d, line };
      }
    }
    return best;
  }

  function showGuides(lineX: number | null, lineY: number | null, f: { W: number; H: number }) {
    const cr = player.canvas().getBoundingClientRect();
    const stageRect = document.querySelector('.upw-stage')!.getBoundingClientRect();
    if (lineX !== null) {
      Object.assign(gx.style, { display: 'block', left: `${cr.left + (lineX / 100) * f.W}px`, top: `${stageRect.top}px`, height: `${stageRect.height}px` });
    } else gx.style.display = 'none';
    if (lineY !== null) {
      Object.assign(gy.style, { display: 'block', top: `${cr.top + (lineY / 100) * f.H}px`, left: `${stageRect.left}px`, width: `${stageRect.width}px` });
    } else gy.style.display = 'none';
  }

  function onMove(e: PointerEvent) {
    if (!drag) return;
    const { f0 } = drag;
    const dxPx = e.clientX - drag.x0;
    const dyPx = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dxPx, dyPx) < 3) return;
    if (!drag.moved) {
      drag.moved = true;
      player.pause();
    }
    const dx = (dxPx / f0.W) * 100;
    const dy = (dyPx / f0.H) * 100;
    const layer = layerOf(drag.id)!;
    const s = safe();
    let l = f0.l, t = f0.t, w = f0.w, h = f0.h;
    let guideX: number | null = null;
    let guideY: number | null = null;

    if (drag.mode === 'move') {
      l += dx;
      t += dy;
      if (!e.altKey) {
        const sx = snapAxis([l, l + w / 2, l + w], [50, s, 100 - s], ((6 * k) / f0.W) * 100);
        const sy = snapAxis([t, t + h / 2, t + h], [50, s, 100 - s], ((6 * k) / f0.H) * 100);
        l += sx.delta;
        t += sy.delta;
        guideX = sx.line;
        guideY = sy.line;
      }
      drag.patch = { x: round(l + w * f0.ax), y: round(t + h * f0.ay) };
    } else {
      const hnd = drag.mode;
      const ratioLocked = typeof f0.box.ratio === 'number';
      if (hnd.includes('e')) w = f0.w + dx;
      if (hnd.includes('w')) { w = f0.w - dx; l = f0.l + dx; }
      if (layer.type !== 'text') {
        if (hnd.includes('s')) h = f0.h + dy;
        if (hnd.includes('n')) { h = f0.h - dy; t = f0.t + dy; }
      }
      w = Math.max(0.5, w);
      h = Math.max(0.5, h);
      if (hnd.includes('w')) l = f0.l + f0.w - w;
      if (hnd.includes('n')) t = f0.t + f0.h - h;
      if (layer.type !== 'text' && (ratioLocked || (e.shiftKey && hnd.length === 2))) {
        // Keep the shape: height follows the width (in pixels), anchored at the opposite corner.
        const r = ratioLocked ? f0.box.ratio! : (f0.w * f0.W) / (f0.h * f0.H);
        h = ((w * f0.W) / r / f0.H);
        if (hnd.includes('n')) t = f0.t + f0.h - h;
      }
      // Only write what this handle changed, so an edge drag never nudges the other axis by rounding.
      const horizontal = hnd.includes('e') || hnd.includes('w');
      const vertical = layer.type !== 'text' && (hnd.includes('n') || hnd.includes('s') || ratioLocked || e.shiftKey);
      const patch: Partial<Box> = {};
      if (horizontal) {
        patch.w = round(w);
        patch.x = round(l + w * f0.ax);
      }
      if (vertical) {
        patch.y = round(t + h * f0.ay);
        if (!ratioLocked) patch.h = round(h);
      }
      drag.patch = patch;
    }
    player.previewLayer(drag.id, drag.patch);
    showGuides(guideX, guideY, f0);
    draw(layer.type === 'text' && drag.mode !== 'move' ? frame(drag.id, { ...f0.box, ...drag.patch }) ?? undefined : { l, t, w, h, W: f0.W, H: f0.H });
  }

  function onUp() {
    if (!drag) return;
    const d = drag;
    drag = null;
    removeEventListener('pointermove', onMove);
    gx.style.display = 'none';
    gy.style.display = 'none';
    if (d.moved && Object.keys(d.patch).length) {
      // The Studio writes the change into the scene and sends the new scene back.
      send({ type: 'upw:layout', id: d.id, box: d.patch });
    } else {
      player.previewLayer(d.id, null);
    }
    redraw();
  }

  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || editing) return;
    const handle = (e.target as HTMLElement).closest?.('.h') as HTMLElement | null;
    let id: string | null;
    let mode: Drag['mode'] = 'move';
    if (handle && selected) {
      id = selected;
      mode = handle.dataset.h as Handle;
    } else {
      id = layerAt(e.clientX, e.clientY);
      if (id !== selected) select(id, true);
    }
    if (!id) return;
    const f0 = frame(id);
    if (!f0) return;
    e.preventDefault();
    drag = { id, mode, x0: e.clientX, y0: e.clientY, f0, moved: false, patch: {} };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp, { once: true });
    addEventListener('pointercancel', onUp, { once: true });
  });

  addEventListener('pointermove', (e) => {
    if (drag || editing) return;
    const id = layerAt(e.clientX, e.clientY);
    if (id !== hovered) {
      hovered = id;
      redraw();
    }
  });
  document.addEventListener('pointerleave', () => { hovered = null; redraw(); });

  // ---- text editing in place ----
  function finishEdit(commit: boolean) {
    if (!editing) return;
    const { id, ta, layer } = editing;
    editing = null;
    layer.style.opacity = '';
    if (commit && ta.value !== player.layout(id)?.text) send({ type: 'upw:text', id, text: ta.value });
    ta.remove();
    redraw();
  }

  addEventListener('dblclick', (e) => {
    const id = layerAt(e.clientX, e.clientY);
    const layer = id ? layerOf(id) : null;
    if (!id || !layer || layer.type !== 'text') return;
    const node = player.layerElement(id)!;
    const inner = node.querySelector('.upw-li') as HTMLElement;
    player.pause();
    select(id, true);
    const rect = node.getBoundingClientRect();
    const cs = getComputedStyle(inner);
    const ta = el('textarea');
    ta.id = 'upw-ed-text';
    ta.value = player.layout(id)?.text ?? '';
    ta.setAttribute('aria-label', 'Edit text');
    ta.spellcheck = false;
    const hasWidth = typeof player.layout(id)?.box.w === 'number';
    Object.assign(ta.style, {
      left: `${rect.left}px`, top: `${rect.top}px`,
      width: hasWidth ? `${rect.width}px` : `${Math.max(rect.width, 40)}px`,
      fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontStyle: cs.fontStyle,
      lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, color: cs.color,
      textAlign: cs.textAlign, textTransform: cs.textTransform,
      // Text without a set width sits on its own lines, so the editor must not wrap it either.
      whiteSpace: hasWidth ? 'pre-wrap' : 'pre',
    });
    ta.style.setProperty('--k', String(k));
    const fit = () => {
      if (!hasWidth) {
        ta.style.width = '0px';
        ta.style.width = `${Math.max(ta.scrollWidth + 4, 40)}px`;
      }
      ta.style.height = '0px';
      ta.style.height = `${ta.scrollHeight}px`;
    };
    ta.addEventListener('input', fit);
    ta.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') { ev.preventDefault(); finishEdit(false); }
      else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finishEdit(true); }
    });
    ta.addEventListener('blur', () => finishEdit(true));
    node.style.opacity = '0';
    document.body.appendChild(ta);
    editing = { id, ta, layer: node };
    fit();
    ta.focus();
    ta.select();
    draw();
  });

  // ---- keyboard: the Studio owns the shortcuts, so forward them while the preview has focus ----
  addEventListener('keydown', (e) => {
    if (editing) return;
    const mod = e.ctrlKey || e.metaKey;
    const forwarded = e.code === 'Space' || e.key === 'Home' || e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Escape'
      || e.key.startsWith('Arrow') || e.key === ',' || e.key === '.' || (mod && ['z', 'y', 'd', 's'].includes(e.key.toLowerCase()));
    if (!forwarded) return;
    e.preventDefault();
    send({ type: 'upw:key', key: e.key, code: e.code, mod, shift: e.shiftKey, alt: e.altKey });
  });

  // ---- messages from the Studio ----
  addEventListener('message', (e) => {
    if (e.source !== parent || !e.data || typeof e.data.type !== 'string') return;
    const m = e.data;
    if (m.type === 'play') player.play();
    else if (m.type === 'pause') player.pause();
    else if (m.type === 'seek') player.seek(Number(m.time) || 0);
    else if (m.type === 'safe') player.setSafeArea(!!m.show);
    else if (m.type === 'select') select(m.id ?? null, false);
    else if (m.type === 'ui') {
      k = Math.max(0.5, Math.min(8, 1 / (Number(m.scale) || 1)));
      ov.style.setProperty('--k', String(k));
      redraw();
    } else if (m.type === 'scene') {
      if (editing) finishEdit(false);
      try {
        player.update(m.scene);
        if (selected && !layerOf(selected)) select(null, true);
        send({ type: 'upw:error', message: null });
      } catch (err) {
        send({ type: 'upw:error', message: (err as Error).message });
      }
      redraw();
    }
  });

  send({ type: 'upw:ready' });
  report();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
