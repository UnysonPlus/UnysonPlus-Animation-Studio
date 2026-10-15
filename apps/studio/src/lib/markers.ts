import type { Marker, Scene } from '@unysonplus/scene-player/types';

/**
 * Timeline markers: named moments in the scene. In a click-to-advance scene (playback.advance
 * "click") each one is where the presentation stops and waits for a click.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;
const sorted = (list: Marker[]) => [...list].sort((a, b) => a.t - b.t);

export function addMarker(scene: Scene, t: number): Scene {
  const list = scene.markers ?? [];
  const at = r2(Math.max(0, Math.min(scene.duration, t)));
  if (list.some((m) => Math.abs(m.t - at) < 0.02)) return scene;
  let n = list.length + 1;
  while (list.some((m) => m.id === `m${n}`)) n++;
  return { ...scene, markers: sorted([...list, { id: `m${n}`, t: at }]) };
}

export function moveMarker(scene: Scene, id: string, t: number): Scene {
  const at = r2(Math.max(0, Math.min(scene.duration, t)));
  return { ...scene, markers: sorted((scene.markers ?? []).map((m) => (m.id === id ? { ...m, t: at } : m))) };
}

export function removeMarker(scene: Scene, id: string): Scene {
  const markers = (scene.markers ?? []).filter((m) => m.id !== id);
  const next: Scene = { ...scene, markers };
  if (!markers.length) delete next.markers;
  return next;
}
