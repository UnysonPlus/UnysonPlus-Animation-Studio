import type { Layer } from '../types';
import { EXIT_EASE } from '../eases';

/**
 * The preset catalogue: everything about a preset except the animation code. Kept free of the
 * animation engine so the validator and the editor (library, inspector forms) can use it without
 * loading GSAP. presets/index.ts supplies the build function for every id listed here.
 */

export type PresetCategory = 'text' | 'reveal' | 'motion' | 'emphasis';

export const CATEGORY_LABELS: Record<PresetCategory, string> = {
  text: 'Text',
  reveal: 'Reveal and exit',
  motion: 'Move and scale',
  emphasis: 'Emphasis',
};

export type PresetField =
  | { key: string; label: string; type: 'number'; min?: number; max?: number; step?: number; unit?: string }
  | { key: string; label: string; type: 'select'; options: Array<{ value: string; label: string }> }
  | { key: string; label: string; type: 'boolean' }
  | { key: string; label: string; type: 'text' }
  | { key: string; label: string; type: 'color' }
  | { key: string; label: string; type: 'code' };

export interface PresetMeta {
  id: string;
  label: string;
  description: string;
  category: PresetCategory;
  appliesTo: Array<Layer['type']>;
  defaultEase: string;
  /** Seconds, used when the preset is dropped on the timeline. */
  defaultDuration: number;
  defaults: Record<string, unknown>;
  fields: PresetField[];
  /** Left out of what the AI may use (the AI writes data, never code). */
  aiExcluded?: boolean;
}

const DIRECTION: PresetField = {
  key: 'direction', label: 'Direction', type: 'select',
  options: [{ value: 'in', label: 'In' }, { value: 'out', label: 'Out' }],
};
const STAGGER: PresetField = { key: 'stagger', label: 'Stagger', type: 'number', min: 0, max: 1, step: 0.005, unit: 's' };
const RHYTHM: PresetField = {
  key: 'rhythm', label: 'Rhythm', type: 'select',
  options: [{ value: 'natural', label: 'Natural (uneven gaps)' }, { value: 'even', label: 'Even' }],
};
const BY: PresetField = {
  key: 'by', label: 'Animate by', type: 'select',
  options: [{ value: 'chars', label: 'Letter' }, { value: 'words', label: 'Word' }],
};
const SIDE: PresetField = {
  key: 'from', label: 'From', type: 'select',
  options: [
    { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' },
    { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' },
  ],
};
// Presets that animate the layer as a whole also work on a group (its frame).
const ALL: PresetMeta['appliesTo'] = ['text', 'shape', 'image', 'group'];

export const PRESET_CATALOG: PresetMeta[] = [
  // ---- Text ----
  {
    id: 'text-rise', label: 'Rise', category: 'text', appliesTo: ['text'],
    description: 'Letters or words rise into place one after another, from behind an invisible mask.',
    defaultEase: 'power4.out', defaultDuration: 0.9,
    defaults: { direction: 'in', by: 'chars', stagger: 0.03, rhythm: 'natural', distance: 130, mask: true },
    fields: [DIRECTION, BY, STAGGER, RHYTHM, { key: 'distance', label: 'Distance', type: 'number', min: 0, max: 400, step: 5, unit: '%' }, { key: 'mask', label: 'Mask', type: 'boolean' }],
  },
  {
    id: 'text-slam', label: 'Slam', category: 'text', appliesTo: ALL,
    description: 'Lands from a large, blurred scale, as if thrown at the screen.',
    defaultEase: 'expo.out', defaultDuration: 0.8,
    defaults: { direction: 'in', scale: 2.4, blur: 1.2 },
    fields: [DIRECTION, { key: 'scale', label: 'Start scale', type: 'number', min: 1, max: 8, step: 0.1 }, { key: 'blur', label: 'Blur', type: 'number', min: 0, max: 5, step: 0.1 }],
  },
  {
    id: 'text-stretch', label: 'Stretch', category: 'text', appliesTo: ['text'],
    description: 'Letters grow out of a line, squashed, then spring to full size.',
    defaultEase: 'expo.out', defaultDuration: 0.9,
    defaults: { direction: 'in', axis: 'y', stagger: 0.04, rhythm: 'natural', squash: 1.8 },
    fields: [DIRECTION, { key: 'axis', label: 'Axis', type: 'select', options: [{ value: 'y', label: 'Vertical' }, { value: 'x', label: 'Horizontal' }] }, STAGGER, RHYTHM, { key: 'squash', label: 'Squash', type: 'number', min: 1, max: 4, step: 0.1 }],
  },
  {
    id: 'text-scramble', label: 'Scramble', category: 'text', appliesTo: ['text'],
    description: 'Letters flicker through random characters and settle on the real text, left to right.',
    defaultEase: 'none', defaultDuration: 1.1,
    defaults: { charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/', fps: 24 },
    fields: [{ key: 'charset', label: 'Characters', type: 'text' }, { key: 'fps', label: 'Flicker rate', type: 'number', min: 1, max: 60, step: 1, unit: '/s' }],
  },
  {
    id: 'text-typewriter', label: 'Typewriter', category: 'text', appliesTo: ['text'],
    description: 'Letters appear one at a time, as if being typed.',
    defaultEase: 'none', defaultDuration: 1.2,
    defaults: { direction: 'in' },
    fields: [DIRECTION],
  },
  {
    id: 'text-blur', label: 'Blur in', category: 'text', appliesTo: ['text'],
    description: 'Letters or words sharpen out of a soft blur, one after another.',
    defaultEase: 'power2.out', defaultDuration: 1,
    defaults: { direction: 'in', by: 'chars', stagger: 0.03, rhythm: 'natural', blur: 0.8 },
    fields: [DIRECTION, BY, STAGGER, RHYTHM, { key: 'blur', label: 'Blur', type: 'number', min: 0, max: 4, step: 0.1 }],
  },
  {
    id: 'text-flip', label: 'Flip', category: 'text', appliesTo: ['text'],
    description: 'Letters or words flip up into place in 3D, like a departure board.',
    defaultEase: 'power3.out', defaultDuration: 0.9,
    defaults: { direction: 'in', by: 'chars', stagger: 0.04, rhythm: 'natural' },
    fields: [DIRECTION, BY, STAGGER, RHYTHM],
  },
  {
    id: 'text-tracking', label: 'Tracking', category: 'text', appliesTo: ['text'],
    description: 'Letter spacing opens out (or closes in) as the text fades in.',
    defaultEase: 'power3.out', defaultDuration: 1.2,
    defaults: { direction: 'in', from: -0.4 },
    fields: [DIRECTION, { key: 'from', label: 'Start spacing', type: 'number', min: -1, max: 2, step: 0.05, unit: 'em' }],
  },
  {
    id: 'text-wave', label: 'Wave', category: 'emphasis', appliesTo: ['text'],
    description: 'A ripple runs through the letters: each one hops and settles.',
    defaultEase: 'sine.inOut', defaultDuration: 1,
    defaults: { height: 30, stagger: 0.05, rhythm: 'natural' },
    fields: [{ key: 'height', label: 'Height', type: 'number', min: 0, max: 200, step: 5, unit: '%' }, STAGGER, RHYTHM],
  },
  // ---- Reveal and exit ----
  {
    id: 'fade', label: 'Fade', category: 'reveal', appliesTo: ALL,
    description: 'Fades in or out with a small drift, optionally scaling or blurring as it goes.',
    defaultEase: 'softLand', defaultDuration: 0.5,
    defaults: { direction: 'in', x: 0, y: 12, scale: 1, blur: 0 },
    fields: [DIRECTION, { key: 'x', label: 'Drift X', type: 'number', min: -200, max: 200, step: 5, unit: '%' }, { key: 'y', label: 'Drift Y', type: 'number', min: -200, max: 200, step: 5, unit: '%' }, { key: 'scale', label: 'Scale', type: 'number', min: 0, max: 4, step: 0.05 }, { key: 'blur', label: 'Blur', type: 'number', min: 0, max: 5, step: 0.1 }],
  },
  {
    id: 'wipe', label: 'Wipe', category: 'reveal', appliesTo: ALL,
    description: 'Reveals or hides behind a straight edge sweeping across.',
    defaultEase: 'power3.inOut', defaultDuration: 0.8,
    defaults: { direction: 'in', from: 'left' },
    fields: [DIRECTION, { ...SIDE, options: [...(SIDE as { options: Array<{ value: string; label: string }> }).options, { value: 'center', label: 'Centre' }] }],
  },
  {
    id: 'iris', label: 'Iris', category: 'reveal', appliesTo: ALL,
    description: 'Opens (or closes) through a growing circle.',
    defaultEase: 'power3.inOut', defaultDuration: 0.9,
    defaults: { direction: 'in', x: 50, y: 50 },
    fields: [DIRECTION, { key: 'x', label: 'Centre X', type: 'number', min: 0, max: 100, step: 1, unit: '%' }, { key: 'y', label: 'Centre Y', type: 'number', min: 0, max: 100, step: 1, unit: '%' }],
  },
  {
    id: 'slide', label: 'Slide', category: 'reveal', appliesTo: ALL,
    description: 'Slides in from a side (or out to one) while fading.',
    defaultEase: 'softLand', defaultDuration: 0.6,
    defaults: { direction: 'in', from: 'bottom', distance: 60 },
    fields: [DIRECTION, SIDE, { key: 'distance', label: 'Distance', type: 'number', min: 0, max: 400, step: 5, unit: '%' }],
  },
  {
    id: 'grow', label: 'Grow', category: 'reveal', appliesTo: ALL,
    description: 'Draws out from one edge or the centre. Made for lines and bars.',
    defaultEase: 'expo.inOut', defaultDuration: 0.9,
    defaults: { direction: 'in', axis: 'x', origin: 'center' },
    fields: [DIRECTION, { key: 'axis', label: 'Axis', type: 'select', options: [{ value: 'x', label: 'Horizontal' }, { value: 'y', label: 'Vertical' }] }, { key: 'origin', label: 'From', type: 'select', options: [{ value: 'start', label: 'Start' }, { value: 'center', label: 'Centre' }, { value: 'end', label: 'End' }] }],
  },
  // ---- Move and scale ----
  {
    id: 'pop', label: 'Pop', category: 'motion', appliesTo: ALL,
    description: 'Scales up into place with a little overshoot (or down and away).',
    defaultEase: 'popOver', defaultDuration: 0.5,
    defaults: { direction: 'in', from: 0.5 },
    fields: [DIRECTION, { key: 'from', label: 'Start scale', type: 'number', min: 0, max: 1, step: 0.05 }],
  },
  {
    id: 'zoom', label: 'Zoom', category: 'motion', appliesTo: ALL,
    description: 'Eases in from smaller (or larger) with a fade, no overshoot. A start scale above 1 lands it from close up.',
    defaultEase: 'softLand', defaultDuration: 0.6,
    defaults: { direction: 'in', scale: 0.7 },
    fields: [DIRECTION, { key: 'scale', label: 'Start scale', type: 'number', min: 0, max: 4, step: 0.05 }],
  },
  {
    id: 'spin', label: 'Spin', category: 'motion', appliesTo: ALL,
    description: 'Turns into place while scaling up.',
    defaultEase: 'expo.out', defaultDuration: 0.9,
    defaults: { direction: 'in', turns: 0.5 },
    fields: [DIRECTION, { key: 'turns', label: 'Turns', type: 'number', min: -4, max: 4, step: 0.25 }],
  },
  {
    id: 'keyframes', label: 'Keyframes', category: 'motion', appliesTo: ALL,
    description: 'Hand-set values at moments within the clip: position, scale, rotation, opacity and blur.',
    defaultEase: 'power2.inOut', defaultDuration: 2,
    defaults: { frames: [{ t: 0, scale: 1 }, { t: 2, scale: 1.1 }] },
    fields: [],
  },
  // ---- Emphasis ----
  {
    id: 'pulse', label: 'Pulse', category: 'emphasis', appliesTo: ALL,
    description: 'Swells and settles, a set number of times.',
    defaultEase: 'sine.inOut', defaultDuration: 1.2,
    defaults: { scale: 1.12, times: 2 },
    fields: [{ key: 'scale', label: 'Scale', type: 'number', min: 1, max: 2, step: 0.01 }, { key: 'times', label: 'Times', type: 'number', min: 1, max: 12, step: 1 }],
  },
  {
    id: 'shake', label: 'Shake', category: 'emphasis', appliesTo: ALL,
    description: 'A quick, jittery side-to-side shake that dies away.',
    defaultEase: 'none', defaultDuration: 0.6,
    defaults: { strength: 6 },
    fields: [{ key: 'strength', label: 'Strength', type: 'number', min: 0, max: 40, step: 1, unit: '%' }],
  },
  {
    id: 'float', label: 'Float', category: 'emphasis', appliesTo: ALL,
    description: 'Drifts gently up and down, like it is floating.',
    defaultEase: 'sine.inOut', defaultDuration: 3,
    defaults: { height: 6, cycles: 1 },
    fields: [{ key: 'height', label: 'Height', type: 'number', min: 0, max: 100, step: 1, unit: '%' }, { key: 'cycles', label: 'Cycles', type: 'number', min: 1, max: 10, step: 1 }],
  },
  {
    id: 'recolor', label: 'Recolour', category: 'emphasis', appliesTo: ['text', 'shape'],
    description: 'Changes the text colour, or a shape’s solid fill, to a new colour.',
    defaultEase: 'power2.inOut', defaultDuration: 0.6,
    defaults: { to: '#ffffff' },
    fields: [{ key: 'to', label: 'Colour', type: 'color' }],
  },
  {
    id: 'code', label: 'Custom code', category: 'motion', appliesTo: ALL,
    description: 'Your own GSAP code, for an effect no preset covers. It only runs where the page allows custom code (the Studio, downloaded pages and embeds; in WordPress, pages by authors trusted with unfiltered HTML).',
    defaultEase: 'none', defaultDuration: 1,
    defaults: { code: "tl.fromTo(el, { rotation: 0 }, { rotation: 360, duration: duration, ease: 'power2.inOut' }, at);" },
    fields: [{ key: 'code', label: 'Code', type: 'code' }],
    aiExcluded: true,
  },
];

export const PRESET_IDS = PRESET_CATALOG.map((p) => p.id);

/**
 * The ease a clip uses when it doesn't set one. Exits default to the leaving curve, which speeds up
 * out of frame: an exit is new motion, not the entrance played backwards.
 */
export function defaultEaseFor(meta: PresetMeta, params?: Record<string, unknown>): string {
  const dir = params && 'direction' in params ? params.direction : meta.defaults.direction;
  return dir === 'out' && meta.fields.some((f) => f.key === 'direction') ? EXIT_EASE : meta.defaultEase;
}
export const presetMeta: Record<string, PresetMeta> = Object.fromEntries(PRESET_CATALOG.map((p) => [p.id, p]));
