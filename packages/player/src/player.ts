import { gsap } from 'gsap';
import type { Box, Breakpoint, ModelLayer, Scene, TextStyle } from './types';
import { validateScene } from './validate';
import { applyLayout, buildText, createLayer, createStage, flatRefs, layoutTree, measureGroup, resolveLayer, type LayerRefs } from './dom';
import { groupDuration } from './groups';
import { injectFonts, injectStyles } from './styles';
import { presets, presetRand, type Timeline } from './presets';
import { seedFrom } from './random';
import { NAMED_EASES, resolveEase } from './eases';
import { linkToScroll, type ScrollLink } from './scroll';
import { load3d } from './model3d';
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
  /**
   * Presenting: in a click-to-advance scene, clicks and keys move through the slides even in editor
   * mode, and the keys work page-wide (the Studio's full screen). Without it, the keys work while the
   * scene has focus, so they never take over the page's own scrolling.
   */
  present?: boolean;
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
  /** Click-to-advance: plays on to the next marker (or the end). */
  next(): void;
  /** Click-to-advance: goes back to the previous marker. */
  prev(): void;
  /** Click-to-advance: stopped at a marker, waiting for the next click. */
  readonly waiting: boolean;
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
  let stageEl!: HTMLElement;
  let scrollLink: ScrollLink | null = null;
  let layers: LayerRefs[] = [];
  let forced: string | null = options.breakpoint ?? null;
  let current: Breakpoint | null = null;
  let tl: Timeline | null = null;
  let wantPlaying = false;
  /** Set once fonts are ready; nothing plays on its own before that. */
  let armed = false;
  let destroyed = false;

  const reduced = !options.editor && prefersReducedMotion(win);

  // ---- click-to-advance ----
  const clickMode = () => scene.playback.advance === 'click' && scene.playback.trigger !== 'scroll';
  const markerTimes = () => [...new Set((scene.markers ?? []).map((m) => m.t))].sort((a, b) => a - b);
  let waiting = false;
  function setWaiting(on: boolean) {
    waiting = on;
    if (on) {
      root.dataset.waiting = '';
      wantPlaying = false;
      emit('pause');
    } else delete root.dataset.waiting;
  }
  /** Where the next slide ends: the next marker after now, or the end. */
  const nextStop = (now: number) => markerTimes().find((m) => m > now + 1e-3) ?? scene.duration;

  /** Draws every 3D layer in its current state. */
  function render3d() {
    for (const r of flatRefs(layers)) if (r.model?.runtime) r.model.runtime.render(r.model.state);
  }

  function dispose3d() {
    for (const r of flatRefs(layers)) {
      r.model?.runtime?.dispose();
      if (r.model) r.model.runtime = undefined;
    }
  }

  /** Starts the 3D runtime for this scene's 3D layers (loading scene-3d.js the first time). */
  function start3d() {
    const models = flatRefs(layers).filter((r) => r.model);
    if (!models.length) return;
    load3d(win).then((m) => {
      for (const r of models) {
        if (destroyed || !r.model || r.model.runtime || !r.outer.isConnected) continue;
        r.model.runtime = m.create(r.inner, r.layer as ModelLayer);
        r.model.runtime.render(r.model.state);
        r.model.runtime.ready.then(() => emit('update'));
      }
    }).catch((e) => console.warn('[Unyson+ scene] 3D is unavailable:', e));
  }

  /** Builds the stage and layer elements for the current scene. */
  function setupDom() {
    dispose3d();
    root.textContent = '';
    root.dataset.mode = scene.stage.heightMode;
    root.style.setProperty('--upw-offset', `${scene.stage.heightOffset ?? 0}px`);
    if (scene.title) root.setAttribute('aria-label', scene.title);
    else root.removeAttribute('aria-label');
    injectFonts(doc, scene.stage.fonts);

    const { stage, canvas } = createStage(doc, scene);
    canvasEl = canvas;
    stageEl = stage;
    root.appendChild(stage);
    layers = scene.layers.map((layer, i) => {
      const refs = createLayer(doc, layer, i + 1);
      canvas.appendChild(refs.outer);
      return refs;
    });
    start3d();
  }

  function buildTimeline(): Timeline {
    const t = gsap.timeline({
      paused: true,
      onUpdate: () => {
        render3d();
        emit('update');
      },
      onComplete: () => {
        if (clickMode()) { tl?.pause(); setWaiting(true); }
        wantPlaying = false;
        emit('complete');
        emit('pause');
      },
    });
    // Make the timeline exactly as long as the scene, even if the last clip ends early.
    t.set({}, {}, scene.duration);

    addLayers(t, layers, scene.duration);
    // A scroll-linked scene follows the page, so it never loops on its own.
    if (clickMode()) {
      // A presentation: stop at every marker and wait. It never repeats on its own; the click after the
      // last slide starts it over when the scene loops.
      for (const m of markerTimes()) if (m > 1e-3 && m < scene.duration - 1e-3) t.addPause(m, () => setWaiting(true));
    } else if (scene.playback.loop && scene.playback.trigger !== 'scroll') t.repeat(-1).repeatDelay(scene.playback.repeatDelay ?? 0);
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
          ease: resolveEase(clip.ease ?? defaultEaseFor(preset, clip.params)),
          params: { ...preset.defaults, ...(clip.params ?? {}) },
          first: idx === 0,
          rand: presetRand(seedFrom(`${layer.id}/${clip.id}`)),
          gsap,
          allowCode: !!options.allowCode,
          model: refs.model?.state,
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
    scrollLink?.refresh();
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
    get waiting() { return waiting; },
    next() {
      if (!tl || !clickMode()) return;
      const now = tl.time();
      const atEnd = now >= scene.duration - 1e-3;
      if (atEnd && !scene.playback.loop) return;
      setWaiting(false);
      if (atEnd) tl.time(0, false);
      if (reduced) {
        // No motion: jump straight to the next slide's finished state.
        const stop = atEnd ? (markerTimes().find((m) => m > 1e-3) ?? scene.duration) : nextStop(now);
        tl.time(stop, false);
        setWaiting(true);
        emit('update');
        return;
      }
      wantPlaying = true;
      tl.play();
      emit('play');
    },
    prev() {
      if (!tl || !clickMode()) return;
      const now = tl.time();
      const before = markerTimes().filter((m) => m < now - 0.05);
      // Back to the end of the slide before this one (the start, before the first marker).
      const target = before[before.length - 1] ?? 0;
      tl.pause();
      tl.time(target, false);
      setWaiting(true);
      emit('update');
    },
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
      scrollLink?.refresh();
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
      scrollLink?.destroy();
      dispose3d();
      root.removeEventListener('click', onClick);
      win.removeEventListener('keydown', onKey as EventListener);
      root.removeEventListener('keydown', onKey as EventListener);
      resizeObserver.disconnect();
      io.disconnect();
      listeners.clear();
      root.remove();
    },
  };

  // Click-to-advance input: clicks and taps on the scene, and the keys (on the focused scene, or
  // page-wide when presenting). The scene element is focusable and says how to move on.
  const isNext = (k: string) => k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter';
  const isPrev = (k: string) => k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace';
  const onKey = (e: KeyboardEvent) => {
    if (!clickMode() || destroyed) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (isNext(e.key)) { e.preventDefault(); player.next(); } else if (isPrev(e.key)) { e.preventDefault(); player.prev(); }
  };
  const onClick = (e: MouseEvent) => {
    if (!clickMode() || (e.target as HTMLElement).closest?.('a, button')) return;
    player.next();
  };
  const interactive = !options.editor || !!options.present;
  if (interactive) {
    root.addEventListener('click', onClick);
    (options.present ? win : root).addEventListener('keydown', onKey as EventListener);
    const marks = () => {
      if (clickMode()) {
        root.tabIndex = 0;
        root.setAttribute('aria-roledescription', 'presentation');
        root.title = 'Click, or press the right arrow, to continue';
      } else {
        root.removeAttribute('tabindex');
        root.removeAttribute('aria-roledescription');
        root.removeAttribute('title');
      }
    };
    marks();
    listeners.set('rebuild', new Set([...(listeners.get('rebuild') ?? []), marks]));
  }

  // Start
  const ready = waitForFonts(doc, scene).then(() => {
    armed = true;
    // Text may have changed size now that its fonts are in, so groups re-fit their frames.
    if (flatRefs(layers).some((r) => r.children)) layoutTree(layers, current?.id ?? null);
  });
  if (reduced && clickMode()) {
    // A presentation without motion: show the first slide's finished state; clicks jump slide to slide.
    ready.then(() => { if (!tl) return; tl.time(markerTimes().find((m) => m > 1e-3) ?? scene.duration, false); setWaiting(true); });
  } else if (reduced) {
    ready.then(() => tl?.time(scene.playback.posterTime ?? scene.duration, false));
  } else if (options.autoplay !== false) {
    const trigger = scene.playback.trigger;
    if (trigger === 'load') {
      ready.then(() => !destroyed && player.play());
    } else if (trigger === 'scroll') {
      // The page's scroll position is the playhead.
      ready.then(() => {
        if (destroyed) return;
        scrollLink = linkToScroll({
          win, root, stage: () => stageEl, settings: scene.playback.scroll, offset: scene.stage.heightOffset ?? 0,
          setProgress: (p) => { if (tl) tl.progress(p, false); },
        });
      });
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
