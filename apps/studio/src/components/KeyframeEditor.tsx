import type { Clip, Scene } from '@unysonplus/scene-player/types';
import { namedEase } from '@unysonplus/scene-player/eases';
import { CurveEditor } from './CurveEditor';
import { NumberField } from './fields';
import {
  PROPS, SAME_MOMENT, clipEase, framesOf, keyAt, moveKey, removeKey, setKey, valueAt, writeFrames,
  type Keyframe, type PropKey,
} from '../lib/keyframes';

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The keyframes of a Keyframes clip: add one at the playhead, pick one to edit its values and the
 * curve of the move into it. Empty fields aren't keyed at that moment; they show the in-between value.
 */
export function KeyframeEditor(props: {
  scene: Scene;
  layerId: string;
  clip: Clip;
  /** Playhead, in seconds into this clip. */
  playhead: number;
  selectedKey: number | undefined;
  onSelectKey: (index: number | undefined) => void;
  onCommit: (scene: Scene) => void;
  /** Moves the playhead to a time in this clip. */
  onSeek: (tInClip: number) => void;
}) {
  const { clip, scene, layerId } = props;
  const frames = framesOf(clip);
  const fe = clipEase(clip);
  const inClip = props.playhead >= -1e-6 && props.playhead <= clip.duration + 1e-6;
  const used = PROPS.filter((p) => frames.some((f) => typeof f[p.key] === 'number'));
  const sel = props.selectedKey !== undefined && frames[props.selectedKey] ? props.selectedKey : undefined;
  const key = sel !== undefined ? frames[sel] : undefined;

  const write = (next: Keyframe[], select?: number) => {
    props.onCommit(writeFrames(scene, layerId, clip.id, next));
    props.onSelectKey(select);
  };

  const addAtPlayhead = () => {
    const t = Math.max(0, Math.min(clip.duration, props.playhead));
    const values: Partial<Keyframe> = {};
    // Key every property in use at its current value, so adding a keyframe never changes the motion.
    for (const p of used.length ? used : PROPS.filter((q) => q.key === 'x' || q.key === 'y')) {
      values[p.key] = r2(valueAt(frames, p.key, t, fe) ?? p.rest);
    }
    const r = setKey(frames, t, values);
    write(r.frames, r.index);
  };

  const addProp = (k: PropKey) => {
    const p = PROPS.find((q) => q.key === k)!;
    const t = key ? key.t : Math.max(0, Math.min(clip.duration, props.playhead));
    const r = setKey(frames, t, { [k]: r2(valueAt(frames, k, t, fe) ?? p.rest) });
    write(r.frames, r.index);
  };

  const fallbackLabel = namedEase[fe]?.label ?? fe;
  const atPlayhead = keyAt(frames, props.playhead);

  return (
    <div className="kf">
      <div className="kf-actions">
        <button type="button" className="btn small" disabled={!inClip} onClick={addAtPlayhead}
          title={inClip ? 'Key every property in use at the playhead' : 'Move the playhead inside this clip first'}>
          ◆ {atPlayhead >= 0 ? 'Update keyframe at playhead' : 'Add keyframe at playhead'}
        </button>
      </div>
      <p className="field-hint">
        Tip: with this clip selected and the playhead inside it, drag the layer on the stage to set its Move X/Y at the
        playhead. Diamonds on the timeline move keyframes in time.
      </p>

      {frames.length === 0 ? (
        <p className="kf-empty">No keyframes yet. Move the playhead inside the clip and add one, or drag the layer on the stage.</p>
      ) : (
        <ol className="kf-list">
          {frames.map((f, i) => {
            const keyed = PROPS.filter((p) => typeof f[p.key] === 'number');
            return (
              <li key={i} className={`kf-row${i === sel ? ' on' : ''}`}>
                <button type="button" className="kf-pick" aria-pressed={i === sel}
                  onClick={() => { props.onSelectKey(i === sel ? undefined : i); props.onSeek(f.t); }}>
                  <span className="kf-diamond" aria-hidden="true" />
                  <span className="mono">{f.t.toFixed(2)} s</span>
                  <span className="kf-sum">{keyed.map((p) => p.label).join(', ') || 'nothing keyed'}</span>
                </button>
                <button type="button" className="icon-link" aria-label={`Delete keyframe at ${f.t.toFixed(2)} s`} title="Delete keyframe"
                  onClick={() => write(removeKey(frames, i), undefined)}>×</button>
              </li>
            );
          })}
        </ol>
      )}

      {key && sel !== undefined && (
        <div className="kf-detail">
          <div className="insp-grid">
            <NumberField label="Time" value={key.t} unit="s" step={0.05} min={0} max={clip.duration}
              onCommit={(v) => {
                if (v === undefined) return;
                const clash = frames.findIndex((f, j) => j !== sel && Math.abs(f.t - v) < SAME_MOMENT);
                if (clash >= 0) return;
                const r = moveKey(frames, sel, v, clip.duration);
                write(r.frames, r.index);
              }} />
            {PROPS.map((p) => {
              const own = key[p.key];
              const between = valueAt(frames, p.key, key.t, fe);
              return (
                <NumberField key={p.key} label={p.label} value={typeof own === 'number' ? own : undefined} optional
                  placeholder={between === undefined ? String(p.rest) : String(r2(between))}
                  unit={p.unit} step={p.step} min={p.min} max={p.max}
                  onCommit={(v) => { const r = setKey(frames, key.t, { [p.key]: v === undefined ? undefined : v }); write(r.frames, r.index); }} />
              );
            })}
          </div>
          <p className="field-hint wide">Empty = not keyed here (the grey number is the in-between value). Move X/Y are % of the layer's own size.</p>

          <h4 className="kf-h">Move into this keyframe</h4>
          {sel === 0 ? (
            <p className="field-hint">The first keyframe has no move into it: its values hold from the start of the clip.</p>
          ) : (
            <CurveEditor value={key.ease} fallback={fe} fallbackLabel={fallbackLabel}
              onChange={(ease) => { const r = setKey(frames, key.t, { ease }); write(r.frames, r.index); }} />
          )}
        </div>
      )}

      {used.length < PROPS.length && (
        <div className="kf-add">
          <span className="field-hint">Animate also:</span>
          {PROPS.filter((p) => !used.includes(p)).map((p) => (
            <button key={p.key} type="button" className="curve-chip" disabled={!key && !inClip} onClick={() => addProp(p.key)}>+ {p.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
