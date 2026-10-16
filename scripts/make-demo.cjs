// Builds the Studio's demo scene (apps/studio/src/scenes/demo.json): a ~38-second Unyson+ promo in groups
// (one per act), using every preset except Custom code.  node scripts/make-demo.cjs apps/studio/src/scenes/demo.json
const fs = require('fs');
const out = process.argv[2];
const FONT = 'Archivo';
const GREEN = '#2ad38b';
const VIOLET = '#a78bfa';
const INK = '#f4f6f8';
const MUTED = '#aab3bf';

function T(id, name, text, box, sizes, style = {}, extra = {}) {
  const [d, t, m] = sizes;
  const ov = { tablet: { style: { fontSize: t } }, mobile: { style: { fontSize: m } } };
  if (extra.tablet) ov.tablet.box = extra.tablet;
  if (extra.mobile) ov.mobile.box = extra.mobile;
  return { id, name, type: 'text', text, style: { fontFamily: FONT, fontSize: d, color: INK, ...style }, box, overrides: ov, clips: extra.clips || [] };
}
function layerWith(type, id, name, box, props, extra) {
  const ov = {};
  if (extra.tablet) ov.tablet = { box: extra.tablet };
  if (extra.mobile) ov.mobile = extra.mobileHidden ? { hidden: true } : { box: extra.mobile };
  else if (extra.mobileHidden) ov.mobile = { hidden: true };
  return { id, name, type, box, ...props, ...(Object.keys(ov).length ? { overrides: ov } : {}), clips: extra.clips || [] };
}
const S = (id, name, box, props, extra = {}) => layerWith('shape', id, name, box, { shape: 'rect', ...props }, extra);
const M = (id, name, box, props, extra = {}) => layerWith('model', id, name, box, props, extra);
const C = (id, preset, start, duration, params, ease) => ({ id, preset, start, duration, ...(params ? { params } : {}), ...(ease ? { ease } : {}) });
// A group's own clips run on its container's (the scene's) clock: offset them by the group's start.
const G = (id, name, start, duration, layers, clips = []) => ({ id, name, type: 'group', start, duration, clips: clips.map((c) => ({ ...c, start: Math.round((start + c.start) * 100) / 100 })), layers });
const KICK = { fontWeight: 600, letterSpacing: 0.32, uppercase: true, color: GREEN };
const KS = [1.25, 1.95, 3.4];

// ---------------------------------------------------------------- backdrop (0-38 s)
const backdrop = G('backdrop', 'Backdrop', 0, 38, [
  S('glow', 'Green glow', { x: 50, y: 55, w: 72, ratio: 1.7 }, { fill: 'radial-gradient(closest-side, rgba(42, 211, 139, 0.24), rgba(42, 211, 139, 0))' },
    { mobile: { w: 130 }, clips: [C('glow-in', 'fade', 0.3, 1.6, { scale: 0.6, y: 0 }), C('glow-drift', 'drift', 1.9, 35.1, { x: 0, y: -2, scale: 1.15 }), C('glow-out', 'fade', 37.2, 0.8, { direction: 'out', y: 0 })] }),
  S('glow2', 'Violet glow', { x: 62, y: 46, w: 64, ratio: 1.5 }, { fill: 'radial-gradient(closest-side, rgba(167, 139, 250, 0.22), rgba(167, 139, 250, 0))' },
    { mobile: { x: 50, w: 120 }, clips: [C('g2-in', 'fade', 13.2, 1.8, { scale: 0.7, y: 0 }), C('g2-out', 'fade', 25.6, 1.4, { direction: 'out', y: 0, scale: 1.2 })] }),
  S('dust', 'Particles', { x: 50, y: 50, w: 100, h: 100 }, { fill: 'transparent' },
    { clips: [C('dust-run', 'particles', 0, 38, { count: 40, size: 0.28, speed: 0.045, direction: 'up', color: GREEN, twinkle: true })] }),
]);

// ---------------------------------------------------------------- act 1 (0-6.5 s): the title
const act1 = G('act1', 'Act 1 · Make it move', 0, 6.5, [
  S('slit', 'Opening line', { x: 50, y: 50, w: 70, h: 0.25 }, { fill: GREEN },
    { mobile: { w: 86 }, clips: [C('slit-in', 'grow', 0, 0.55, { axis: 'x', origin: 'center' }, 'expo.inOut'), C('slit-out', 'grow', 0.6, 0.45, { direction: 'out', axis: 'x', origin: 'center' })] }),
  T('kicker', 'Kicker', 'Unyson+ for WordPress', { x: 50, y: 22 }, KS, KICK,
    { mobile: { y: 17 }, clips: [C('k-in', 'text-scramble', 0.8, 1.1), C('k-out', 'fade', 5.85, 0.5, { direction: 'out', y: -60 })] }),
  T('line1', 'Make it', 'Make it', { x: 50, y: 36 }, [7.2, 8.5, 13], { fontWeight: 800, letterSpacing: -0.01 },
    { tablet: { y: 34 }, mobile: { y: 32 }, clips: [C('l1-in', 'text-stretch', 1.0, 0.9), C('l1-out', 'text-rise', 5.7, 0.6, { direction: 'out', stagger: 0.03 })] }),
  T('line2', 'MOVE.', 'MOVE.', { x: 50, y: 55 }, [19, 22, 25], { fontWeight: 900, letterSpacing: -0.02, lineHeight: 0.92, color: GREEN },
    { tablet: { y: 53 }, mobile: { y: 51 }, clips: [C('l2-in', 'text-slam', 1.5, 0.9), C('l2-out', 'wipe', 5.65, 0.7, { direction: 'out', from: 'left' })] }),
  S('rule', 'Underline', { x: 50, y: 70, w: 34, h: 0.5 }, { fill: GREEN },
    { tablet: { y: 68, w: 46 }, mobile: { y: 66, w: 60, h: 0.6 }, clips: [C('r-in', 'grow', 2.1, 0.9), C('r-out', 'grow', 5.6, 0.5, { direction: 'out', origin: 'end' })] }),
  S('dot', 'Dot', { x: 67, y: 70, w: 0.9, ratio: 1 }, { fill: INK, shape: 'ellipse' },
    { tablet: { x: 73, y: 68, w: 1.2 }, mobile: { x: 80, y: 66, w: 2.2 }, clips: [C('d-in', 'pop', 2.85, 0.5), C('d-out', 'pop', 5.55, 0.35, { direction: 'out' })] }),
  T('sub', 'Supporting line', 'A WordPress framework for hand-made sites.', { x: 50, y: 80, w: 46 }, [1.7, 2.4, 4.2], { fontWeight: 500, lineHeight: 1.35, color: MUTED },
    { tablet: { y: 80, w: 66 }, mobile: { y: 80, w: 84 }, clips: [C('s-in', 'text-rise', 2.5, 1.0, { by: 'words', stagger: 0.05 }), C('s-out', 'fade', 5.85, 0.5, { direction: 'out', y: 30 })] }),
]);

// ---------------------------------------------------------------- act 2 (6.5-13 s): six features, six reveals
const CARD = { fill: 'linear-gradient(160deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02))', stroke: 'rgba(255,255,255,0.14)', strokeWidth: 0.12, radius: 1.2 };
const FEATURES = [
  ['Page builder', C('c1-in', 'blinds', 0, 0.7, { direction: 'in', from: 'bottom', count: 5, stagger: 0.5 }), C('lb1-in', 'text-flip', 0, 0.6, { by: 'chars', stagger: 0.02 })],
  ['Theme Settings', C('c2-in', 'soft-wipe', 0, 0.7, { direction: 'in', from: 'left', feather: 30 }), C('lb2-in', 'text-blur', 0, 0.6, { by: 'chars', stagger: 0.02 })],
  ['Header & footer', C('c3-in', 'iris', 0, 0.7, { direction: 'in', x: 50, y: 50 }), C('lb3-in', 'slide', 0, 0.5, { from: 'bottom', distance: 50 })],
  ['Animation Engine', C('c4-in', 'turn', 0, 0.7, { direction: 'in', axis: 'y', angle: 80 }), C('lb4-in', 'fade', 0, 0.5, { y: 30 })],
  ['Site Converter', C('c5-in', 'pop', 0, 0.6, { from: 0.6 }), C('lb5-in', 'text-rise', 0, 0.6, { by: 'words', stagger: 0.06 })],
  ['AI Assistant', C('c6-in', 'slide', 0, 0.6, { from: 'right', distance: 40 }), C('lb6-in', 'text-tracking', 0, 0.6)],
];
const cards = [];
FEATURES.forEach(([label, reveal, labelIn], i) => {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const x = 22 + col * 28;
  const y = 54 + row * 21;
  const tx = 30 + (i % 2) * 40;
  const ty = 50 + Math.floor(i / 2) * 15;
  const my = 40 + i * 9.4;
  const at = 1.0 + i * 0.16;
  cards.push(
    S(`card${i + 1}`, `Card ${i + 1}`, { x, y, w: 25, h: 17 }, CARD,
      { tablet: { x: tx, y: ty, w: 37, h: 12 }, mobile: { x: 50, y: my, w: 80, h: 7.6 }, clips: [{ ...reveal, start: at }] }),
    T(`label${i + 1}`, `Label ${i + 1}`, label, { x, y }, [1.9, 2.6, 4.2], { fontWeight: 700 },
      { tablet: { x: tx, y: ty }, mobile: { x: 50, y: my }, clips: [{ ...labelIn, start: at + 0.35 }] }),
  );
});
const act2 = G('act2', 'Act 2 · Build', 6.5, 6.5, [
  T('k2', 'Kicker', 'Build', { x: 50, y: 18 }, KS, KICK, { mobile: { y: 14 }, clips: [C('k2-in', 'text-tracking', 0, 0.8)] }),
  T('t2', 'Title', 'Design every page visually.', { x: 50, y: 30, w: 70 }, [5.2, 6.6, 9.5], { fontWeight: 800, letterSpacing: -0.01, lineHeight: 1.05 },
    { tablet: { y: 30, w: 84 }, mobile: { y: 25, w: 88 }, clips: [C('t2-in', 'text-rise', 0.2, 0.9, { by: 'words', stagger: 0.09 })] }),
  ...cards,
], [C('act2-out', 'blinds', 5.85, 0.65, { direction: 'out', from: 'top', count: 8, stagger: 0.6 })]);

// ---------------------------------------------------------------- act 3 (13-19.5 s): numbers in motion
const orbitDots = [];
const R = 1360; // % of the dot's own size: the ring's radius (15% of the stage width) over the dot's width (1.1%)
for (let i = 0; i < 6; i++) {
  const phase = (i / 6) * Math.PI * 2;
  const frames = [];
  for (let k = 0; k <= 12; k++) {
    const a = phase + (k / 12) * Math.PI * 2;
    frames.push({ t: Math.round((k / 12) * 4.2 * 100) / 100, x: Math.round(Math.cos(a) * R), y: Math.round(Math.sin(a) * R), ...(k === 0 ? { opacity: 0, scale: 0.4 } : k === 1 ? { opacity: 1, scale: 1 } : {}), ease: 'none' });
  }
  orbitDots.push(S(`orb${i + 1}`, `Orbit dot ${i + 1}`, { x: 50, y: 44, w: 1.1, ratio: 1 }, { shape: 'ellipse', fill: i % 2 ? VIOLET : GREEN },
    { tablet: { w: 1.32 }, mobile: { y: 38, w: 2.28 }, clips: [C(`orb${i + 1}-path`, 'keyframes', 0.9, 4.2, { frames }, 'none')] }));
}
const act3 = G('act3', 'Act 3 · Animate', 13, 6.5, [
  T('k3', 'Kicker', 'Animate', { x: 50, y: 11 }, KS, KICK, { mobile: { y: 8 }, clips: [C('k3-in', 'text-blur', 0, 0.8, { by: 'chars', stagger: 0.04 })] }),
  ...orbitDots,
  T('n3', 'Count', '35', { x: 50, y: 44 }, [17, 21, 30], { fontWeight: 900, letterSpacing: -0.03, lineHeight: 0.9, color: GREEN },
    { mobile: { y: 38 }, clips: [C('n3-in', 'zoom', 0.2, 0.5, { scale: 1.3 }), C('n3-count', 'text-count', 0.7, 1.4, { from: 0 }), C('n3-pulse', 'pulse', 2.3, 0.8, { scale: 1.07, times: 1 })] }),
  S('bar3', 'Gradient bar', { x: 50, y: 62, w: 38, h: 0.9 }, { fill: 'linear-gradient(90deg, #2ad38b, #3b82f6, #a855f7, #2ad38b)', radius: 1 },
    { tablet: { w: 50 }, mobile: { y: 58, w: 70, h: 1.1 }, clips: [C('b3-in', 'grow', 1.0, 0.8), C('b3-flow', 'gradient-flow', 1.8, 4.1, { axis: 'x', cycles: 2 })] }),
  T('s3', 'Line', 'motion presets, ready to drag onto a timeline.', { x: 50, y: 73, w: 52 }, [2.2, 3.0, 4.8], { fontWeight: 600, lineHeight: 1.3, color: INK },
    { tablet: { w: 70 }, mobile: { y: 71, w: 86 }, clips: [C('s3-in', 'text-rise', 1.2, 0.9, { by: 'words', stagger: 0.06 })] }),
  S('ring3', 'Ring', { x: 50, y: 44, w: 30, ratio: 1 }, { shape: 'ellipse', fill: 'transparent', stroke: 'rgba(167,139,250,0.35)', strokeWidth: 0.15 },
    { tablet: { w: 36 }, mobile: { y: 38, w: 62 }, clips: [C('ring-in', 'spin', 0.5, 1.2, { direction: 'in', turns: 0.25 })] }),
], [C('act3-out', 'zoom', 5.9, 0.6, { direction: 'out', scale: 1.5 })]);

// ---------------------------------------------------------------- act 4 (19.5-25.5 s): real 3D
const act4 = G('act4', 'Act 4 · 3D', 19.5, 6, [
  M('knot', 'Chrome knot', { x: 66, y: 50, w: 40, ratio: 1.1 }, { model: { kind: 'shape', shape: 'knot' }, material: { color: '#b9c3ff', finish: 'chrome' }, alt: '', light: 1.2 },
    { tablet: { x: 64, y: 50, w: 50 }, mobile: { x: 50, y: 36, w: 86 }, clips: [C('kn-in', 'tumble-in', 0, 1.3, { direction: 'in', turn: 160, tilt: -70, scale: 0.3 }), C('kn-spin', 'spin-3d', 1.3, 4.7, { axis: 'y', turns: 0.75 }, 'cruise')] }),
  T('k4', 'Kicker', 'Depth', { x: 26, y: 34 }, KS, { ...KICK, color: VIOLET }, { tablet: { x: 26, y: 32 }, mobile: { x: 50, y: 66 }, clips: [C('k4a-in', 'text-tracking', 0.6, 0.8)] }),
  T('t4a', 'Title', 'Real 3D.', { x: 26, y: 47 }, [7.5, 9, 12], { fontWeight: 900, letterSpacing: -0.02, lineHeight: 0.95 },
    { tablet: { x: 26, y: 46 }, mobile: { x: 50, y: 75 }, clips: [C('t4a-in', 'text-slam', 0.9, 0.8)] }),
  T('t4b', 'Line', 'Text, logos and models on one timeline.', { x: 26, y: 62, w: 32 }, [1.9, 2.6, 4.2], { fontWeight: 500, lineHeight: 1.35, color: MUTED },
    { tablet: { x: 26, y: 62, w: 40 }, mobile: { x: 50, y: 86, w: 84 }, clips: [C('t4b-in', 'text-rise', 1.6, 0.9, { by: 'words', stagger: 0.05 })] }),
], [C('act4-out', 'soft-wipe', 5.3, 0.7, { direction: 'out', from: 'left', feather: 35 })]);

// ---------------------------------------------------------------- act 5 (25.5-31.5 s): AI
const act5 = G('act5', 'Act 5 · Ask', 25.5, 6, [
  T('k5', 'Kicker', 'Ask', { x: 50, y: 20 }, KS, KICK, { mobile: { y: 15 }, clips: [C('k5-in', 'slide', 0, 0.6, { from: 'top', distance: 60 })] }),
  T('t5', 'Title', 'Describe it. Your AI builds it.', { x: 50, y: 34, w: 72 }, [5, 6.4, 9], { fontWeight: 800, letterSpacing: -0.01, lineHeight: 1.05 },
    { tablet: { w: 86 }, mobile: { y: 29, w: 88 }, clips: [C('t5-in', 'text-rise', 0.2, 0.9, { by: 'words', stagger: 0.09 }), C('t5-green', 'recolor', 3.1, 0.6, { to: GREEN })] }),
  S('box5', 'Prompt box', { x: 50, y: 57, w: 54, h: 13 }, { fill: 'rgba(255,255,255,0.05)', stroke: 'rgba(42,211,139,0.55)', strokeWidth: 0.12, radius: 1.4 },
    { tablet: { w: 72, h: 12 }, mobile: { y: 55, w: 88, h: 13 }, clips: [
      C('b5-in', 'turn', 0.9, 0.7, { direction: 'in', axis: 'x', angle: 70 }),
      C('b5-shake', 'shake', 2.7, 0.35, { strength: 2 }),
      C('b5-sheen', 'sheen', 3.1, 0.9),
      C('b5-float', 'float', 3.3, 2.0, { height: 4, cycles: 1 }),
    ] }),
  T('p5', 'Prompt', 'A calm hero for a yoga studio', { x: 50, y: 57 }, [2.2, 3.0, 4.6], { fontWeight: 500, color: INK },
    { mobile: { y: 55 }, clips: [C('p5-type', 'text-typewriter', 1.4, 1.2), C('p5-float', 'float', 3.3, 2.0, { height: 4, cycles: 1 })] }),
  T('s5', 'Line', 'Your own AI, through the free AI Dev Kit.', { x: 50, y: 76, w: 56 }, [1.9, 2.6, 4.4], { fontWeight: 500, lineHeight: 1.3, color: MUTED },
    { tablet: { w: 74 }, mobile: { y: 76, w: 86 }, clips: [C('s5-in', 'wipe', 1.85, 0.7, { from: 'left' })] }),
], [C('act5-out', 'turn', 5.35, 0.65, { direction: 'out', axis: 'x', angle: 80 })]);

// ---------------------------------------------------------------- act 6 (31.5-38 s): the brand
const act6 = G('act6', 'Act 6 · Unyson+', 31.5, 6.5, [
  M('brand3d', 'Unyson+ in 3D', { x: 50, y: 40, w: 56, ratio: 2.9 }, {
    model: { kind: 'text', text: 'Unyson+', depth: 0.34, bevel: 0.5 }, material: { color: GREEN, finish: 'glossy' }, pose: { rx: 6, ry: -12 }, alt: 'Unyson+', light: 1.15,
  }, { tablet: { w: 68 }, mobile: { y: 34, w: 92 }, clips: [C('b3d-push', 'camera-push', 0, 1.4, { direction: 'in', distance: 3.2 }), C('b3d-orbit', 'orbit-3d', 1.4, 4.6, { angle: 34, tilt: 6 })] }),
  S('rule6', 'Underline', { x: 50, y: 58, w: 26, h: 0.5 }, { fill: GREEN },
    { tablet: { w: 36 }, mobile: { y: 52, w: 54, h: 0.6 }, clips: [C('r6-in', 'grow', 1.0, 0.8)] }),
  T('tag6', 'Tagline', 'Free and open source. Built for WordPress.', { x: 50, y: 68, w: 60 }, [2.3, 3.1, 4.8], { fontWeight: 600, lineHeight: 1.3, color: INK },
    { tablet: { w: 78 }, mobile: { y: 64, w: 86 }, clips: [C('t6-in', 'text-rise', 1.2, 0.9, { by: 'words', stagger: 0.06 })] }),
  T('url6', 'Address', 'unysonplus.com', { x: 50, y: 80 }, [1.4, 2.0, 3.6], { fontWeight: 600, letterSpacing: 0.2, color: GREEN },
    { mobile: { y: 80 }, clips: [C('u6-in', 'fade', 2.0, 0.6, { y: 30 }), C('u6-wave', 'text-wave', 3.2, 1.0, { height: 25 })] }),
], [C('act6-out', 'fade', 5.8, 0.7, { direction: 'out', y: 0 })]);

// Scene transitions between acts (the Studio's "Transition to the next group", done here by hand): an
// "out" on the leaving act and an "in" on the next, same start and length. The leaving act's layers lose
// their own exits in the last second (the transition carries them away); the next act starts as the
// transition begins and runs that much longer, so every act still ends where it did.
const isOutClip = (c) => c.params && c.params.direction === 'out';
function transition(A, B, preset, d, params = {}, sounds = {}) {
  const T = Math.round((A.start + A.duration - d) * 100) / 100;
  A.clips = A.clips.filter((c) => !isOutClip(c));
  A.clips.push({ id: `${A.id}-out`, preset, start: T, duration: d, params: { ...params, direction: 'out' }, ...(sounds.out ? { sound: { name: sounds.out } } : {}) });
  const strip = (list, offset) => list.forEach((l) => {
    l.clips = l.clips.filter((c) => !(isOutClip(c) && offset + c.start >= T - 1));
    if (l.layers) strip(l.layers, offset + (l.start || 0));
  });
  strip(A.layers, A.start);
  const shift = T - B.start;
  B.clips = B.clips.filter((c) => !(!isOutClip(c) && c.start <= B.start + 0.05)).map((c) => ({ ...c, start: Math.round((c.start + shift) * 100) / 100 }));
  B.clips.unshift({ id: `${B.id}-in`, preset, start: T, duration: d, params: { ...params, direction: 'in' }, ...(sounds.in ? { sound: { name: sounds.in } } : {}) });
  B.start = T;
  B.duration = Math.round((B.duration - shift) * 100) / 100;
}
transition(act1, act2, 'tr-slash', 0.6, { angle: 25, color: GREEN, glow: true }, { in: 'swish' });
transition(act2, act3, 'tr-zoom', 0.6, { scale: 4, blur: 0.8 }, { in: 'whoosh' });
transition(act3, act4, 'tr-glitch', 0.45, { intensity: 70 }, { in: 'glitch' });
transition(act4, act5, 'tr-whip', 0.45, { from: 'right', distance: 100, blur: 1.2 }, { out: 'whoosh-out', in: 'whoosh' });
transition(act5, act6, 'tr-flash', 0.5, { color: '#ffffff', strength: 90 }, { in: 'impact' });
// The end dips to black before the loop starts again.
act6.clips = act6.clips.map((c) => (c.id === 'act6-out' ? { ...c, preset: 'tr-dip', start: 37.3, duration: 0.7, params: { direction: 'out', color: '#000000' } } : c));

const scene = {
  format: 'unysonplus-scene', version: 1, title: 'Make it move', duration: 38,
  stage: {
    breakpoints: [
      { id: 'desktop', label: 'Desktop', minWidth: 1024, aspect: [16, 9] },
      { id: 'tablet', label: 'Tablet', minWidth: 640, aspect: [4, 3] },
      { id: 'mobile', label: 'Mobile', minWidth: 0, aspect: [4, 5] },
    ],
    heightMode: 'ratio-capped',
    background: 'radial-gradient(120% 90% at 50% 40%, #121a20 0%, #0a0d11 70%)',
    safeArea: 0.06,
    fonts: [{ family: FONT, href: 'https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800;900&display=swap' }],
  },
  playback: { trigger: 'view', loop: true, repeatDelay: 0.4, posterTime: 4 },
  layers: [backdrop, act1, act2, act3, act4, act5, act6],
};
// Built-in sounds on the moments that matter, every one of the 25 used somewhere (the demo shows the whole
// set, as it shows every preset). Each sound rides on its clip and moves with it.
const SOUNDS = {
  'glow-in': { name: 'swell', volume: 0.6 },
  'd-in': { name: 'pop' },
  'c1-in': { name: 'tick' }, 'c2-in': { name: 'tap' }, 'c3-in': { name: 'tick' }, 'c4-in': { name: 'tap' }, 'c5-in': { name: 'tick' }, 'c6-in': { name: 'tap' },
  'k3-in': { name: 'reveal' },
  'b3-in': { name: 'slide' },
  'k5-in': { name: 'beep', volume: 0.7 },
  'b5-in': { name: 'click' },
  't5-green': { name: 'success' },
  'u6-in': { name: 'notify', delay: 0.3, volume: 0.8 },
  'act6-out': { name: 'drop', volume: 0.6 },
  'slit-in': { name: 'swish' },
  'k-in': { name: 'glitch', volume: 0.7 },
  'l2-in': { name: 'impact', at: 'end', delay: -0.15 },
  'k2-in': { name: 'whoosh' },
  'ring-in': { name: 'spin', volume: 0.8 },
  'n3-count': { name: 'typing', volume: 0.6 },
  'n3-pulse': { name: 'soft-pop' },
  'kn-in': { name: 'sub-hit', at: 'end', delay: -0.2 },
  't4a-in': { name: 'thud', at: 'end', delay: -0.1 },
  'p5-type': { name: 'typing', volume: 0.7 },
  'b5-shake': { name: 'thud' },
  'b5-sheen': { name: 'sparkle', delay: 0.3, volume: 0.6 },
  'b3d-push': { name: 'riser' },
  't6-in': { name: 'chime', delay: 0.3 },
  'u6-wave': { name: 'shimmer', volume: 0.7 },
};
const used = new Set();
let sounds = 0;
const walk = (ls) => ls.forEach((l) => {
  l.clips.forEach((c) => { used.add(c.preset); if (SOUNDS[c.id]) { c.sound = SOUNDS[c.id]; sounds++; } });
  if (l.layers) walk(l.layers);
});
walk(scene.layers);
if (sounds !== Object.keys(SOUNDS).length) throw new Error(`sounds: ${sounds} of ${Object.keys(SOUNDS).length} clips found`);
fs.writeFileSync(out, JSON.stringify(scene, null, 2) + '\n');
console.log('written ·', used.size, 'presets used ·', sounds, 'sounds');
