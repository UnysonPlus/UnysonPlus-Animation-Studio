import type { AudioClip } from './types';

/**
 * A scene's sound: voice-overs, music and effects, scheduled with the Web Audio API against the
 * timeline's clock. Playing from any moment starts each clip at the right point of its file, with its
 * volume and fades; pausing or seeking stops everything and the next play schedules afresh, so sound
 * follows the timeline exactly however it is moved.
 *
 * Browsers only let a page make sound after the visitor has interacted with it, so the engine starts
 * muted until enable() is called from a click or tap (the player's sound button, the Studio's controls).
 * Shared by the player and the Studio (which plays the editor preview's sound itself).
 */

type Ctx = AudioContext;

export class SceneAudio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private live: Array<{ src: AudioBufferSourceNode; gain: GainNode }> = [];
  private clips: AudioClip[] = [];
  private playingFrom: { time: number; at: number } | null = null;
  private enabled = false;
  private volume = 1;

  constructor(private win: Window) {}

  /** Whether sound is on (enable() has been called from a user gesture). */
  get on() { return this.enabled; }

  setClips(clips: AudioClip[] | undefined) {
    this.clips = (clips ?? []).filter((c) => c && typeof c.src === 'string' && c.src);
    if (this.ctx) for (const c of this.clips) this.load(c.src);
  }

  /** Turns sound on. Call from a click or tap handler. */
  enable(): Promise<void> {
    this.enabled = true;
    const ctx = this.context();
    if (!ctx) return Promise.resolve();
    for (const c of this.clips) this.load(c.src);
    this.master!.gain.value = this.volume;
    return ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
  }

  /** Turns sound off (the engine keeps its decoded files). */
  disable() {
    this.enabled = false;
    this.stop();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  /** Plays from a timeline moment (seconds). Clips not yet decoded join in as soon as they are. */
  play(time: number) {
    this.stop();
    if (!this.enabled) return;
    const ctx = this.context();
    if (!ctx) return;
    this.playingFrom = { time, at: ctx.currentTime };
    for (const clip of this.clips) {
      this.load(clip.src).then((buf) => {
        if (!buf || !this.playingFrom || !this.ctx) return;
        // Where the timeline is now, if this file took a moment to decode.
        const now = this.playingFrom.time + (this.ctx.currentTime - this.playingFrom.at);
        this.schedule(clip, buf, now);
      });
    }
  }

  stop() {
    this.playingFrom = null;
    for (const { src, gain } of this.live) {
      try { src.stop(); } catch { /* not started yet */ }
      src.disconnect();
      gain.disconnect();
    }
    this.live = [];
  }

  /** Decoded length of a source file, in seconds (null if it can't be read). */
  async durationOf(src: string): Promise<number | null> {
    const b = await this.load(src);
    return b ? b.duration : null;
  }

  /** The decoded file, for drawing waveforms. */
  buffer(src: string) {
    return this.load(src);
  }

  dispose() {
    this.stop();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.buffers.clear();
  }

  private context(): Ctx | null {
    if (this.ctx) return this.ctx;
    const AC = (this.win as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (this.win as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  private load(src: string): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(src);
    if (hit) return hit;
    const ctx = this.context();
    if (!ctx) return Promise.resolve(null);
    const p = fetch(src)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then((data) => ctx.decodeAudioData(data))
      .catch((e) => { console.warn('[Unyson+ scene] could not load audio', src.slice(0, 80), e); return null; });
    this.buffers.set(src, p);
    return p;
  }

  private schedule(clip: AudioClip, buf: AudioBuffer, time: number) {
    const ctx = this.ctx!;
    const trimIn = Math.max(0, clip.offset ?? 0);
    const len = Math.max(0, Math.min(clip.duration ?? Infinity, buf.duration - trimIn));
    const start = clip.start;
    const end = start + len;
    if (!(len > 0) || time >= end) return;
    const ctxAt = (t: number) => ctx.currentTime + (t - time);
    const from = Math.max(time, start);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    src.connect(gain).connect(this.master!);
    // Volume with fades, as an envelope on the timeline.
    const vol = Math.max(0, Math.min(2, clip.volume ?? 1));
    const fi = Math.max(0, Math.min(len / 2, clip.fadeIn ?? 0));
    const fo = Math.max(0, Math.min(len / 2, clip.fadeOut ?? 0));
    const level = (t: number) => {
      let v = vol;
      if (fi > 0 && t < start + fi) v *= Math.max(0, (t - start) / fi);
      if (fo > 0 && t > end - fo) v *= Math.max(0, (end - t) / fo);
      return v;
    };
    const g = gain.gain;
    g.setValueAtTime(level(from), ctxAt(from));
    if (fi > 0 && from < start + fi) g.linearRampToValueAtTime(vol, ctxAt(start + fi));
    if (fo > 0) {
      const foStart = Math.max(from, end - fo);
      if (foStart > from) g.setValueAtTime(level(foStart), ctxAt(foStart));
      g.linearRampToValueAtTime(0, ctxAt(end));
    }
    src.start(Math.max(ctx.currentTime, ctxAt(from)), trimIn + (from - start), end - from);
    this.live.push({ src, gain });
  }
}
