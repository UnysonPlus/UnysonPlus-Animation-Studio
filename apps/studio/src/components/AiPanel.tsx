import { useEffect, useRef, useState } from 'react';
import type { Scene } from '@unysonplus/scene-player/types';
import { askForScene, kitStatus, type KitStatus } from '../lib/ai';

const IDEAS = [
  'A bold launch hero for a new running shoe: dark background, neon green accent, the headline "Run lighter." and a short supporting line.',
  'A calm hero for a yoga studio: soft sand and sage colours, "Breathe in." fading in word by word, gentle floating circles.',
  'An event countdown banner: "Doors open 8 PM" with the time scrambling in, a pink line that grows underneath.',
];

const GUIDE = 'https://docs.unysonplus.com/guides/set-up-ai-for-unysonplus';

/**
 * The AI tab: describe an animation and the AI Dev Kit (running on this computer, with the user's
 * own AI) makes it as an ordinary scene: presets on the timeline, every part editable afterwards.
 */
export function AiPanel(props: {
  scene: Scene;
  selection: string[];
  onApply: (scene: Scene, note: string) => void;
}) {
  const [status, setStatus] = useState<KitStatus>({ state: 'checking' });
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const check = () => {
    setStatus({ state: 'checking' });
    kitStatus().then(setStatus);
  };
  useEffect(check, []);

  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [busy]);

  const run = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setElapsed(0);
    setError(null);
    setLast(null);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const r = await askForScene({ mode, prompt, scene: props.scene, selection: mode === 'edit' ? props.selection : [], signal: ctl.signal });
      props.onApply(r.scene, mode === 'create' ? 'New scene from the AI. Undo to go back.' : 'Scene changed by the AI. Undo to go back.');
      setLast(`${r.explanation}${r.repaired ? ' (The first answer needed fixing; this is the corrected one.)' : ''}`);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const sel = props.selection.length;
  const ready = status.state === 'ready';

  return (
    <div className="insp ai">
      <div className="insp-head">
        <p className="insp-kicker">AI</p>
        <h2 className="insp-title-static">Describe it, the AI builds it</h2>
        <p className="insp-help">
          The AI makes ordinary presets on the timeline, so you can change anything it makes. It runs through the AI Dev Kit on
          this computer, with your own AI.
        </p>
      </div>

      <div className={`ai-status is-${status.state}`} role="status">
        {status.state === 'checking' && <span>Looking for the AI Dev Kit on this computer…</span>}
        {status.state === 'ready' && <span><strong>Connected</strong> to your AI through the AI Dev Kit {status.version}.</span>}
        {status.state === 'off' && <span>The AI Dev Kit is running, but no AI is set up in it yet. Open its dashboard to connect one.</span>}
        {status.state === 'outdated' && <span>Your AI Dev Kit needs an update for the Studio. Close it and start it again (start.bat): it updates itself.</span>}
        {status.state === 'missing' && (
          <span>
            The AI Dev Kit isn't running on this computer. <a href={GUIDE} target="_blank" rel="noopener noreferrer">Set it up</a>,
            start it (start.bat), then check again.
          </span>
        )}
        {status.state !== 'checking' && status.state !== 'ready' && (
          <button type="button" className="btn small" onClick={check}>Check again</button>
        )}
      </div>

      <section className="insp-section">
        <div className="seg ai-mode" role="radiogroup" aria-label="What should the AI do">
          {(['create', 'edit'] as const).map((m) => (
            <label key={m} className="seg-opt">
              <input type="radio" name="ai-mode" checked={mode === m} onChange={() => setMode(m)} />
              <span className="seg-face">{m === 'create' ? 'New scene' : sel ? `Change ${sel === 1 ? 'the selected layer' : `${sel} selected layers`}` : 'Change this scene'}</span>
            </label>
          ))}
        </div>
        <label htmlFor="ai-prompt" className="sr-only">Your request</label>
        <textarea
          id="ai-prompt"
          className="ai-prompt"
          rows={6}
          value={prompt}
          placeholder={mode === 'create'
            ? 'For example: a bold hero for a bakery, warm colours, the headline "Fresh at dawn." rising letter by letter…'
            : 'For example: make the headline bigger and slam it in, and slow the ending down…'}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run(); }}
          disabled={busy}
        />
        <div className="ai-actions">
          {busy ? (
            <>
              <button type="button" className="btn" onClick={() => abort.current?.abort()}>Stop</button>
              <span className="ai-wait" aria-live="polite">Working… {elapsed}s (usually one to three minutes)</span>
            </>
          ) : (
            <button type="button" className="btn primary" onClick={run} disabled={!ready || !prompt.trim()}>
              {mode === 'create' ? 'Make the scene' : 'Apply the change'}
            </button>
          )}
        </div>
        {mode === 'create' && !busy && (
          <div className="ai-ideas">
            <p className="field-hint">Ideas to start from:</p>
            {IDEAS.map((idea) => (
              <button key={idea} type="button" className="ai-idea" onClick={() => setPrompt(idea)}>{idea}</button>
            ))}
          </div>
        )}
        {mode === 'create' && <p className="field-hint">A new scene replaces the current one (Undo brings it back). It keeps your screen sizes and height mode.</p>}
      </section>

      {error && <p className="export-error" role="alert">{error}</p>}
      {last && <p className="ai-result" role="status">{last}</p>}
    </div>
  );
}
