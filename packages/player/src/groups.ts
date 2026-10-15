import type { GroupLayer, Layer, Scene } from './types';

/**
 * Group helpers shared by the player and the editor. Free of the animation engine, so the Studio can
 * use them without loading GSAP.
 */

/** Every layer in the scene, groups and their contents included, depth first. */
export function allLayers(layers: Layer[]): Layer[] {
  const out: Layer[] = [];
  const walk = (list: Layer[]) => {
    for (const l of list) {
      out.push(l);
      if (l.type === 'group') walk(l.layers);
    }
  };
  walk(layers);
  return out;
}

/** The latest moment anything in a list of layers happens, in their own time. */
function lastMoment(layers: Layer[]): number {
  let end = 0;
  for (const l of layers) {
    for (const c of l.clips) end = Math.max(end, c.start + c.duration);
    if (typeof l.end === 'number') end = Math.max(end, l.end);
    if (l.type === 'group') end = Math.max(end, (l.start ?? 0) + groupDuration(l));
  }
  return end;
}

/** A group's timeline length: its own setting, or the end of its last clip (at least 0.1 s). */
export function groupDuration(group: GroupLayer): number {
  if (typeof group.duration === 'number' && group.duration > 0) return group.duration;
  return Math.max(0.1, lastMoment(group.layers));
}

/** The chain of groups from the top of the scene down to (not including) a layer. */
export function groupPath(scene: Scene, id: string): GroupLayer[] {
  const find = (list: Layer[], trail: GroupLayer[]): GroupLayer[] | null => {
    for (const l of list) {
      if (l.id === id) return trail;
      if (l.type === 'group') {
        const r = find(l.layers, [...trail, l]);
        if (r) return r;
      }
    }
    return null;
  };
  return find(scene.layers, []) ?? [];
}

/** Where a group's own time 0 falls in the scene's time (the sum of the starts above and of itself). */
export function groupOffset(scene: Scene, groupId: string): number {
  const path = groupPath(scene, groupId);
  const self = allLayers(scene.layers).find((l) => l.id === groupId);
  return [...path, ...(self ? [self] : [])].reduce((t, g) => t + (g.start ?? 0), 0);
}
