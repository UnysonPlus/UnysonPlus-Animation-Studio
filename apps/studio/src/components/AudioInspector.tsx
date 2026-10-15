import type { AudioClip, Scene } from '@unysonplus/scene-player/types';
import { NumberField, Section, SelectField, TextField } from './fields';
import { removeAudio, setAudio, type AudioInfo } from '../lib/audio';

/** The Inspector for a selected audio clip: timing, trim, volume and fades. */
export function AudioInspector(props: {
  scene: Scene;
  clip: AudioClip;
  info: AudioInfo | undefined;
  onCommit: (scene: Scene) => void;
  onDeselect: () => void;
}) {
  const { scene, clip, info } = props;
  const set = (patch: Partial<AudioClip>) => props.onCommit(setAudio(scene, clip.id, patch));
  const trimIn = clip.offset ?? 0;
  const fileLen = info?.duration;
  const len = clip.duration ?? (fileLen !== undefined ? fileLen - trimIn : undefined);
  const uploaded = clip.src.startsWith('data:');
  const kb = uploaded ? Math.round((clip.src.length * 3) / 4 / 1024) : 0;

  return (
    <div className="insp">
      <div className="insp-head">
        <p className="insp-kicker">Audio</p>
        <input className="insp-title" aria-label="Audio name" defaultValue={clip.name ?? clip.id} key={clip.id + (clip.name ?? '')}
          onBlur={(e) => { if (e.target.value !== (clip.name ?? clip.id)) set({ name: e.target.value || undefined }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <p className="insp-help">
          {fileLen !== undefined ? `${fileLen.toFixed(2)} s file` : 'Reading the file…'}
          {uploaded ? ` · uploaded (${kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`}, stored in the scene)` : ' · from an address'}
        </p>
      </div>

      <Section title="Timing">
        <NumberField label="Starts" value={clip.start} step={0.05} min={0} max={scene.duration} unit="s" onCommit={(v) => v !== undefined && set({ start: v })} />
        <NumberField label="Length" value={clip.duration} placeholder={len !== undefined ? len.toFixed(2) : ''} step={0.05} min={0.1} max={fileLen !== undefined ? fileLen - trimIn : undefined} unit="s" optional
          onCommit={(v) => set({ duration: v })} />
        <NumberField label="Trim start" value={trimIn} step={0.05} min={0} max={fileLen} unit="s" onCommit={(v) => set({ offset: v || undefined })} />
        <SelectField label="Kind" value={clip.role ?? 'sfx'} onChange={(v) => set({ role: v as AudioClip['role'] })}
          options={[{ value: 'voice', label: 'Voice-over' }, { value: 'music', label: 'Music' }, { value: 'sfx', label: 'Sound effect' }]} />
        <p className="field-hint wide">Drag the clip on the timeline to move it; drag an edge to trim. Length left empty plays to the end of the file.</p>
      </Section>

      <Section title="Level">
        <NumberField label="Volume" value={Math.round((clip.volume ?? 1) * 100)} step={5} min={0} max={200} unit="%" onCommit={(v) => set({ volume: v === undefined || v === 100 ? undefined : v / 100 })} />
        <span />
        <NumberField label="Fade in" value={clip.fadeIn ?? 0} step={0.05} min={0} unit="s" onCommit={(v) => set({ fadeIn: v || undefined })} />
        <NumberField label="Fade out" value={clip.fadeOut ?? 0} step={0.05} min={0} unit="s" onCommit={(v) => set({ fadeOut: v || undefined })} />
      </Section>

      <Section title="Source">
        <TextField label="Address" wide mono value={uploaded ? '(uploaded file)' : clip.src}
          onCommit={(v) => { const t = v.trim(); if (t && t !== '(uploaded file)') set({ src: t }); }} />
        <p className="field-hint wide">
          On websites, sound starts muted with a "Tap for sound" button (browsers block sound until the visitor interacts).
          Scenes that play as the page scrolls stay silent. Video exports include the sound.
          {uploaded && kb > 1024 ? ' A file this size makes share links and embeds heavy: an address (for example your WordPress media library) keeps them light.' : ''}
        </p>
      </Section>

      <div className="insp-actions">
        <button type="button" className="btn small danger" onClick={() => { props.onCommit(removeAudio(scene, clip.id)); props.onDeselect(); }}>Delete audio</button>
      </div>
    </div>
  );
}
