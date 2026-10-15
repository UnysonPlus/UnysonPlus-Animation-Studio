import type { AudioClip, SpeechInfo, SpokenWord } from '@unysonplus/scene-player/types';
import { kitBase } from './ai';

/**
 * Speech recognition through the AI Dev Kit: whisper.cpp on the user's own computer turns a voice-over
 * into its words, each with its time and how strongly it is said, plus the delivery overall (pace,
 * energy). Nothing leaves the computer. The kit downloads the program and a speech model once, when the
 * user asks.
 */

export type ModelKey = 'base' | 'small';

export interface TranscribeStatus {
  program: boolean;
  canInstallProgram: boolean;
  installHint: string | null;
  models: Record<ModelKey, { installed: boolean; mb: number; label: string }>;
  ffmpeg: boolean;
  install: { state: 'running' | 'done' | 'error'; step: string; done: number; total: number; error: string; model: ModelKey } | null;
  busy: boolean;
}

export interface TranscribeResult {
  language: string;
  duration: number;
  text: string;
  words: SpokenWord[];
  speech: SpeechInfo & { emphasis?: number[] };
}

async function base(): Promise<string> {
  const b = await kitBase();
  if (!b) throw new Error('The AI Dev Kit is not running on this computer.');
  return b;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${await base()}${path}`, init);
  if (r.status === 404 && path === '/studio/transcribe') throw new Error('Your AI Dev Kit needs an update for transcription. Close it and start it again (start.bat or start.command): it updates itself.');
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `The AI Dev Kit answered ${r.status}.`);
  return j as T;
}

export const transcribeStatus = () => call<TranscribeStatus>('/studio/transcribe');

export const installSpeech = (model: ModelKey) =>
  call<{ install: TranscribeStatus['install'] }>('/studio/transcribe/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model }) });

/** Transcribes a clip's audio, reporting each step; resolves with the words and the delivery. */
export async function transcribe(src: string, model: ModelKey, onStep: (step: string) => void, signal: AbortSignal): Promise<TranscribeResult> {
  const { id } = await call<{ id: string }>('/studio/transcribe', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ src, model }), signal,
  });
  for (;;) {
    if (signal.aborted) throw new DOMException('Stopped', 'AbortError');
    await new Promise((r) => setTimeout(r, 700));
    const j = await call<{ state: string; step: string; error: string; result: TranscribeResult | null }>(`/studio/transcribe/${id}`, { signal });
    onStep(j.step);
    if (j.state === 'done' && j.result) return j.result;
    if (j.state === 'error') throw new Error(j.error || 'The transcription failed.');
  }
}

/** The words a clip actually plays (after its trim), with their times on the scene's clock. */
export function clipWords(clip: AudioClip): Array<SpokenWord & { at: number; index: number }> {
  const from = clip.offset ?? 0;
  const to = clip.duration !== undefined ? from + clip.duration : Infinity;
  return (clip.words ?? [])
    .map((w, index) => ({ ...w, index, at: clip.start + (w.t - from) }))
    .filter((w) => w.t >= from - 0.05 && w.t < to);
}

/** Strongly said words (the analysis's top emphasis), for bold text and big moments. */
export const isStrong = (w: SpokenWord) => (w.s ?? 0) >= 0.75;
