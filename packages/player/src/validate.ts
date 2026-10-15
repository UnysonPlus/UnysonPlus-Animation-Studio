import { SCENE_FORMAT, SCENE_VERSION } from './types';
import type { Anchor, Breakpoint, Clip, HeightMode, Layer, Scene } from './types';
import { PRESET_IDS } from './presets/catalog';

/**
 * Checks a parsed scene file and fills in defaults. Errors stop the scene from playing; warnings are
 * things worth fixing that still play. Kept free of the animation engine so the editor can use it
 * without pulling GSAP in.
 */

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** The scene with defaults filled in. Only meaningful when ok is true. */
  scene: Scene;
}

const HEIGHT_MODES: HeightMode[] = ['ratio', 'ratio-capped', 'fill'];
const ANCHORS: Anchor[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
const TRIGGERS = ['load', 'view', 'manual'];
const EASE_RE = /^[a-zA-Z0-9.]+(\([0-9., ]*\))?$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function validateScene(input: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (path: string, msg: string) => errors.push(`${path}: ${msg}`);

  if (!isObj(input)) {
    return { ok: false, errors: ['The scene must be a JSON object.'], warnings, scene: input as Scene };
  }
  // Work on a copy so the caller's object is never changed.
  const scene = JSON.parse(JSON.stringify(input)) as Scene;

  if (scene.format !== SCENE_FORMAT) fail('format', `must be "${SCENE_FORMAT}"`);
  if (scene.version !== SCENE_VERSION) fail('version', `must be ${SCENE_VERSION}`);
  if (!isNum(scene.duration) || scene.duration <= 0 || scene.duration > 600) {
    fail('duration', 'must be a number of seconds between 0 and 600');
  }

  // Stage
  if (!isObj(scene.stage)) {
    fail('stage', 'is required');
  } else {
    const st = scene.stage;
    if (!Array.isArray(st.breakpoints) || st.breakpoints.length === 0) {
      fail('stage.breakpoints', 'needs at least one breakpoint');
    } else {
      const seen = new Set<string>();
      st.breakpoints.forEach((bp: Breakpoint, i: number) => {
        const p = `stage.breakpoints[${i}]`;
        if (!isObj(bp)) return fail(p, 'must be an object');
        if (typeof bp.id !== 'string' || !ID_RE.test(bp.id)) fail(`${p}.id`, 'must be a short id (letters, digits, - or _)');
        else if (seen.has(bp.id)) fail(`${p}.id`, `"${bp.id}" is used twice`);
        else seen.add(bp.id);
        if (!isNum(bp.minWidth) || bp.minWidth < 0) fail(`${p}.minWidth`, 'must be 0 or more');
        if (!Array.isArray(bp.aspect) || bp.aspect.length !== 2 || !bp.aspect.every((n) => isNum(n) && n > 0)) {
          fail(`${p}.aspect`, 'must be [width, height], e.g. [16, 9]');
        }
      });
      if (!st.breakpoints.some((bp) => isObj(bp) && bp.minWidth === 0)) {
        warnings.push('stage.breakpoints: none has minWidth 0, so the narrowest one is used below its minimum.');
      }
      st.breakpoints.sort((a, b) => b.minWidth - a.minWidth);
    }
    if (st.heightMode === undefined) st.heightMode = 'ratio-capped';
    if (!HEIGHT_MODES.includes(st.heightMode)) fail('stage.heightMode', `must be one of ${HEIGHT_MODES.join(', ')}`);
    if (st.heightOffset !== undefined && (!isNum(st.heightOffset) || st.heightOffset < 0)) fail('stage.heightOffset', 'must be 0 or more pixels');
    if (st.safeArea === undefined) st.safeArea = 0.06;
    if (!isNum(st.safeArea) || st.safeArea < 0 || st.safeArea >= 0.5) fail('stage.safeArea', 'must be between 0 and 0.5');
    if (st.background !== undefined && typeof st.background !== 'string') fail('stage.background', 'must be a CSS value');
    if (st.fonts !== undefined) {
      if (!Array.isArray(st.fonts)) fail('stage.fonts', 'must be a list');
      else st.fonts.forEach((f, i) => {
        if (!isObj(f) || typeof f.family !== 'string' || !f.family) fail(`stage.fonts[${i}].family`, 'is required');
        if (isObj(f) && f.href !== undefined && (typeof f.href !== 'string' || !/^https:\/\//.test(f.href))) {
          fail(`stage.fonts[${i}].href`, 'must be an https:// stylesheet address');
        }
      });
    }
  }

  // Playback
  if (scene.playback === undefined) scene.playback = { trigger: 'view', loop: false };
  if (!isObj(scene.playback)) {
    fail('playback', 'must be an object');
  } else {
    const pb = scene.playback;
    if (!TRIGGERS.includes(pb.trigger)) fail('playback.trigger', `must be one of ${TRIGGERS.join(', ')}`);
    if (typeof pb.loop !== 'boolean') pb.loop = false;
    if (pb.repeatDelay !== undefined && (!isNum(pb.repeatDelay) || pb.repeatDelay < 0)) fail('playback.repeatDelay', 'must be 0 or more seconds');
    if (pb.posterTime !== undefined && (!isNum(pb.posterTime) || pb.posterTime < 0 || pb.posterTime > scene.duration)) {
      fail('playback.posterTime', 'must be within the scene');
    }
  }

  // Layers (groups hold layers of their own; ids are unique across the whole scene)
  const bpIds = new Set((scene.stage?.breakpoints ?? []).map((b) => b?.id));
  const layerIds = new Set<string>();
  const clipIds = new Set<string>();
  const checkLayers = (list: unknown, base: string, depth: number) => {
    if (!Array.isArray(list)) return fail(base, 'must be a list');
    if (depth > 8) return fail(base, 'groups are nested too deeply (8 levels at most)');
    (list as Layer[]).forEach((layer: Layer, i: number) => {
      const p = `${base}[${i}]`;
      if (!isObj(layer)) return fail(p, 'must be an object');
      if (typeof layer.id !== 'string' || !ID_RE.test(layer.id)) fail(`${p}.id`, 'must be a short id (letters, digits, - or _)');
      else if (layerIds.has(layer.id)) fail(`${p}.id`, `"${layer.id}" is used twice`);
      else layerIds.add(layer.id);

      const lp = `${p} (${layer.id ?? '?'})`;
      if (layer.type === 'text') {
        if (typeof layer.text !== 'string') fail(`${lp}.text`, 'is required');
        if (!isObj(layer.style) || !isNum(layer.style.fontSize) || layer.style.fontSize <= 0) fail(`${lp}.style.fontSize`, 'is required (stage units)');
      } else if (layer.type === 'shape') {
        if (layer.shape !== 'rect' && layer.shape !== 'ellipse') fail(`${lp}.shape`, 'must be rect or ellipse');
      } else if (layer.type === 'image') {
        if (typeof layer.src !== 'string' || !layer.src) fail(`${lp}.src`, 'is required');
        if (!layer.alt) warnings.push(`${lp}.alt: add a description so screen readers can announce the image (or "" if it is decorative).`);
      } else if (layer.type === 'group') {
        if (layer.duration !== undefined && (!isNum(layer.duration) || layer.duration <= 0)) fail(`${lp}.duration`, 'must be more than 0 seconds');
        checkLayers(layer.layers, `${lp}.layers`, depth + 1);
      } else {
        fail(`${lp}.type`, 'must be text, shape, image or group');
      }

      if (layer.type !== 'group') {
        if (!isObj(layer.box)) fail(`${lp}.box`, 'is required');
        else {
          if (!isNum(layer.box.x) || !isNum(layer.box.y)) fail(`${lp}.box`, 'needs x and y');
          if (layer.box.anchor !== undefined && !ANCHORS.includes(layer.box.anchor)) fail(`${lp}.box.anchor`, `must be one of ${ANCHORS.join(', ')}`);
          if (layer.type !== 'text' && !isNum(layer.box.w)) fail(`${lp}.box.w`, 'is required for shapes and images');
          if (layer.type !== 'text' && !isNum(layer.box.h) && !isNum(layer.box.ratio)) fail(`${lp}.box`, 'needs h or ratio for shapes and images');
        }
      }
      if (layer.start !== undefined && (!isNum(layer.start) || layer.start < 0)) fail(`${lp}.start`, 'must be 0 or more seconds');
      if (layer.end !== undefined && (!isNum(layer.end) || layer.end <= (layer.start ?? 0))) fail(`${lp}.end`, 'must come after start');

      if (layer.overrides !== undefined) {
        if (!isObj(layer.overrides)) fail(`${lp}.overrides`, 'must be an object keyed by breakpoint id');
        else for (const key of Object.keys(layer.overrides)) {
          if (!bpIds.has(key)) warnings.push(`${lp}.overrides.${key}: no breakpoint has this id, so it is never used.`);
        }
      }

      if (!Array.isArray(layer.clips)) layer.clips = [];
      layer.clips.forEach((clip: Clip, j: number) => {
        const cp = `${lp}.clips[${j}]`;
        if (!isObj(clip)) return fail(cp, 'must be an object');
        if (typeof clip.id !== 'string' || !ID_RE.test(clip.id)) fail(`${cp}.id`, 'must be a short id');
        else if (clipIds.has(clip.id)) fail(`${cp}.id`, `"${clip.id}" is used twice`);
        else clipIds.add(clip.id);
        if (!PRESET_IDS.includes(clip.preset)) fail(`${cp}.preset`, `"${String(clip.preset)}" is not a known preset (${PRESET_IDS.join(', ')})`);
        if (!isNum(clip.start) || clip.start < 0) fail(`${cp}.start`, 'must be 0 or more seconds');
        if (!isNum(clip.duration) || clip.duration <= 0) fail(`${cp}.duration`, 'must be more than 0 seconds');
        if (depth === 0 && isNum(clip.start) && isNum(clip.duration) && isNum(scene.duration) && clip.start + clip.duration > scene.duration + 1e-6) {
          warnings.push(`${cp}: ends at ${(clip.start + clip.duration).toFixed(2)}s, after the scene ends (${scene.duration}s).`);
        }
        if (clip.ease !== undefined && (typeof clip.ease !== 'string' || !EASE_RE.test(clip.ease))) fail(`${cp}.ease`, 'is not a valid easing name');
        if (clip.params !== undefined && !isObj(clip.params)) fail(`${cp}.params`, 'must be an object');
        if (clip.preset === 'code' && isObj(clip.params) && clip.params.code !== undefined
          && (typeof clip.params.code !== 'string' || clip.params.code.length > 20000)) fail(`${cp}.params.code`, 'must be text (20,000 characters at most)');
      });
    });
  };
  checkLayers(scene.layers, 'layers', 0);

  return { ok: errors.length === 0, errors, warnings, scene };
}
