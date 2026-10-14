/**
 * The scene file, version 1.
 *
 * A scene is a stage (its shape per breakpoint and how tall it may grow), a list of layers drawn
 * bottom to top, and on each layer the clips that animate it. Every length on the stage is relative
 * to the stage itself, so a scene draws the same at any size:
 *   - box x / w are percentages of the stage width, y / h of the stage height;
 *   - font sizes, stroke widths and radii are in "stage units" (1 = 1% of the stage width).
 */

export const SCENE_FORMAT = 'unysonplus-scene';
export const SCENE_VERSION = 1;

export interface Scene {
  format: typeof SCENE_FORMAT;
  version: number;
  title?: string;
  /** Length of one play-through, in seconds. */
  duration: number;
  stage: Stage;
  playback: Playback;
  layers: Layer[];
}

export interface Stage {
  /** Checked widest first: the first whose minWidth fits the stage's width is used. */
  breakpoints: Breakpoint[];
  heightMode: HeightMode;
  /** Pixels taken from the window height in the capped and fill modes (a site header, for example). */
  heightOffset?: number;
  /** Any CSS background: a colour, a gradient or an image. */
  background?: string;
  /** Inset of the safe area on each side, as a fraction of the stage (0.05 = 5%). */
  safeArea?: number;
  fonts?: FontAsset[];
}

export interface Breakpoint {
  id: string;
  label?: string;
  /** Smallest stage width, in CSS pixels, this breakpoint applies to. */
  minWidth: number;
  /** Width and height of the stage shape, e.g. [16, 9]. */
  aspect: [number, number];
}

/**
 * ratio         Keep the shape; the page scrolls if the stage is taller than the window.
 * ratio-capped  Keep the shape, but never grow taller than the window (minus heightOffset).
 * fill          Exactly the window height (minus heightOffset), whatever the shape.
 */
export type HeightMode = 'ratio' | 'ratio-capped' | 'fill';

export interface FontAsset {
  family: string;
  /** A stylesheet that declares the font (for example a hosted web-font CSS link). */
  href?: string;
}

export interface Playback {
  /** load: play as soon as the scene is ready. view: play when it scrolls into view. manual: never on its own. */
  trigger: 'load' | 'view' | 'manual';
  loop: boolean;
  /** Pause between loops, in seconds. */
  repeatDelay?: number;
  /** The frame shown to visitors who ask for reduced motion, in seconds. Defaults to the end. */
  posterTime?: number;
}

export type Anchor =
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'center' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right';

export interface Box {
  /** Horizontal position of the anchor point, % of stage width. */
  x: number;
  /** Vertical position of the anchor point, % of stage height. */
  y: number;
  /** Width, % of stage width. Text without a width sizes to its content. */
  w?: number;
  /** Height, % of stage height. */
  h?: number;
  /** Width-to-height ratio; used instead of h when set (keeps circles round). */
  ratio?: number;
  /** Which point of the layer sits at (x, y). Defaults to center. */
  anchor?: Anchor;
  /** Static rotation in degrees. */
  rotate?: number;
}

export interface TextStyle {
  fontFamily?: string;
  /** Stage units: 10 = 10% of the stage width. */
  fontSize: number;
  fontWeight?: number;
  lineHeight?: number;
  /** In em. */
  letterSpacing?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  uppercase?: boolean;
  italic?: boolean;
}

export interface LayerOverride {
  box?: Partial<Box>;
  style?: Partial<TextStyle>;
  text?: string;
  hidden?: boolean;
}

interface LayerBase {
  id: string;
  name?: string;
  box: Box;
  /** When the layer appears, in seconds. Defaults to 0. */
  start?: number;
  /** When the layer disappears, in seconds. Defaults to the scene's end. */
  end?: number;
  opacity?: number;
  /** Per-breakpoint changes, keyed by breakpoint id. Layout only: clips are shared by every breakpoint. */
  overrides?: Record<string, LayerOverride>;
  clips: Clip[];
}

export interface TextLayer extends LayerBase {
  type: 'text';
  /** A line break in the text ("\n") starts a new line. */
  text: string;
  style: TextStyle;
}

export interface ShapeLayer extends LayerBase {
  type: 'shape';
  shape: 'rect' | 'ellipse';
  /** Any CSS background. */
  fill?: string;
  stroke?: string;
  /** Stage units. */
  strokeWidth?: number;
  /** Corner radius in stage units (rect only). */
  radius?: number;
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  src: string;
  alt?: string;
  fit?: 'cover' | 'contain';
  /** Corner radius in stage units. */
  radius?: number;
}

export type Layer = TextLayer | ShapeLayer | ImageLayer;

export interface Clip {
  id: string;
  /** A preset id from the catalogue, e.g. "text-rise". */
  preset: string;
  /** Seconds from the start of the scene. */
  start: number;
  /** Seconds. */
  duration: number;
  /** An easing name, e.g. "power3.out". Each preset has its own default. */
  ease?: string;
  params?: Record<string, unknown>;
}
