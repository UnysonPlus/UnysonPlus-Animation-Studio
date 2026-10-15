/**
 * Named eases measured from professional motion design. Each curve's shape (power, exponential,
 * spring) is standard; the parameter values were fitted to moves stepped through frame by frame in
 * human-made motion pieces (motionmaxxing, Apache-2.0; see NOTICE). Each comes with the length it
 * was typically used for, which the editor uses as a starting duration.
 *
 * Kept free of the animation engine: the player registers these with it (player.ts), the editor
 * lists them, and the validator accepts their names.
 */

type Ease = (t: number) => number;

const powerOut = (p: number): Ease => (t) => 1 - Math.pow(1 - t, p);
const powerIn = (p: number): Ease => (t) => Math.pow(t, p);
const expoOut = (k: number): Ease => {
  const d = 1 - Math.exp(-k);
  return (t) => (1 - Math.exp(-k * t)) / d;
};
/** Most of the travel almost at once, then a slow settle. */
const snapRamp = (w: number, tau: number): Ease => {
  const n = w * (1 - Math.exp(-1 / tau)) + (1 - w);
  return (t) => (w * (1 - Math.exp(-t / tau)) + (1 - w) * t) / n;
};
/** Reaches its mark early, passes it, and settles back. */
const snapOver = (a: number, rise: number, decay: number): Ease => {
  const f = (t: number) => (1 + a * Math.exp(-t / decay)) * (1 - Math.exp(-t / rise));
  const n = f(1);
  return (t) => f(t) / n;
};
/** A damped spring, scaled so it ends exactly on 1. */
const spring = (damping: number, freq: number): Ease => {
  const f = (t: number) => 1 - Math.exp(-damping * t) * (Math.cos(freq * t) + (damping / freq) * Math.sin(freq * t));
  const n = f(1);
  return (t) => f(t) / n;
};
/** A symmetric S-curve. */
const smooth = (p: number): Ease => (t) => {
  const a = Math.pow(t, p);
  const b = Math.pow(1 - t, p);
  return a / (a + b);
};
const ends = (f: Ease): Ease => (t) => (t <= 0 ? 0 : t >= 1 ? 1 : f(t));

export interface NamedEase {
  id: string;
  label: string;
  /** What it is for, shown in the editor and given to the AI. */
  use: string;
  /** Typical length in seconds. */
  seconds: number;
  /** Entrance, exit, or either. */
  role: 'enter' | 'exit' | 'any';
  fn: Ease;
}

export const NAMED_EASES: NamedEase[] = [
  { id: 'softLand', label: 'Soft land', use: 'Firm slow-down into place. The workhorse for text and panels.', seconds: 0.4, role: 'enter', fn: ends(expoOut(3.41)) },
  { id: 'snapSettle', label: 'Snap and settle', use: 'Most of the travel at once, then a gentle settle. A strong hero entrance.', seconds: 0.37, role: 'enter', fn: ends(snapRamp(0.942, 0.118)) },
  { id: 'glide', label: 'Glide', use: 'A gentle slow-down for medium moves.', seconds: 0.33, role: 'enter', fn: ends(powerOut(1.7)) },
  { id: 'whip', label: 'Whip', use: 'A fast, hard slow-down for big moves.', seconds: 0.23, role: 'enter', fn: ends(powerOut(2.52)) },
  { id: 'popOver', label: 'Pop over', use: 'Passes its mark late and settles back (peaks about 8% over). One per scene.', seconds: 0.5, role: 'enter', fn: ends(spring(2.67, 4.36)) },
  { id: 'crashIn', label: 'Crash in', use: 'Hits its mark at once and overshoots (about 18%). For impact.', seconds: 0.33, role: 'enter', fn: ends(snapOver(2.0, 0.19, 0.218)) },
  { id: 'bounceHard', label: 'Bounce hard', use: 'A big springy overshoot (about 48%). Use sparingly.', seconds: 0.73, role: 'enter', fn: ends(spring(1.34, 5.07)) },
  { id: 'cruise', label: 'Cruise', use: 'Steady speed. For drifts, counters and slow ambient moves.', seconds: 0.3, role: 'any', fn: ends((t) => t) },
  { id: 'softInOut', label: 'Soft in-out', use: 'A symmetric S-curve for opacity and blur changes.', seconds: 0.3, role: 'any', fn: ends(smooth(1.42)) },
  { id: 'gentleIn', label: 'Gentle in', use: 'A mild speed-up.', seconds: 0.3, role: 'exit', fn: ends(powerIn(2.07)) },
  { id: 'accelExit', label: 'Leave', use: 'The leaving curve: speeds up out of frame. The default for exits.', seconds: 0.43, role: 'exit', fn: ends(powerIn(2.6)) },
  { id: 'crashOut', label: 'Crash out', use: 'A hard speed-up, into a cut or a big change.', seconds: 0.57, role: 'exit', fn: ends(powerIn(3.97)) },
];

export const NAMED_EASE_IDS = NAMED_EASES.map((e) => e.id);
export const namedEase: Record<string, NamedEase> = Object.fromEntries(NAMED_EASES.map((e) => [e.id, e]));

/** The ease an exit uses when its clip doesn't set one. */
export const EXIT_EASE = 'accelExit';
