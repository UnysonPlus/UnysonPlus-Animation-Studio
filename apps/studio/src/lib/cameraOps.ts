import type { CameraKey, Scene } from '@unysonplus/scene-player/types';
import { CAMERA_PROPS, CAMERA_REST, cameraAt, type CameraProp } from '@unysonplus/scene-player/camera';

/** Editing the scene's camera: keys on its own timeline row, and ready-made moves. */

const r2 = (v: number) => Math.round(v * 100) / 100;

export const cameraKeys = (scene: Scene): CameraKey[] => [...(scene.camera?.keys ?? [])].sort((a, b) => a.t - b.t);

function withKeys(scene: Scene, keys: CameraKey[]): Scene {
  const next = { ...scene };
  if (keys.length) next.camera = { keys: [...keys].sort((a, b) => a.t - b.t) };
  else delete next.camera;
  return next;
}

function freshId(keys: CameraKey[]): string {
  let n = keys.length + 1;
  while (keys.some((k) => k.id === `cam${n}`)) n++;
  return `cam${n}`;
}

/** Only what differs from a still camera, rounded. */
function clean(values: Partial<Record<CameraProp, number>>): Partial<Record<CameraProp, number>> {
  const out: Partial<Record<CameraProp, number>> = {};
  for (const p of CAMERA_PROPS) if (typeof values[p] === 'number') out[p] = p === 'zoom' ? Math.round(values[p]! * 1000) / 1000 : r2(values[p]!);
  return out;
}

/** A key at a time holding the camera's current view there (so adding a key never jumps). */
export function addCameraKey(scene: Scene, t: number): { scene: Scene; id: string } {
  const keys = cameraKeys(scene);
  const at = r2(Math.max(0, Math.min(scene.duration, t)));
  const existing = keys.find((k) => Math.abs(k.t - at) < 0.01);
  if (existing) return { scene, id: existing.id };
  const id = freshId(keys);
  const view = cameraAt(keys, at);
  return { scene: withKeys(scene, [...keys, { id, t: at, ...clean(view) }]), id };
}

export function setCameraKey(scene: Scene, id: string, patch: Partial<CameraKey>): Scene {
  return withKeys(scene, cameraKeys(scene).map((k) => {
    if (k.id !== id) return k;
    const next = { ...k, ...patch } as CameraKey & Record<string, unknown>;
    for (const [key, v] of Object.entries(patch)) if (v === undefined) delete next[key];
    if (typeof next.t === 'number') next.t = r2(Math.max(0, Math.min(scene.duration, next.t)));
    return next as CameraKey;
  }));
}

export const removeCameraKey = (scene: Scene, id: string): Scene => withKeys(scene, cameraKeys(scene).filter((k) => k.id !== id));

export type CameraMove = 'push' | 'pull' | 'pan-right' | 'pan-left' | 'tilt-reveal' | 'drift' | 'roll';

export const CAMERA_MOVES: Array<{ id: CameraMove; label: string; hint: string }> = [
  { id: 'push', label: 'Push in', hint: 'Moves closer: draws the eye into the scene.' },
  { id: 'pull', label: 'Pull out', hint: 'Moves back to reveal the whole picture.' },
  { id: 'pan-right', label: 'Pan right', hint: 'Glides to the right, to the next thing on the stage.' },
  { id: 'pan-left', label: 'Pan left', hint: 'Glides to the left.' },
  { id: 'tilt-reveal', label: 'Tilt reveal', hint: 'Starts tilted back in perspective and settles flat, landing on the frame.' },
  { id: 'drift', label: 'Slow drift', hint: 'A slow push and slight turn that keeps a held frame alive.' },
  { id: 'roll', label: 'Dutch roll', hint: 'Rolls the view a few degrees for tension, then back.' },
];

/** A ready-made move from the playhead: two keys (from the current view to the move's end). */
export function addCameraMove(scene: Scene, t: number, move: CameraMove, length: number): { scene: Scene; ids: string[] } {
  const keys = cameraKeys(scene);
  const t0 = r2(Math.max(0, Math.min(scene.duration - 0.2, t)));
  const t1 = r2(Math.min(scene.duration, t0 + Math.max(0.2, length)));
  const from = cameraAt(keys, t0);
  const to: Partial<Record<CameraProp, number>> = { ...from };
  const start: Partial<Record<CameraProp, number>> = { ...from };
  let ease: string | undefined;
  switch (move) {
    case 'push': to.zoom = Math.min(8, from.zoom * 1.35); break;
    case 'pull': start.zoom = Math.min(8, Math.max(from.zoom, 1) * 1.4); to.zoom = Math.max(from.zoom, 1); break;
    case 'pan-right': to.x = Math.min(100, from.x + 20); break;
    case 'pan-left': to.x = Math.max(-100, from.x - 20); break;
    case 'tilt-reveal': start.tiltX = 28; start.zoom = from.zoom * 1.15; to.tiltX = 0; to.zoom = from.zoom; ease = 'softLand'; break;
    case 'drift': to.zoom = from.zoom * 1.08; to.tiltY = from.tiltY + 4; ease = 'none'; break;
    case 'roll': to.roll = from.roll + 6; break;
  }
  // Keys strictly inside the move's span would fight it: the move replaces them.
  const kept = keys.filter((k) => k.t < t0 - 0.01 || k.t > t1 + 0.01);
  const idA = freshId(kept);
  const a: CameraKey = { id: idA, t: t0, ...clean(start) };
  const idB = freshId([...kept, a]);
  const b: CameraKey = { id: idB, t: t1, ...clean(to), ...(ease ? { ease } : {}) };
  const out = withKeys(scene, [...kept, a, b]);
  // A roll comes back: a third key returns it after the same length.
  if (move === 'roll' && t1 + length <= scene.duration) {
    const idC = freshId([...kept, a, b]);
    return { scene: withKeys(out, [...cameraKeys(out), { id: idC, t: r2(t1 + length), ...clean({ ...to, roll: from.roll }) }]), ids: [idA, idB, idC] };
  }
  return { scene: out, ids: [idA, idB] };
}

export const CAMERA_REST_VALUES = CAMERA_REST;
