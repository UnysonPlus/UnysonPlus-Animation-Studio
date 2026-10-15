import { useEffect, useMemo, useRef, useState } from 'react';
import { mount, type ScenePlayer } from '@unysonplus/scene-player';
import { starterScene, type ApplyParts, type SceneStyle } from '../lib/styles';

/** A style's starter scene, held on its poster frame and played while hovered. */
function StylePreview({ style, active }: { style: SceneStyle; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const player = useRef<ScenePlayer | null>(null);
  const scene = useMemo(() => {
    const s = starterScene(style);
    // A single wide layout so the card always shows the desktop composition.
    return { ...s, stage: { ...s.stage, breakpoints: [s.stage.breakpoints[0]], heightMode: 'ratio' as const } };
  }, [style]);
  useEffect(() => {
    if (!ref.current) return;
    try {
      player.current = mount(ref.current, scene, { editor: true, autoplay: false, audio: false });
      player.current.seek(scene.playback.posterTime ?? 2);
    } catch {
      /* A preview that can't play just stays blank. */
    }
    return () => { player.current?.destroy(); player.current = null; };
  }, [scene]);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    if (active) { p.seek(0); p.play(); } else { p.pause(); p.seek(scene.playback.posterTime ?? 2); }
  }, [active, scene]);
  return <div ref={ref} className="style-thumb" aria-hidden="true" />;
}

export function StyleLibrary(props: {
  styles: SceneStyle[];
  /** The style AI assist uses (null: none). */
  aiStyle: string | null;
  hasScene: boolean;
  onApply: (style: SceneStyle, parts: ApplyParts) => void;
  onNew: (style: SceneStyle) => void;
  onUseForAi: (id: string | null) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [parts, setParts] = useState<ApplyParts>({ look: true, motion: true, sound: true });
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  return (
    <>
      <div className="lib-head">
        <p className="lib-help">
          A style is a look to build from: colours, fonts, how things move and sound. Apply one to this scene, start a new
          scene in it, or give it to AI assist as art direction.
        </p>
      </div>
      <div className="lib-scroll">
        <ul className="style-list">
          {props.styles.map((s) => {
            const isOpen = open === s.id;
            const forAi = props.aiStyle === s.id;
            return (
              <li key={s.id} className={`style-card${isOpen ? ' open' : ''}`}>
                <button type="button" className="style-main" aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : s.id)}
                  onPointerEnter={() => setHot(s.id)} onPointerLeave={() => setHot((h) => (h === s.id ? null : h))}
                  onFocus={() => setHot(s.id)} onBlur={() => setHot((h) => (h === s.id ? null : h))}>
                  <StylePreview style={s} active={hot === s.id} />
                  <span className="style-row">
                    <span className="style-name">{s.name}{s.custom ? <span className="style-tag">Yours</span> : null}{forAi ? <span className="style-tag ai">AI</span> : null}</span>
                    <span className="style-swatches" aria-hidden="true">
                      {[s.palette.text, s.palette.muted, s.palette.accent, s.palette.accent2].filter(Boolean).map((c, i) => <i key={i} style={{ background: c }} />)}
                    </span>
                  </span>
                  <span className="style-desc">{s.description}</span>
                  <span className="style-fonts">{s.fonts.heading}{s.fonts.body !== s.fonts.heading ? ` + ${s.fonts.body}` : ''}</span>
                </button>
                {isOpen && (
                  <div className="style-actions">
                    {props.hasScene && (
                      <fieldset className="style-parts">
                        <legend>Apply to this scene</legend>
                        {([['look', 'Colours and fonts'], ['motion', 'Motion'], ['sound', 'Sounds']] as const).map(([k, label]) => (
                          <label key={k}><input type="checkbox" checked={parts[k]} onChange={(e) => setParts({ ...parts, [k]: e.target.checked })} /> {label}</label>
                        ))}
                        <button type="button" className="btn small primary" disabled={!parts.look && !parts.motion && !parts.sound} onClick={() => props.onApply(s, parts)}>Apply</button>
                      </fieldset>
                    )}
                    <div className="style-btns">
                      <button type="button" className="btn small" onClick={() => props.onNew(s)} title="Starts a new scene: a title card in this style to build on">New scene</button>
                      <button type="button" className={`btn small${forAi ? ' on' : ''}`} aria-pressed={forAi} onClick={() => props.onUseForAi(forAi ? null : s.id)}
                        title="AI assist follows this style when it makes or changes a scene">
                        {forAi ? '✓ Used by AI assist' : 'Use with AI assist'}
                      </button>
                      {s.custom && <button type="button" className="btn small ghost danger" onClick={() => { props.onDelete(s.id); setOpen(null); }}>Delete</button>}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {props.hasScene && (
          <div className="style-save">
            {saving ? (
              <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) { props.onSave(name.trim()); setSaving(false); setName(''); } }}>
                <label htmlFor="style-name" className="field-label">Name the style</label>
                <div className="style-save-row">
                  <input id="style-name" autoFocus value={name} maxLength={40} placeholder="My brand" onChange={(e) => setName(e.target.value)} />
                  <button type="submit" className="btn small primary" disabled={!name.trim()}>Save</button>
                  <button type="button" className="btn small ghost" onClick={() => setSaving(false)}>Cancel</button>
                </div>
                <p className="field-hint">Takes this scene's colours, fonts, the presets it uses for headlines, text, shapes and exits, and its sounds. Kept in this browser.</p>
              </form>
            ) : (
              <button type="button" className="btn small" onClick={() => setSaving(true)}>Save this scene as a style</button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
