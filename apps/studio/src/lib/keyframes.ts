import type { Clip, Layer, Scene } from '@unysonplus/scene-player/types';
import { easeFunction } from '@unysonplus/scene-player/eases';
import { defaultEaseFor, presetMeta } from '@unysonplus/scene-player/catalog';
import { mapLayer } from './sceneOps';

/**
 * Keyframes clips: one list of keyframes, each setting any of six properties at a moment in the clip.
 * Each property is its own track (it moves between the keyframes that set it), and a keyframe's
 * "ease" shapes the move into it. These helpers keep the list sorted by time, so a keyframe's index
 * is its place in time.
 */

export type PropKey = 'x' | 'y' | 'scale' | 'rotate' | 'opacity' | 'blur';
export interface Keyframe {
  t: number;
  x?: number;
  y?: number;
  scale?: number;
  rotate?: number;
  opacity?: number;
  blur?: number;
  ease?: string;
}

export const PROPS: Array<{ key: PropKey; label: string; unit: string; rest: number; step: number; min?: number; max?: number }> = [
  { key: 'x', label: 'Move X', unit: '%', rest: 0, step: 1 },
  { key: 'y', label: 'Move Y', unit: '%', rest: 0, step: 1 },
  { key: 'scale', label: 'Scale', unit: '×', rest: 1, step: 0.05, min: 0 },
  { key: 'rotate', label: 'Rotate', unit: '°', rest: 0, step: 1 },
  { key: 'opacity', label: 'Opacity', unit: '', rest: 1, step: 0.05, min: 0, max: 1 },
  { key: 'blur', label: 'Blur', unit: '', rest: 0, step: 0.1, min: 0 },
];

/** Two keyframes closer than this (seconds) are the same moment. */
export const SAME_MOMENT = 1 / 60;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export const isKeyframes = (c: Clip | null | undefined): c is Clip => !!c && c.preset === 'keyframes';

export function framesOf(clip: Clip): Keyframe[] {
  const raw = Array.isArray(clip.params?.frames) ? (clip.params!.frames as Keyframe[]) : [];
  return raw.filter((f) => f && typeof f.t === 'number').slice().sort((a, b) => a.t - b.t);
}

/** The clip's own ease, used for any keyframe that doesn't set one. */
export function clipEase(clip: Clip): string {
  const meta = presetMeta[clip.preset];
  return clip.ease ?? (meta ? defaultEaseFor(meta, clip.params) : 'none');
}

/** The value a property has at time t (seconds into the clip), or undefined if no keyframe sets it. */
export function valueAt(frames: Keyframe[], key: PropKey, t: number, fallbackEase: string): number | undefined {
  const keyed = frames.filter((f) => typeof f[key] === 'number');
  if (!keyed.length) return undefined;
  if (t <= keyed[0].t) return keyed[0][key];
  const last = keyed[keyed.length - 1];
  if (t >= last.t) return last[key];
  const i = keyed.findIndex((f) => f.t > t);
  const a = keyed[i - 1];
  const b = keyed[i];
  const p = easeFunction(b.ease ?? fallbackEase)((t - a.t) / (b.t - a.t));
  return (a[key] as number) + ((b[key] as number) - (a[key] as number)) * p;
}

/** Index of the keyframe at time t, if there is one. */
export const keyAt = (frames: Keyframe[], t: number) => frames.findIndex((f) => Math.abs(f.t - t) < SAME_MOMENT);

/** Sets values at time t: changes the keyframe there, or adds one. Returns the list and that keyframe's index. */
export function setKey(frames: Keyframe[], t: number, values: Partial<Keyframe>): { frames: Keyframe[]; index: number } {
  const at = keyAt(frames, t);
  const next = frames.map((f) => ({ ...f }));
  let target: Keyframe;
  if (at >= 0) {
    target = next[at];
    Object.assign(target, values);
  } else {
    target = { t: r3(t), ...values };
    next.push(target);
  }
  for (const k of Object.keys(values) as Array<keyof Keyframe>) if (values[k] === undefined) delete target[k];
  next.sort((a, b) => a.t - b.t);
  return { frames: next, index: next.indexOf(target) };
}

/** Moves a keyframe to a new time inside the clip. Returns its new index. */
export function moveKey(frames: Keyframe[], index: number, t: number, duration: number): { frames: Keyframe[]; index: number } {
  const next = frames.map((f) => ({ ...f }));
  const target = next[index];
  if (!target) return { frames, index };
  target.t = r3(Math.max(0, Math.min(duration, t)));
  next.sort((a, b) => a.t - b.t);
  return { frames: next, index: next.indexOf(target) };
}

export const removeKey = (frames: Keyframe[], index: number) => frames.filter((_, i) => i !== index);

/** Writes a clip's keyframes back into the scene. */
export function writeFrames(scene: Scene, layerId: string, clipId: string, frames: Keyframe[]): Scene {
  return mapLayer(scene, layerId, (l: Layer) => ({
    ...l,
    clips: l.clips.map((c) => (c.id === clipId ? { ...c, params: { ...(c.params ?? {}), frames } } : c)),
  }));
}

/** The keyframes clip on a layer that covers time t (scene time inside the layer's container), if any. */
export function keyframesClipAt(layer: Layer, t: number): Clip | undefined {
  return layer.clips.find((c) => isKeyframes(c) && t >= c.start - 1e-6 && t <= c.start + c.duration + 1e-6);
}
