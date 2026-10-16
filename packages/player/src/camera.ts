import type { CameraKey, Scene } from './types';
import type { Timeline } from './presets';
import { easeFunction, resolveEase } from './eases';

/**
 * The scene's camera: one view over every layer that pans, zooms, rolls and tilts in perspective. The
 * layers sit inside a camera element; the camera's keyframes move that element, so the viewer glides
 * through the scene instead of watching things move on a still page. Transition overlays (a flash, a
 * slash) and the safe-area guide sit outside it, fixed to the screen.
 *
 * Keys are per property (a key that sets only "zoom" leaves the pan where it is); each property eases
 * from its previous key with the curve on the key it arrives at. Like every clip, it is seekable.
 */

export const CAMERA_PROPS = ['x', 'y', 'zoom', 'roll', 'tiltX', 'tiltY'] as const;
export type CameraProp = (typeof CAMERA_PROPS)[number];
export type CameraState = Record<CameraProp, number>;
export const CAMERA_REST: CameraState = { x: 0, y: 0, zoom: 1, roll: 0, tiltX: 0, tiltY: 0 };

export const CAMERA_LIMITS: Record<CameraProp, [number, number]> = {
  x: [-100, 100], y: [-100, 100], zoom: [0.2, 8], roll: [-180, 180], tiltX: [-70, 70], tiltY: [-70, 70],
};

/** The default curve for a camera move: an easy start and a soft landing. */
export const CAMERA_EASE = 'softInOut';

/** The camera's value of each property at a time (for editors: the values at the playhead). */
export function cameraAt(keys: CameraKey[] | undefined, time: number): CameraState {
  const out = { ...CAMERA_REST };
  if (!keys?.length) return out;
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  for (const p of CAMERA_PROPS) {
    const ks = sorted.filter((k) => typeof k[p] === 'number');
    if (!ks.length) continue;
    if (time <= ks[0].t) { out[p] = ks[0][p] as number; continue; }
    const next = ks.findIndex((k) => k.t > time);
    if (next < 0) { out[p] = ks[ks.length - 1][p] as number; continue; }
    const a = ks[next - 1];
    const b = ks[next];
    const span = b.t - a.t;
    const f = span > 0 ? (time - a.t) / span : 1;
    const e = easeFunction(b.ease ?? CAMERA_EASE)(f);
    out[p] = (a[p] as number) + ((b[p] as number) - (a[p] as number)) * e;
  }
  return out;
}

/** The camera as a CSS transform for the element that holds the layers. */
export function cameraTransform(s: CameraState): string {
  const parts: string[] = [];
  if (s.zoom !== 1) parts.push(`scale(${s.zoom.toFixed(4)})`);
  if (s.tiltX) parts.push(`rotateX(${s.tiltX.toFixed(3)}deg)`);
  if (s.tiltY) parts.push(`rotateY(${s.tiltY.toFixed(3)}deg)`);
  if (s.roll) parts.push(`rotate(${s.roll.toFixed(3)}deg)`);
  // Panning moves the view: the point (50 + x, 50 + y)% of the stage comes to the centre.
  if (s.x || s.y) parts.push(`translate(${(-s.x).toFixed(3)}%, ${(-s.y).toFixed(3)}%)`);
  return parts.join(' ');
}

export const isRest = (s: CameraState) => CAMERA_PROPS.every((p) => Math.abs(s[p] - CAMERA_REST[p]) < 1e-4);

/**
 * Adds the camera's moves to the timeline, animating `state`; the caller draws it after every update.
 * Returns false when the scene has no camera.
 */
export function buildCamera(tl: Timeline, scene: Scene, state: CameraState): boolean {
  Object.assign(state, CAMERA_REST);
  const keys = scene.camera?.keys;
  if (!keys?.length) return false;
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  for (const p of CAMERA_PROPS) {
    const ks = sorted.filter((k) => typeof k[p] === 'number');
    if (!ks.length) continue;
    // Before its first key a property holds that key's value.
    state[p] = ks[0][p] as number;
    for (let i = 1; i < ks.length; i++) {
      const a = ks[i - 1];
      const b = ks[i];
      const span = b.t - a.t;
      if (span <= 1e-4) continue;
      tl.fromTo(state, { [p]: a[p] }, { [p]: b[p], duration: span, ease: resolveEase(b.ease ?? CAMERA_EASE), immediateRender: false }, a.t);
    }
  }
  return true;
}
