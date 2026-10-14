import type { Anchor, Box, Layer, LayerOverride, Scene, TextStyle } from './types';

/** The elements created for one layer. */
export interface LayerRefs {
  layer: Layer;
  outer: HTMLElement;
  inner: HTMLElement;
  words: HTMLElement[];
  chars: HTMLElement[];
  /** The text the words and chars were built from, so a breakpoint text change can be detected. */
  builtText?: string;
}

const ANCHOR_SHIFT: Record<Anchor, [number, number]> = {
  'top-left': [0, 0], top: [-50, 0], 'top-right': [-100, 0],
  left: [0, -50], center: [-50, -50], right: [-100, -50],
  'bottom-left': [0, -100], bottom: [-50, -100], 'bottom-right': [-100, -100],
};

const FALLBACK_FONTS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function createStage(doc: Document, scene: Scene) {
  const stage = doc.createElement('div');
  stage.className = 'upw-stage';
  if (scene.stage.background) stage.style.background = scene.stage.background;

  const canvas = doc.createElement('div');
  canvas.className = 'upw-canvas';
  stage.appendChild(canvas);

  const safe = doc.createElement('div');
  safe.className = 'upw-safe';
  const s = (scene.stage.safeArea ?? 0.06) * 100;
  Object.assign(safe.style, { left: `${s}%`, right: `${s}%`, top: `${s}%`, bottom: `${s}%` });
  canvas.appendChild(safe);

  return { stage, canvas, safe };
}

export function createLayer(doc: Document, layer: Layer, z: number): LayerRefs {
  const outer = doc.createElement('div');
  outer.className = `upw-layer upw-${layer.type}`;
  outer.dataset.layer = layer.id;
  outer.style.zIndex = String(z);

  const inner = doc.createElement('div');
  inner.className = 'upw-li';
  outer.appendChild(inner);

  const refs: LayerRefs = { layer, outer, inner, words: [], chars: [] };

  if (layer.type === 'shape') {
    if (layer.fill) inner.style.background = layer.fill;
    if (layer.stroke) inner.style.border = `${layer.strokeWidth ?? 0.2}cqw solid ${layer.stroke}`;
    inner.style.borderRadius = layer.shape === 'ellipse' ? '50%' : `${layer.radius ?? 0}cqw`;
    inner.setAttribute('aria-hidden', 'true');
  } else if (layer.type === 'image') {
    const img = doc.createElement('img');
    img.src = layer.src;
    img.alt = layer.alt ?? '';
    img.decoding = 'async';
    img.draggable = false;
    img.style.objectFit = layer.fit ?? 'cover';
    inner.style.borderRadius = `${layer.radius ?? 0}cqw`;
    inner.style.overflow = 'hidden';
    inner.appendChild(img);
  }
  return refs;
}

/**
 * Splits text into words and characters. Screen readers get the plain sentence from a visually hidden
 * copy; the split version is hidden from them, so it is never read out letter by letter.
 */
export function buildText(doc: Document, refs: LayerRefs, text: string) {
  const { inner } = refs;
  inner.textContent = '';
  refs.words = [];
  refs.chars = [];
  refs.builtText = text;

  const sr = doc.createElement('span');
  sr.className = 'upw-sr';
  sr.textContent = text;
  inner.appendChild(sr);

  const vis = doc.createElement('span');
  vis.className = 'upw-txt';
  vis.setAttribute('aria-hidden', 'true');
  inner.appendChild(vis);

  text.split('\n').forEach((line, li) => {
    if (li > 0) vis.appendChild(doc.createElement('br'));
    line.split(/ +/).filter(Boolean).forEach((word, wi) => {
      if (wi > 0) vis.appendChild(doc.createTextNode(' '));
      const w = doc.createElement('span');
      w.className = 'upw-w';
      const wInner = doc.createElement('span');
      wInner.className = 'upw-wi';
      for (const ch of Array.from(word)) {
        const c = doc.createElement('span');
        c.className = 'upw-c';
        c.textContent = ch;
        c.dataset.ch = ch;
        wInner.appendChild(c);
        refs.chars.push(c);
      }
      w.appendChild(wInner);
      vis.appendChild(w);
      refs.words.push(wInner);
    });
  });
}

/** The layer's box, style and text with a breakpoint's overrides merged in. */
export function resolveLayer(layer: Layer, bpId: string | null) {
  const o: LayerOverride = (bpId && layer.overrides?.[bpId]) || {};
  const box: Box = { ...layer.box, ...(o.box ?? {}) };
  const style: TextStyle | undefined = layer.type === 'text' ? { ...layer.style, ...(o.style ?? {}) } : undefined;
  const text = layer.type === 'text' ? (o.text ?? layer.text) : undefined;
  return { box, style, text, hidden: !!o.hidden };
}

/** Applies position, size and type to a layer. Layout only: never touches what the timeline animates. */
export function applyLayout(refs: LayerRefs, bpId: string | null) {
  const { box, style, hidden } = resolveLayer(refs.layer, bpId);
  const { outer, inner } = refs;
  const os = outer.style;

  if (hidden) outer.dataset.hidden = '';
  else delete outer.dataset.hidden;

  os.left = `${box.x}%`;
  os.top = `${box.y}%`;
  os.width = typeof box.w === 'number' ? `${box.w}%` : 'max-content';
  if (typeof box.ratio === 'number' && box.ratio > 0) {
    os.height = '';
    os.aspectRatio = String(box.ratio);
  } else {
    os.aspectRatio = '';
    os.height = typeof box.h === 'number' ? `${box.h}%` : '';
  }
  const [sx, sy] = ANCHOR_SHIFT[box.anchor ?? 'center'];
  os.transform = `translate(${sx}%, ${sy}%)${box.rotate ? ` rotate(${box.rotate}deg)` : ''}`;
  if (typeof refs.layer.opacity === 'number') os.opacity = String(refs.layer.opacity);

  if (style) {
    const is = inner.style;
    is.fontFamily = style.fontFamily ? `"${style.fontFamily.replace(/"/g, '')}", ${FALLBACK_FONTS}` : FALLBACK_FONTS;
    is.fontSize = `${style.fontSize}cqw`;
    is.fontWeight = style.fontWeight ? String(style.fontWeight) : '';
    is.lineHeight = style.lineHeight ? String(style.lineHeight) : '1.05';
    is.letterSpacing = typeof style.letterSpacing === 'number' ? `${style.letterSpacing}em` : '';
    is.color = style.color ?? '';
    is.textAlign = style.align ?? (box.anchor?.endsWith('left') || box.anchor === 'left' ? 'left' : box.anchor?.endsWith('right') || box.anchor === 'right' ? 'right' : 'center');
    is.textTransform = style.uppercase ? 'uppercase' : '';
    is.fontStyle = style.italic ? 'italic' : '';
  }
}
