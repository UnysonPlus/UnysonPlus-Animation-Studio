import type { PresetContext } from './index';

/**
 * The second preset set: feathered and stepped reveals, a 3D turn, counting numbers, a sheen, and
 * ambient motion (drift, flowing gradients, particles). Everything stepped or drawn is a pure function
 * of the clip's progress, run from one tween's onUpdate, so any frame can be shown by seeking.
 */

type Vars = Record<string, unknown>;
const num = (p: Vars, k: string, d: number) => (typeof p[k] === 'number' && Number.isFinite(p[k]) ? (p[k] as number) : d);
const pick = <T extends string>(p: Vars, k: string, allowed: readonly T[], d: T): T => (allowed.includes(p[k] as T) ? (p[k] as T) : d);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const isOut = (p: Vars) => p.direction === 'out';

/** The clip's ease as a function (presets that draw by hand apply it themselves). */
function easeOf(ctx: PresetContext): (t: number) => number {
  if (typeof ctx.ease === 'function') return ctx.ease;
  const f = ctx.gsap.parseEase(ctx.ease) as ((t: number) => number) | undefined;
  return typeof f === 'function' ? f : (t) => t;
}

/** Runs render(progress 0..1) across the clip, seek-safe. Renders the start now when this is the layer's first clip. */
function drive(ctx: PresetContext, render: (p: number) => void, opts: { ease?: boolean; renderFirst?: boolean } = {}) {
  const e = opts.ease === false ? (t: number) => t : easeOf(ctx);
  const state = { p: 0 };
  if (ctx.first && opts.renderFirst !== false) render(e(0));
  ctx.tl.fromTo(state, { p: 0 }, { p: 1, duration: ctx.duration, ease: 'none', immediateRender: false, onUpdate: () => render(e(state.p)) }, ctx.at);
}

/** A child element this preset owns inside the layer, reused when the timeline is rebuilt. */
function owned(ctx: PresetContext, cls: string): HTMLElement {
  const key = `${cls}-${ctx.clip.id}`;
  let node = ctx.el.querySelector<HTMLElement>(`:scope > [data-upw-own="${key}"]`);
  if (!node) {
    node = ctx.el.ownerDocument.createElement('div');
    node.className = cls;
    node.dataset.upwOwn = key;
    node.setAttribute('aria-hidden', 'true');
    ctx.el.appendChild(node);
  }
  return node;
}

const setMask = (el: HTMLElement, v: string) => {
  el.style.maskImage = v;
  el.style.setProperty('-webkit-mask-image', v);
};

/** 3D presets tween the layer's 3D state; the player draws it after every timeline update. */
function tween3d(ctx: PresetContext, from: Vars, to: Vars, immediate: boolean) {
  if (!ctx.model) return;
  ctx.tl.fromTo(ctx.model, from, { ...to, duration: ctx.duration, ease: ctx.ease, immediateRender: immediate }, ctx.at);
}

export const MORE_BUILDERS: Record<string, (ctx: PresetContext) => void> = {
  'spin-3d'(ctx) {
    const axis = pick(ctx.params, 'axis', ['y', 'x', 'z'] as const, 'y');
    const key = axis === 'x' ? 'rx' : axis === 'z' ? 'rz' : 'ry';
    tween3d(ctx, { [key]: 0 }, { [key]: 360 * num(ctx.params, 'turns', 1) }, false);
  },

  'tumble-in'(ctx) {
    const p = ctx.params;
    const away = { ry: num(p, 'turn', 140), rx: num(p, 'tilt', -50), s: num(p, 'scale', 0.4) };
    const home = { ry: 0, rx: 0, s: 1 };
    if (isOut(p)) tween3d(ctx, home, { ry: -away.ry, rx: -away.rx, s: away.s }, false);
    else tween3d(ctx, away, home, ctx.first);
    // The layer fades with it, over the first (or last) part of the move.
    const fade = Math.min(0.5, ctx.duration * 0.4);
    if (isOut(p)) ctx.tl.fromTo(ctx.el, { opacity: 1 }, { opacity: 0, duration: fade, ease: 'none', immediateRender: false }, ctx.at + ctx.duration - fade);
    else ctx.tl.fromTo(ctx.el, { opacity: 0 }, { opacity: 1, duration: fade, ease: 'none', immediateRender: ctx.first }, ctx.at);
  },

  'orbit-3d'(ctx) {
    const a = num(ctx.params, 'angle', 50);
    tween3d(ctx, { orbit: -a / 2, tilt: 0 }, { orbit: a / 2, tilt: num(ctx.params, 'tilt', 10) }, ctx.first);
  },

  'camera-push'(ctx) {
    const d = num(ctx.params, 'distance', 2.2);
    if (isOut(ctx.params)) tween3d(ctx, { dolly: 1 }, { dolly: d }, false);
    else tween3d(ctx, { dolly: d }, { dolly: 1 }, ctx.first);
  },

  'soft-wipe'(ctx) {
    const p = ctx.params;
    const from = pick(p, 'from', ['left', 'right', 'top', 'bottom'] as const, 'left');
    const f = Math.max(1, Math.min(80, num(p, 'feather', 25)));
    const dir = { left: 'to right', right: 'to left', top: 'to bottom', bottom: 'to top' }[from];
    const out = isOut(p);
    drive(ctx, (t) => {
      const pos = t * (100 + f);
      if (!out && t >= 1) return setMask(ctx.el, 'none');
      if (out && t <= 0) return setMask(ctx.el, 'none');
      setMask(ctx.el, out
        ? `linear-gradient(${dir}, transparent ${pos - f}%, #000 ${pos}%)`
        : `linear-gradient(${dir}, #000 ${pos - f}%, transparent ${pos}%)`);
    });
  },

  blinds(ctx) {
    const p = ctx.params;
    const from = pick(p, 'from', ['top', 'bottom', 'left', 'right'] as const, 'top');
    const n = Math.max(2, Math.min(24, Math.round(num(p, 'count', 6))));
    const lag = Math.max(0, Math.min(0.9, num(p, 'stagger', 0.5)));
    const out = isOut(p);
    const e = easeOf(ctx);
    const map = (u: number, v: number) => (from === 'top' ? [u, v] : from === 'bottom' ? [u, 100 - v] : from === 'left' ? [v, u] : [100 - v, u]);
    const pt = (u: number, v: number) => { const [x, y] = map(u, v); return `${x.toFixed(2)}% ${y.toFixed(2)}%`; };
    drive(ctx, (t) => {
      if (!out && t >= 1) { ctx.el.style.clipPath = 'none'; return; }
      if (out && t <= 0) { ctx.el.style.clipPath = 'none'; return; }
      // Each strip runs for (1 - lag) of the clip, starting lag/(n-1) after the one before.
      const step = n > 1 ? lag / (n - 1) : 0;
      const pts: string[] = [pt(0, out ? 100 : 0)];
      for (let i = 0; i < n; i++) {
        const s = e(clamp01((t - i * step) / (1 - lag)));
        const v = out ? s * 100 : s * 100;
        pts.push(pt((i / n) * 100, v), pt(((i + 1) / n) * 100, v));
      }
      pts.push(pt(100, out ? 100 : 0));
      ctx.el.style.clipPath = `polygon(${pts.join(', ')})`;
    }, { ease: false });
  },

  turn(ctx) {
    const p = ctx.params;
    const axis = pick(p, 'axis', ['y', 'x'] as const, 'y');
    const a = num(p, 'angle', 90);
    const rot = axis === 'y' ? 'rotationY' : 'rotationX';
    const base = { transformPerspective: num(p, 'perspective', 900), transformOrigin: '50% 50%' };
    const [from, to] = isOut(p)
      ? [{ ...base, [rot]: 0, opacity: 1 }, { ...base, [rot]: -a, opacity: 0 }]
      : [{ ...base, [rot]: a, opacity: 0 }, { ...base, [rot]: 0, opacity: 1 }];
    ctx.tl.fromTo(ctx.el, from, { ...to, duration: ctx.duration, ease: ctx.ease, immediateRender: ctx.first }, ctx.at);
  },

  'text-count'(ctx) {
    const chars = ctx.chars;
    if (!chars.length) return;
    const originals = chars.map((c) => c.dataset.ch ?? c.textContent ?? '');
    const joined = originals.join('');
    const m = /\d[\d,.  ']*\d|\d/.exec(joined);
    if (!m) return;
    const span = Array.from({ length: m[0].length }, (_, k) => m.index + k);
    const digitSlots = span.filter((i) => /\d/.test(originals[i]));
    const sepSlots = span.filter((i) => !/\d/.test(originals[i]));
    // A trailing "." or "," followed by 1-2 digits is a decimal point.
    const dec = /[.,](\d{1,2})$/.exec(m[0]);
    const decimals = dec ? dec[1].length : 0;
    const target = Number(digitSlots.map((i) => originals[i]).join('')) / 10 ** decimals;
    const startValue = num(ctx.params, 'from', 0);
    const render = (t: number) => {
      if (t >= 1) { span.forEach((i) => { chars[i].textContent = originals[i]; }); return; }
      const v = startValue + (target - startValue) * t;
      const digits = String(Math.round(Math.abs(v) * 10 ** decimals)).padStart(decimals + 1, '0').slice(-digitSlots.length);
      // Right-align the digits in the original digit places; places to the left stay empty.
      const pad = digitSlots.length - digits.length;
      digitSlots.forEach((slot, k) => { chars[slot].textContent = k < pad ? '' : digits[k - pad]; });
      // A separator shows once a digit to its left shows (the decimal point always does).
      sepSlots.forEach((slot) => {
        const leftShown = digitSlots.some((d, k) => d < slot && k >= pad);
        const isDecimal = decimals > 0 && slot === span[span.length - decimals - 1];
        chars[slot].textContent = leftShown || isDecimal ? originals[slot] : '';
      });
    };
    drive(ctx, render);
  },

  sheen(ctx) {
    const p = ctx.params;
    const angle = num(p, 'angle', 110);
    const w = Math.max(5, Math.min(60, num(p, 'width', 22)));
    const strength = Math.max(0, Math.min(1, num(p, 'strength', 0.45)));
    const color = typeof p.color === 'string' && p.color ? p.color : '#ffffff';
    const band = owned(ctx, 'upw-sheen');
    ctx.el.style.position = 'relative';
    ctx.el.style.overflow = 'hidden';
    Object.assign(band.style, { position: 'absolute', inset: '0', pointerEvents: 'none', borderRadius: 'inherit', mixBlendMode: 'screen' });
    const mix = `color-mix(in srgb, ${color} ${Math.round(strength * 100)}%, transparent)`;
    drive(ctx, (t) => {
      if (t <= 0 || t >= 1) { band.style.background = 'none'; return; }
      const pos = -w + t * (100 + 2 * w);
      band.style.background = `linear-gradient(${angle}deg, transparent ${pos - w}%, ${mix} ${pos}%, transparent ${pos + w}%)`;
    }, { renderFirst: true });
  },

  drift(ctx) {
    const p = ctx.params;
    ctx.tl.fromTo(ctx.el,
      { xPercent: 0, yPercent: 0, scale: 1, rotation: 0 },
      { xPercent: num(p, 'x', 4), yPercent: num(p, 'y', -3), scale: num(p, 'scale', 1.04), rotation: num(p, 'rotate', 0), duration: ctx.duration, ease: ctx.ease, immediateRender: false },
      ctx.at);
  },

  'gradient-flow'(ctx) {
    const p = ctx.params;
    const axis = pick(p, 'axis', ['x', 'y', 'diagonal'] as const, 'x');
    const cycles = Math.max(1, Math.round(num(p, 'cycles', 1)));
    ctx.el.style.backgroundSize = axis === 'x' ? '200% 100%' : axis === 'y' ? '100% 200%' : '200% 200%';
    drive(ctx, (t) => {
      // There and back, `cycles` times, so the end matches the start (loops cleanly).
      const tri = 1 - Math.abs(((t * cycles) % 1) * 2 - 1);
      const v = `${(tri * 100).toFixed(2)}%`;
      ctx.el.style.backgroundPosition = axis === 'x' ? `${v} 50%` : axis === 'y' ? `50% ${v}` : `${v} ${v}`;
    }, { ease: false });
  },

  particles(ctx) {
    const p = ctx.params;
    const n = Math.max(1, Math.min(150, Math.round(num(p, 'count', 28))));
    const size = Math.max(0.2, num(p, 'size', 1.2));
    const speed = Math.max(0, num(p, 'speed', 0.12));
    const dir = pick(p, 'direction', ['up', 'down', 'drift'] as const, 'up');
    const color = typeof p.color === 'string' && p.color ? p.color : '#ffffff';
    const twinkle = p.twinkle !== false;
    const field = owned(ctx, 'upw-particles');
    // The field is its own size container, so 1cqw / 1cqh below are 1% of the field.
    Object.assign(field.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none', borderRadius: 'inherit', containerType: 'size' });
    ctx.el.style.position = 'relative';
    while (field.children.length > n) field.lastChild!.remove();
    while (field.children.length < n) field.appendChild(field.ownerDocument.createElement('i'));
    const dots = Array.from(field.children) as HTMLElement[];
    const seeds = dots.map((_, i) => ({ x: ctx.rand(i, 1), phase: ctx.rand(i, 2), pace: 0.6 + 0.8 * ctx.rand(i, 3), scale: 0.5 + ctx.rand(i, 4), tw: ctx.rand(i, 5) }));
    dots.forEach((d, i) => {
      const s = size * seeds[i].scale;
      // Size as a % of the layer's width.
      Object.assign(d.style, { position: 'absolute', left: '0', top: '0', width: `${s}%`, aspectRatio: '1', borderRadius: '50%', background: color, willChange: 'transform, opacity' });
    });
    const render = (t: number) => {
      const secs = t * ctx.duration;
      dots.forEach((d, i) => {
        const sd = seeds[i];
        const travel = (sd.phase + secs * speed * sd.pace) % 1;
        const y = dir === 'up' ? 1 - travel : dir === 'down' ? travel : 0.5 + 0.4 * Math.sin((sd.phase + secs * speed * sd.pace) * Math.PI * 2);
        const x = dir === 'drift' ? (sd.x + secs * speed * 0.5 * sd.pace) % 1 : sd.x + 0.03 * Math.sin((travel + sd.phase) * Math.PI * 4);
        // Fade in and out at the edges of the travel; twinkle on top.
        const edge = dir === 'drift' ? 1 : Math.sin(Math.PI * travel);
        const tw = twinkle ? 0.55 + 0.45 * Math.sin((secs * 2.2 + sd.tw * 6.28) * sd.pace) : 1;
        d.style.transform = `translate(${(x * 100).toFixed(2)}cqw, ${(y * 100).toFixed(2)}cqh) translate(-50%, -50%)`;
        d.style.opacity = (edge * tw).toFixed(3);
      });
    };
    drive(ctx, render, { ease: false });
  },
};
