export * from './types';
export { validateScene, type ValidationResult } from './validate';
export { mount, type MountOptions, type ScenePlayer, type PlayerEvent, type LayerLayout } from './player';
export { presets, type PresetDefinition } from './presets';
export { PRESET_CATALOG, PRESET_IDS, presetMeta, CATEGORY_LABELS, type PresetMeta, type PresetField, type PresetCategory } from './presets/catalog';
export { autoMount } from './auto';

export const PLAYER_VERSION = __PLAYER_VERSION__;
