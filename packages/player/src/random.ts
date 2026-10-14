/**
 * Seeded randomness. Scenes must render the same frame every time they are seeked to the same moment,
 * so presets never call Math.random(): they derive numbers from a seed and an index instead.
 */

/** A repeatable number in [0, 1) for a seed and any number of integer inputs. */
export function hash01(seed: number, ...ints: number[]): number {
  let h = (seed | 0) ^ 0x9e3779b9;
  for (const n of ints) {
    h = Math.imul(h ^ (n | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

/** A stable seed from a string (a clip id, for example). */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
