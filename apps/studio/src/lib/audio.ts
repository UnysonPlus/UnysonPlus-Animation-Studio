import { useEffect, useMemo, useRef, useState } from 'react';
import type { AudioClip, Scene } from '@unysonplus/scene-player/types';
import { SceneAudio } from '@unysonplus/scene-player';

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

/** What the timeline needs about each audio file: its length and a waveform (peaks per 1/40 s). */
export interface AudioInfo { duration: number; peaks: number[] }
const PEAKS_PER_SECOND = 40;

export function useSceneAudio(scene: Scene, state: { time: number; playing: boolean }, soundOn: boolean) {
  const engine = useMemo(() => new SceneAudio(window), []);
  const [info, setInfo] = useState<Record<string, AudioInfo>>({});
  const anchor = useRef<{ time: number; clock: number } | null>(null);
  const clips = scene.audio;

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
