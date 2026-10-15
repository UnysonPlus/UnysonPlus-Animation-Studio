import { useEffect, useMemo, useRef, useState } from 'react';
import type { AudioClip, Scene } from '@unysonplus/scene-player/types';
import { SceneAudio } from '@unysonplus/scene-player';
import { SFX_IDS, sfxMeta, soundTrack, suggestedSound } from '@unysonplus/scene-player/sfx';
import { presetMeta } from '@unysonplus/scene-player/catalog';
import type { ClipSound, Layer } from '@unysonplus/scene-player/types';

/**
 * The Studio's sound. The editor preview runs in a frame that can't start sound from clicks in the
 * Studio, so the Studio plays the scene's audio itself, following the preview's clock: it starts with
 * playback, stops with it, and re-syncs when the playhead jumps (a seek, a loop, a scrub).
 */

const r2 = (v: number) => Math.round(v * 100) / 100;

export function addAudio(scene: Scene, clip: Omit<AudioClip, 'id'>): { scene: Scene; id: string } {
  const list = scene.audio ?? [];
  let n = list.length + 1;
  while (list.some((a) => a.id === `a${n}`)) n++;
  const id = `a${n}`;
  return { scene: { ...scene, audio: [...list, { id, ...clip }] }, id };
}

export function setAudio(scene: Scene, id: string, patch: Partial<AudioClip>): Scene {
  return {
    ...scene,
    audio: (scene.audio ?? []).map((a) => {
      if (a.id !== id) return a;
      const next = { ...a, ...patch } as AudioClip & Record<string, unknown>;
      for (const k of Object.keys(patch)) if ((patch as Record<string, unknown>)[k] === undefined) delete (next as Record<string, unknown>)[k];
      for (const k of ['start', 'offset', 'duration', 'fadeIn', 'fadeOut'] as const) if (typeof next[k] === 'number') next[k] = r2(next[k] as number);
      return next;
    }),
  };
}

export function removeAudio(scene: Scene, id: string): Scene {
  const audio = (scene.audio ?? []).filter((a) => a.id !== id);
  const next: Scene = { ...scene, audio };
  if (!audio.length) delete next.audio;
  return next;
}

/** Every clip in the scene, groups included, with its layer. */
function eachClip(list: Layer[], fn: (l: Layer, i: number) => void) {
  for (const l of list) {
    l.clips.forEach((_, i) => fn(l, i));
    if (l.type === 'group') eachClip(l.layers, fn);
  }
}

function mapClips(scene: Scene, fn: (c: Layer['clips'][number]) => Layer['clips'][number]): Scene {
  const walk = (list: Layer[]): Layer[] => list.map((l) => {
    const next = { ...l, clips: l.clips.map(fn) } as Layer;
    if (next.type === 'group') next.layers = walk(next.layers);
    return next;
  });
  return { ...scene, layers: walk(scene.layers) };
}

/** Sounds that carry a moment; they win a crowded stretch over quieter ones. */
const BIG = new Set(['impact', 'riser', 'reveal', 'chime', 'sub-hit', 'swell']);
/** At least this long between suggested sounds: a few well-placed sounds read better than many. */
const SUGGEST_GAP = 1.5;

/**
 * Which clips "Add suggested sounds" gives a sound: the scene's key moments, not every clip. Clips are
 * ranked (whole groups and top-level layers before their children, big moments before small ones,
 * entrances before exits) and taken in that order while they keep SUGGEST_GAP from every sound already
 * placed, including ones the author added.
 */
export function planSuggestedSounds(scene: Scene): Map<string, string> {
  const taken: number[] = [];
  const cands: Array<{ id: string; name: string; at: number; score: number }> = [];
  const walk = (list: Layer[], offset: number, depth: number) => {
    for (const l of list) {
      for (const c of l.clips) {
        const at = offset + c.start;
        if (c.sound) { taken.push(at + (c.sound.at === 'end' ? c.duration : 0)); continue; }
        const meta = presetMeta[c.preset];
        const name = suggestedSound(c, meta?.defaults);
        // Not on near-instant cuts, nor where the sound would be cut off by the end of the scene.
        if (!name || c.duration < 0.15 || at + (sfxMeta(name)?.length ?? 0) * 0.6 > scene.duration) continue;
        const dir = c.params && 'direction' in c.params ? c.params.direction : meta?.defaults.direction;
        const score = Math.max(1, 3 - depth) + (BIG.has(name) ? 2 : 0) + (dir === 'out' ? -1 : 1);
        cands.push({ id: c.id, name, at, score });
      }
      if (l.type === 'group') walk(l.layers, offset + (l.start ?? 0), depth + 1);
    }
  };
  walk(scene.layers, 0, 0);
  for (const a of scene.audio ?? []) if (a.role !== 'voice' && a.role !== 'music') taken.push(a.start);
  cands.sort((x, y) => y.score - x.score || x.at - y.at);
  const plan = new Map<string, string>();
  for (const c of cands) {
    if (taken.some((t) => Math.abs(t - c.at) < SUGGEST_GAP)) continue;
    taken.push(c.at);
    plan.set(c.id, c.name);
  }
  return plan;
}

/** Clips "Add suggested sounds" would give a sound, and clips that have one. */
export function soundCounts(scene: Scene) {
  let withSound = 0;
  eachClip(scene.layers, (l, i) => { if (l.clips[i].sound) withSound++; });
  return { suggestible: planSuggestedSounds(scene).size, withSound };
}

/** Gives the scene's key moments the sound that suits each clip's preset. */
export function addSuggestedSounds(scene: Scene): Scene {
  const plan = planSuggestedSounds(scene);
  return mapClips(scene, (c) => (plan.has(c.id) ? { ...c, sound: { name: plan.get(c.id)! } } : c));
}

export function clearClipSounds(scene: Scene): Scene {
  return mapClips(scene, (c) => {
    if (!c.sound) return c;
    const { sound: _s, ...rest } = c;
    return rest;
  });
}

/** A clip sound with empty / default fields left out. */
export function cleanSound(s: ClipSound | undefined): ClipSound | undefined {
  if (!s || !SFX_IDS.includes(s.name)) return undefined;
  const out: ClipSound = { name: s.name };
  if (s.at === 'end') out.at = 'end';
  if (s.delay) out.delay = r2(s.delay);
  if (s.volume !== undefined && Math.abs(s.volume - 1) > 1e-3) out.volume = r2(s.volume);
  if (s.pitch !== undefined && Math.abs(s.pitch - 1) > 1e-3) out.pitch = r2(s.pitch);
  return out;
}

/** What the timeline needs about each audio file: its length and a waveform (peaks per 1/40 s). */
export interface AudioInfo { duration: number; peaks: number[] }
const PEAKS_PER_SECOND = 40;

export function useSceneAudio(scene: Scene, state: { time: number; playing: boolean }, soundOn: boolean) {
  const engine = useMemo(() => new SceneAudio(window), []);
  const [info, setInfo] = useState<Record<string, AudioInfo>>({});
  const anchor = useRef<{ time: number; clock: number } | null>(null);
  // Sound tracks plus the sounds attached to clips. Keyed by content, so unrelated edits don't
  // re-schedule the sound mid-play.
  const trackKey = JSON.stringify(soundTrack(scene));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const clips = useMemo(() => soundTrack(scene), [trackKey]);

  useEffect(() => () => engine.dispose(), [engine]);

  // The first click or key press anywhere lets the page make sound.
  useEffect(() => {
    const unlock = () => { if (soundOn) engine.enable(); };
    addEventListener('pointerdown', unlock, true);
    addEventListener('keydown', unlock, true);
    return () => { removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); };
  }, [engine, soundOn]);

  // Decode new files once, for their length and waveform.
  useEffect(() => {
    engine.setClips(clips);
    for (const c of clips ?? []) {
      if (info[c.src]) continue;
      engine.buffer(c.src).then((buf) => {
        if (!buf) return;
        const data = buf.getChannelData(0);
        const step = Math.max(1, Math.floor(buf.sampleRate / PEAKS_PER_SECOND));
        const peaks: number[] = [];
        for (let i = 0; i < data.length; i += step) {
          let m = 0;
          for (let j = i; j < Math.min(data.length, i + step); j++) m = Math.max(m, Math.abs(data[j]));
          peaks.push(m);
        }
        // Scaled to the loudest moment, so quiet recordings still show their shape.
        const top = peaks.reduce((m, v) => Math.max(m, v), 0) || 1;
        const scaled = peaks.map((v) => Math.round((v / top) * 100) / 100);
        setInfo((prev) => ({ ...prev, [c.src]: { duration: buf.duration, peaks: scaled } }));
      });
    }
    // Clip changes while playing: schedule again from where the playhead is.
    if (anchor.current && soundOn) engine.play(state.time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

  // Follow the preview's clock. Sound starts once the preview's time actually moves (it takes a moment
  // to start after Play), and is only re-scheduled when the time jumps (a seek, a loop, a scrub), so
  // ordinary playback never restarts it.
  const startedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!soundOn || !clips?.length) { engine.stop(); anchor.current = null; startedAt.current = null; return; }
    const now = performance.now();
    if (!state.playing) {
      if (anchor.current) engine.stop();
      anchor.current = null;
      startedAt.current = null;
      return;
    }
    if (!anchor.current) {
      if (startedAt.current === null) { startedAt.current = state.time; return; }
      if (Math.abs(state.time - startedAt.current) < 1e-3) return; // not moving yet
      if (!engine.on) engine.enable();
      engine.play(state.time);
      anchor.current = { time: state.time, clock: now };
      return;
    }
    const expected = anchor.current.time + (now - anchor.current.clock) / 1000;
    if (Math.abs(state.time - expected) > 0.3) {
      engine.play(state.time);
      anchor.current = { time: state.time, clock: now };
    }
  }, [state.time, state.playing, soundOn, clips, engine]);

  useEffect(() => { if (!soundOn) engine.disable(); }, [soundOn, engine]);

  return { engine, info, peaksPerSecond: PEAKS_PER_SECOND };
}
