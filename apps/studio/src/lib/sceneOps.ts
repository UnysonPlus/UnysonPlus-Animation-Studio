import type { Box, Clip, Layer, LayerOverride, Scene, TextStyle } from '@unysonplus/scene-player/types';
import { presetMeta } from '@unysonplus/scene-player/catalog';

/**
 * Pure, immutable edits to a scene. Every editor action goes through one of these, so undo is just
 * keeping the previous scene object.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

function allIds(scene: Scene): Set<string> {
  const ids = new Set<string>();
  for (const l of scene.layers) {
    ids.add(l.id);
    for (const c of l.clips) ids.add(c.id);
  }
  return ids;
}

/** A short id that no layer or clip in the scene uses yet: "text-2", "fade-3"… */
export function uniqueId(scene: Scene, base: string): string {
  const ids = allIds(scene);
  const stem = base.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'item';
  if (!ids.has(stem)) return stem;
  for (let i = 2; ; i++) if (!ids.has(`${stem}-${i}`)) return `${stem}-${i}`;
}

export function mapLayer(scene: Scene, id: string, fn: (l: Layer) => Layer): Scene {
  return { ...scene, layers: scene.layers.map((l) => (l.id === id ? fn(l) : l)) };
}

export function mapClip(scene: Scene, layerId: string, clipId: string, fn: (c: Clip) => Clip): Scene {
  return mapLayer(scene, layerId, (l) => ({ ...l, clips: l.clips.map((c) => (c.id === clipId ? fn(c) : c)) }));
}

export function findLayer(scene: Scene, id: string | null): Layer | undefined {
  return id ? scene.layers.find((l) => l.id === id) : undefined;
}

export function findClip(scene: Scene, layerId: string | null, clipId: string | null): Clip | undefined {
  return findLayer(scene, layerId)?.clips.find((c) => c.id === clipId);
}

/** The widest breakpoint: editing while it is showing changes the base layout. */
export const primaryBreakpoint = (scene: Scene) => scene.stage.breakpoints[0]?.id ?? null;

/** True when edits made at this breakpoint go into an override rather than the base layout. */
export function editsOverride(scene: Scene, layer: Layer, bp: string | null): boolean {
  if (!bp) return false;
  return bp !== primaryBreakpoint(scene) || !!layer.overrides?.[bp];
}

export interface LayoutPatch {
  box?: Partial<Box>;
  style?: Partial<TextStyle>;
  text?: string;
}

/**
 * Writes position, size, type or text for the breakpoint being edited: into the base layout at the
 * widest breakpoint, into that breakpoint's override everywhere else.
 */
export function writeLayout(scene: Scene, layerId: string, bp: string | null, patch: LayoutPatch): Scene {
  return mapLayer(scene, layerId, (layer) => {
    if (!editsOverride(scene, layer, bp)) {
      const next = { ...layer, box: { ...layer.box, ...(patch.box ?? {}) } } as Layer;
      if (next.type === 'text') {
        if (patch.style) next.style = { ...next.style, ...patch.style };
        if (patch.text !== undefined) next.text = patch.text;
      }
      return next;
    }
    const prev: LayerOverride = layer.overrides?.[bp!] ?? {};
    const o: LayerOverride = { ...prev };
    if (patch.box) o.box = { ...(prev.box ?? {}), ...patch.box };
    if (patch.style && layer.type === 'text') o.style = { ...(prev.style ?? {}), ...patch.style };
    if (patch.text !== undefined && layer.type === 'text') o.text = patch.text;
    return { ...layer, overrides: { ...(layer.overrides ?? {}), [bp!]: o } };
  });
}

export function clearOverride(scene: Scene, layerId: string, bp: string): Scene {
  return mapLayer(scene, layerId, (layer) => {
    if (!layer.overrides?.[bp]) return layer;
    const { [bp]: _gone, ...rest } = layer.overrides;
    return { ...layer, overrides: Object.keys(rest).length ? rest : undefined };
  });
}

/** Base properties that never vary by breakpoint (name, timing, fill, image source…). */
export function setLayerProps(scene: Scene, layerId: string, props: Record<string, unknown>): Scene {
  return mapLayer(scene, layerId, (l) => {
    const next = { ...l, ...props } as Record<string, unknown>;
    for (const [k, v] of Object.entries(props)) if (v === undefined) delete next[k];
    return next as unknown as Layer;
  });
}

export function addLayer(scene: Scene, type: Layer['type'], extra: Partial<Layer> = {}): { scene: Scene; id: string } {
  const id = uniqueId(scene, type === 'text' ? 'text' : type === 'shape' ? 'shape' : 'image');
  let layer: Layer;
  if (type === 'text') {
    layer = {
      id, type: 'text', name: 'Text', text: 'Your headline',
      style: { fontFamily: scene.stage.fonts?.[0]?.family, fontSize: 6, fontWeight: 800, color: '#f4f6f8' },
      box: { x: 50, y: 50 }, clips: [],
    };
  } else if (type === 'shape') {
    layer = { id, type: 'shape', name: 'Shape', shape: 'rect', fill: '#2ad38b', radius: 1, box: { x: 50, y: 50, w: 20, h: 20 }, clips: [] };
  } else {
    layer = { id, type: 'image', name: 'Image', src: '', alt: '', fit: 'cover', radius: 1, box: { x: 50, y: 50, w: 30, ratio: 1.5 }, clips: [] };
  }
  layer = { ...layer, ...extra, id } as Layer;
  return { scene: { ...scene, layers: [...scene.layers, layer] }, id };
}

export function removeLayer(scene: Scene, id: string): Scene {
  return { ...scene, layers: scene.layers.filter((l) => l.id !== id) };
}

export function duplicateLayer(scene: Scene, id: string): { scene: Scene; id: string } {
  const idx = scene.layers.findIndex((l) => l.id === id);
  if (idx < 0) return { scene, id };
  const src = scene.layers[idx];
  const taken = allIds(scene);
  const fresh = (base: string) => {
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    const out = `${base}-${n}`;
    taken.add(out);
    return out;
  };
  const copy: Layer = JSON.parse(JSON.stringify(src));
  copy.id = fresh(src.id);
  copy.name = `${src.name || src.id} copy`;
  copy.box = { ...copy.box, x: r2(copy.box.x + 2), y: r2(copy.box.y + 2) };
  // Clip ids are unique across the whole scene, so the copies get fresh ones.
  copy.clips = copy.clips.map((c) => ({ ...c, id: fresh(c.id) }));
  const layers = [...scene.layers];
  layers.splice(idx + 1, 0, copy);
  return { scene: { ...scene, layers }, id: copy.id };
}

/** Moves a layer one step up (drawn later, on top) or down the stack. */
export function moveLayer(scene: Scene, id: string, dir: 1 | -1): Scene {
  const layers = [...scene.layers];
  const i = layers.findIndex((l) => l.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= layers.length) return scene;
  [layers[i], layers[j]] = [layers[j], layers[i]];
  return { ...scene, layers };
}

export function addClip(scene: Scene, layerId: string, presetId: string, at: number): { scene: Scene; id: string } | null {
  const meta = presetMeta[presetId];
  const layer = findLayer(scene, layerId);
  if (!meta || !layer || !meta.appliesTo.includes(layer.type)) return null;
  const duration = Math.min(meta.defaultDuration, scene.duration);
  const start = r2(Math.max(0, Math.min(at, scene.duration - duration)));
  const id = uniqueId(scene, presetId.replace(/^text-/, ''));
  const clip: Clip = { id, preset: presetId, start, duration: r2(duration) };
  if (presetId === 'keyframes') clip.params = { frames: [{ t: 0, scale: 1 }, { t: r2(duration), scale: 1.1 }] };
  return { scene: mapLayer(scene, layerId, (l) => ({ ...l, clips: [...l.clips, clip] })), id };
}

export function removeClip(scene: Scene, layerId: string, clipId: string): Scene {
  return mapLayer(scene, layerId, (l) => ({ ...l, clips: l.clips.filter((c) => c.id !== clipId) }));
}

export function setClip(scene: Scene, layerId: string, clipId: string, props: Partial<Clip>): Scene {
  return mapClip(scene, layerId, clipId, (c) => {
    const next = { ...c, ...props } as Record<string, unknown>;
    for (const [k, v] of Object.entries(props)) if (v === undefined) delete next[k];
    return next as unknown as Clip;
  });
}

export function setClipParam(scene: Scene, layerId: string, clipId: string, key: string, value: unknown): Scene {
  return mapClip(scene, layerId, clipId, (c) => ({ ...c, params: { ...(c.params ?? {}), [key]: value } }));
}

export const roundTime = r2;
