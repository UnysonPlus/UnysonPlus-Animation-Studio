import type { ScrollSettings } from './types';

/**
 * Scroll-linked playback: the page's scroll position sets how far the scene has played, forwards and
 * backwards. Plain scroll events and one animation frame loop; no scroll plugin.
 *
 *   Not pinned  The scene runs from the moment the stage's top enters the bottom of the window until its
 *               bottom leaves the top.
 *   Pinned      The stage holds still (position: sticky) while the page scrolls `length` window heights,
 *               and the scene runs across that distance. The scene element grows to make the room.
 *               Sticky needs every ancestor to have visible overflow; a theme that hides overflow on a
 *               wrapper turns the pin into a plain scroll-through (the scene still plays).
 *   Smoothing   The playhead eases toward the scroll position over `smooth` seconds, so a mouse wheel's
 *               steps read as one movement.
 */

export const SCROLL_DEFAULTS: Required<ScrollSettings> = { pin: true, length: 1.5, smooth: 0.4 };

export interface ScrollLink {
  /** Re-measure (after a resize or a breakpoint change). */
  refresh(): void;
  destroy(): void;
}

export function linkToScroll(opts: {
  win: Window;
  root: HTMLElement;
  stage: () => HTMLElement;
  settings: ScrollSettings | undefined;
  /** Pixels a sticky header takes at the top of the window. */
  offset: number;
  setProgress: (p: number) => void;
}): ScrollLink {
  const { win, root } = opts;
  const doc = root.ownerDocument;
  const s = { ...SCROLL_DEFAULTS, ...(opts.settings ?? {}) };
  let target = 0;
  let current = -1;
  let raf = 0;
  let last = 0;

  const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

  function layout() {
    const stage = opts.stage();
    if (s.pin) {
      stage.style.position = 'sticky';
      stage.style.top = `${opts.offset}px`;
      root.style.height = `${stage.offsetHeight + s.length * (win.innerHeight - opts.offset)}px`;
    } else {
      stage.style.position = '';
      stage.style.top = '';
      root.style.height = '';
    }
  }

  function measure() {
    const r = root.getBoundingClientRect();
    const vh = win.innerHeight;
    if (s.pin) {
      const travel = r.height - opts.stage().offsetHeight;
      target = travel > 0 ? clamp((opts.offset - r.top) / travel) : 0;
    } else {
      target = clamp((vh - r.top) / (vh + r.height));
    }
  }

  function frame(now: number) {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    if (current < 0 || s.smooth <= 0) current = target;
    else current += (target - current) * (1 - Math.exp(-dt / (s.smooth / 4)));
    if (Math.abs(target - current) < 0.0005) current = target;
    opts.setProgress(current);
    if (current !== target) raf = win.requestAnimationFrame(frame);
    else { raf = 0; last = 0; }
  }

  function onScroll() {
    measure();
    if (!raf) raf = win.requestAnimationFrame(frame);
  }

  function refresh() {
    layout();
    onScroll();
  }

  doc.addEventListener('scroll', onScroll, { passive: true, capture: true });
  win.addEventListener('resize', refresh);
  refresh();

  return {
    refresh,
    destroy() {
      doc.removeEventListener('scroll', onScroll, { capture: true });
      win.removeEventListener('resize', refresh);
      if (raf) win.cancelAnimationFrame(raf);
      const stage = opts.stage();
      stage.style.position = '';
      stage.style.top = '';
      root.style.height = '';
    },
  };
}
