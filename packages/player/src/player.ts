import { gsap } from 'gsap';
import type { Box, Breakpoint, Scene, TextStyle } from './types';
import { validateScene } from './validate';
import { applyLayout, buildText, createLayer, createStage, flatRefs, layoutTree, measureGroup, resolveLayer, type LayerRefs } from './dom';
import { groupDuration } from './groups';
import { injectFonts, injectStyles } from './styles';
import { presets, presetRand, type Timeline } from './presets';
import { seedFrom } from './random';
import { NAMED_EASES } from './eases';
import { defaultEaseFor } from './presets/catalog';

// The measured eases, usable by name in any clip (and in custom code clips).
NAMED_EASES.forEach((e) => gsap.registerEase(e.id, e.fn));

export interface MountOptions {
  /** Start playback according to the scene's trigger. Defaults to true. */
  autoplay?: boolean;
  /** Editor preview: ignore the reduced-motion setting so the author can still watch the animation. */
  editor?: boolean;
  /** Show the safe-area guide. */
  safeArea?: boolean;
  /** Force a breakpoint instead of choosing one from the stage width. */
  breakpoint?: string | null;
  /** Let custom code clips run. Off by default: only pages that trust the scene's author turn it on. */
  allowCode?: boolean;
}

export type PlayerEvent = 'update' | 'play' | 'pause' | 'complete' | 'breakpoint' | 'rebuild';

export interface LayerLayout {
  box: Box;
  style?: TextStyle;
  text?: string;
  hidden: boolean;
}

export interface ScenePlayer {
  readonly scene: Scene;
  readonly root: HTMLElement;
  readonly duration: number;
  readonly time: number;
  readonly playing: boolean;
  readonly breakpoint: string | null;
  play(): void;
  pause(): void;
  /** Jump to a moment, in seconds. Pauses playback. */
  seek(seconds: number): void;
  /** Swap in a changed scene, keeping the playhead (and playback) where it was. Throws if invalid. */
  update(scene: unknown): void;
  setSafeArea(show: boolean): void;
  setBreakpoint(id: string | null): void;
  /** The canvas element: layer positions are percentages of its size. */
  canvas(): HTMLElement;
  /** A layer's positioned box element. */
  layerElement(id: string): HTMLElement | null;
  /** A layer's layout at the current breakpoint, overrides included. */
  layout(id: string): LayerLayout | null;
  /** Shows a layer with a temporary box (while dragging), without changing the scene. Null restores it. */
  previewLayer(id: string, box: Partial<Box> | null): void;
  on(event: PlayerEvent, fn: () => void): () => void;
  destroy(): void;
}

const prefersReducedMotion = (win: Window) => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function pickBreakpoint(bps: Breakpoint[], width: number): Breakpoint {
  // Sorted widest first by the validator.
  return bps.find((bp) => width >= bp.minWidth) ?? bps[bps.length - 1];
}

function validated(input: unknown): Scene {
  const result = validateScene(input);
  if (!result.ok) throw new Error(`This scene can't be played:\n- ${result.errors.join('\n- ')}`);
  return result.scene;
}

/**
 * Mounts a scene into a host element and returns its player.
 * Throws if the scene is not valid; the message lists every problem.
 */
export function mount(host: HTMLElement, input: unknown, options: MountOptions = {}): ScenePlayer {
  let scene = validated(input);
  const doc = host.ownerDocument;
  const win = doc.defaultView ?? window;

  injectStyles(doc);

  const root = doc.createElement('div');
  root.className = 'upw-scene';
  root.setAttribute('role', 'img');
  if (options.safeArea) root.dataset.safe = '';
  host.textContent = '';
  host.appendChild(root);

  // Events
  const listeners = new Map<PlayerEvent, Set<() => void>>();
  const emit = (e: PlayerEvent) => listeners.get(e)?.forEach((fn) => fn());

  let canvasEl!: HTMLElement;
  let layers: LayerRefs[] = [];
  let forced: string | null = options.breakpoint ?? null;
  let current: Breakpoint | null = null;
  let tl: Timeline | null = null;
  let wantPlaying = false;
  /** Set once fonts are ready; nothing plays on its own before that. */
  let armed = false;
  let destroyed = false;

  const reduced = !options.editor && prefersReducedMotion(win);

  /** Builds the stage and layer elements for the current scene. */
  function setupDom() {
    root.textContent = '';
    root.dataset.mode = scene.stage.heightMode;
    root.style.setProperty('--upw-offset', `${scene.stage.heightOffset ?? 0}px`);
    if (scene.title) root.setAttribute('aria-label', scene.title);
    else root.removeAttribute('aria-label');
    injectFonts(doc, scene.stage.fonts);

    const { stage, canvas } = createStage(doc, scene);
    canvasEl = canvas;
    root.appendChild(stage);
    layers = scene.layers.map((layer, i) => {
      const refs = createLayer(doc, layer, i + 1);
      canvas.appendChild(refs.outer);
      return refs;
    });
  }

  function buildTimeline(): Timeline {
    const t = gsap.timeline({
      paused: true,
      onUpdate: () => emit('update'),
      onComplete: () => {
        wantPlaying = false;
        emit('complete');
        emit('pause');
      },
    });
    // Make the timeline exactly as long as the scene, even if the last clip ends early.
    t.set({}, {}, scene.duration);

    addLayers(t, layers, scene.duration);
    if (scene.playback.loop) t.repeat(-1).repeatDelay(scene.playback.repeatDelay ?? 0);
    return t;
  }

  /**
   * Adds a list of layers to a timeline whose length is `length`. A group gets its own nested
   * timeline at its start time, so its contents run on the group's clock.
   */
  function addLayers(t: Timeline, list: LayerRefs[], length: number) {
    for (const refs of list) {
      const { layer, outer } = refs;
      const start = layer.start ?? 0;
      const end = layer.end ?? length;
      // Layer in/out points. The starting state is set outside the timeline: a zero-length step at
      // time 0 would be undone when scrubbing back to the very start.
      gsap.set(outer, { visibility: start > 0 ? 'hidden' : 'inherit' });
      if (start > 0) t.set(outer, { visibility: 'inherit' }, start);
      if (end < length) t.set(outer, { visibility: 'hidden' }, end);

      const clips = [...layer.clips].sort((a, b) => a.start - b.start);
      clips.forEach((clip, idx) => {
        const preset = presets[clip.preset];
        if (!preset.appliesTo.includes(layer.type)) return;
        preset.build({
          tl: t,
          layer,
          clip,
          el: refs.inner,
          words: refs.words,
          chars: refs.chars,
          at: clip.start,
          duration: clip.duration,
          ease: clip.ease ?? defaultEaseFor(preset, clip.params),
          params: { ...preset.defaults, ...(clip.params ?? {}) },
          first: idx === 0,
          rand: presetRand(seedFrom(`${layer.id}/${clip.id}`)),
          gsap,
          allowCode: !!options.allowCode,
        });
      });

      if (layer.type === 'group' && refs.children) {
        const dur = groupDuration(layer);
        const inner = gsap.timeline();
        inner.set({}, {}, dur);
        addLayers(inner, refs.children, dur);
        t.add(inner, start);
      }
    }
  }

  /** (Re)builds text and the timeline, then puts the playhead back where it was. */
  function rebuild(time: number, play: boolean) {
    if (tl) {
      tl.kill();
      tl = null;
      // Clear what the old timeline wrote so the new one starts from clean elements.
      for (const r of flatRefs(layers)) {
        const holders = r.words.map((w) => w.parentElement).filter(Boolean);
        gsap.set([r.inner, ...r.words, ...r.chars, ...holders], { clearProps: 'all' });
      }
    }
    for (const r of flatRefs(layers)) {
      if (r.layer.type === 'text') {
        const { text } = resolveLayer(r.layer, current?.id ?? null);
        buildText(doc, r, text ?? '');
      }
    }
    layoutTree(layers, current?.id ?? null);
    tl = buildTimeline();
    tl.time(Math.min(time, scene.duration), false);
    if (play) tl.play();
    emit('rebuild');
  }

  function chooseBreakpoint(width: number) {
    const bps = scene.stage.breakpoints;
    return forced ? bps.find((b) => b.id === forced) ?? pickBreakpoint(bps, width) : pickBreakpoint(bps, width);
  }

  function applyBreakpoint(next: Breakpoint) {
    current = next;
    root.dataset.bp = next.id;
    root.style.setProperty('--upw-ar', `${next.aspect[0]} / ${next.aspect[1]}`);
  }

  function setBreakpointFromWidth(width: number) {
    const next = chooseBreakpoint(width);
    if (current?.id === next.id) return;
    applyBreakpoint(next);
    // A breakpoint that changes a layer's words needs new character elements, so the timeline is
    // rebuilt. Anything else is layout only and the running timeline carries on untouched.
    const textChanged = flatRefs(layers).some((r) => r.layer.type === 'text' && resolveLayer(r.layer, next.id).text !== r.builtText);
    if (!tl || textChanged) rebuild(tl ? tl.time() : 0, tl ? !tl.paused() : false);
    else layoutTree(layers, next.id);
    emit('breakpoint');
  }

  setupDom();
  applyBreakpoint(chooseBreakpoint(root.getBoundingClientRect().width || win.innerWidth));
  rebuild(0, false);

  const resizeObserver = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width;
    if (w) setBreakpointFromWidth(w);
  });
  resizeObserver.observe(root);

  // Pause looping scenes while they are off screen; play "view" scenes when they arrive.
  let inView = false;
  const io = new IntersectionObserver((entries) => {
    inView = entries.some((e) => e.isIntersecting);
    if (!tl || reduced) return;
    if (inView && wantPlaying && armed && tl.paused()) tl.play();
    else if (!inView && !tl.paused() && scene.playback.loop) tl.pause();
  }, { threshold: 0.2 });
  io.observe(root);

  const refsOf = (id: string) => flatRefs(layers).find((r) => r.layer.id === id) ?? null;

  const player: ScenePlayer = {
    get scene() { return scene; },
    root,
    get duration() { return scene.duration; },
    get time() { return tl ? tl.time() : 0; },
    get playing() { return !!tl && !tl.paused(); },
    get breakpoint() { return current?.id ?? null; },
    play() {
      if (!tl) return;
      wantPlaying = true;
      if (!scene.playback.loop && tl.time() >= scene.duration - 1e-3) tl.time(0);
      tl.play();
      emit('play');
    },
    pause() {
      if (!tl) return;
      wantPlaying = false;
      tl.pause();
      emit('pause');
    },
    seek(seconds) {
      if (!tl) return;
      wantPlaying = false;
      tl.pause();
      tl.time(Math.max(0, Math.min(scene.duration, seconds)), false);
      emit('pause');
      emit('update');
    },
    update(next) {
      const nextScene = validated(next);
      const time = tl ? tl.time() : 0;
      const play = tl ? !tl.paused() : false;
      if (tl) {
        tl.kill();
        tl = null;
      }
      scene = nextScene;
      setupDom();
      applyBreakpoint(chooseBreakpoint(root.getBoundingClientRect().width || win.innerWidth));
      rebuild(time, play);
      emit('breakpoint');
      emit('update');
    },
    setSafeArea(show) {
      if (show) root.dataset.safe = '';
      else delete root.dataset.safe;
    },
    setBreakpoint(id) {
      forced = id;
      current = null;
      setBreakpointFromWidth(root.getBoundingClientRect().width);
    },
    canvas: () => canvasEl,
    layerElement: (id) => refsOf(id)?.outer ?? null,
    layout(id) {
      const r = refsOf(id);
      if (!r) return null;
      const resolved = resolveLayer(r.layer, current?.id ?? null);
      // A group's box is its measured frame.
      if (r.frame) return { ...resolved, box: { x: r.frame.l, y: r.frame.t, w: r.frame.w, h: r.frame.h, anchor: 'top-left' } };
      return resolved;
    },
    previewLayer(id, box) {
      const r = refsOf(id);
      if (!r) return;
      const bp = current?.id ?? null;
      if (r.children) {
        // A group moves as a whole: shift its frame (its contents ride along), or re-fit it.
        if (!box) measureGroup(r, bp);
        else {
          if (typeof box.x === 'number') r.outer.style.left = `${box.x}%`;
          if (typeof box.y === 'number') r.outer.style.top = `${box.y}%`;
        }
        return;
      }
      if (!box) {
        applyLayout(r, bp);
        return;
      }
      // Lay the layer out as if this breakpoint's override carried the temporary box.
      const key = bp ?? '__preview';
      const base = resolveLayer(r.layer, bp).box;
      const overrides = { ...(r.layer.overrides ?? {}), [key]: { ...(r.layer.overrides?.[key] ?? {}), box: { ...base, ...box } } };
      applyLayout({ ...r, layer: { ...r.layer, overrides } }, key);
    },
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      tl?.kill();
      resizeObserver.disconnect();
      io.disconnect();
      listeners.clear();
      root.remove();
    },
  };

  // Start
  const ready = waitForFonts(doc, scene).then(() => {
    armed = true;
    // Text may have changed size now that its fonts are in, so groups re-fit their frames.
    if (flatRefs(layers).some((r) => r.children)) layoutTree(layers, current?.id ?? null);
  });
  if (reduced) {
    ready.then(() => tl?.time(scene.playback.posterTime ?? scene.duration, false));
  } else if (options.autoplay !== false) {
    const trigger = scene.playback.trigger;
    if (trigger === 'load') {
      ready.then(() => !destroyed && player.play());
    } else if (trigger === 'view') {
      // Arm the observer: the first time it reports the scene on screen, play.
      wantPlaying = true;
      ready.then(() => {
        if (!destroyed && inView && tl?.paused()) player.play();
      });
    }
  }

  return player;
}

/**
 * Waits for the scene's fonts (at most 2.5 s), so text never animates in a fallback font. A font's
 * stylesheet has to arrive before the browser knows the face exists, so that is awaited first.
 */
function waitForFonts(doc: Document, scene: Scene): Promise<void> {
  const fonts = scene.stage.fonts ?? [];
  if (!fonts.length || !doc.fonts) return Promise.resolve();
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    .filter((l) => fonts.some((f) => f.href && l.href === f.href));
  const sheets = links.map((l) => (l.sheet ? Promise.resolve() : new Promise<void>((r) => {
    l.addEventListener('load', () => r(), { once: true });
    l.addEventListener('error', () => r(), { once: true });
  })));
  const loaded = Promise.all(sheets)
    .then(() => Promise.all(fonts.map((f) => doc.fonts.load(`700 1em "${f.family}"`).catch(() => undefined))));
  const timeout = new Promise((r) => setTimeout(r, 2500));
  return Promise.race([loaded, timeout]).then(() => undefined);
}
