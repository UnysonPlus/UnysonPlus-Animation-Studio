import { useState } from 'react';
import type { CameraKey, Scene } from '@unysonplus/scene-player/types';
import { NAMED_EASES } from '@unysonplus/scene-player/eases';
import { CAMERA_EASE } from '@unysonplus/scene-player/camera';
import { Field, NumberField, Section } from './fields';
import { CAMERA_MOVES, addCameraMove, cameraKeys, removeCameraKey, setCameraKey, type CameraMove } from '../lib/cameraOps';

/** The Inspector for a camera key: where the view is at that moment, and ready-made moves. */
export function CameraInspector(props: {
  scene: Scene;
  keyId: string;
  time: number;
  cameraView: boolean;
  onCommit: (scene: Scene) => void;
  onSelectKey: (id: string | null) => void;
  onSeek: (t: number) => void;
}) {
  const { scene } = props;
  const keys = cameraKeys(scene);
  const k = keys.find((x) => x.id === props.keyId);
  const [move, setMove] = useState<CameraMove>('push');
  const [len, setLen] = useState(2);
  if (!k) return null;
  const index = keys.indexOf(k);
  const set = (patch: Partial<CameraKey>) => props.onCommit(setCameraKey(scene, k.id, patch));
  const num = (key: keyof CameraKey, label: string, unit: string, step: number, min: number, max: number, rest: number, scale = 1) => (
    <NumberField label={label} value={typeof k[key] === 'number' ? Math.round((k[key] as number) * scale * 1000) / 1000 : undefined}
      placeholder={`${rest * scale} (held)`} optional step={step} min={min * scale} max={max * scale} unit={unit}
      onCommit={(v) => set({ [key]: v === undefined ? undefined : v / scale } as Partial<CameraKey>)} />
  );

  return (
    <div className="insp">
      <div className="insp-head">
        <p className="insp-kicker">Camera</p>
        <h2 className="insp-title-static">Key {index + 1} of {keys.length}</h2>
        <p className="insp-help">
          Where the camera is at {k.t.toFixed(2)} s. It moves from the previous key to this one; a value left empty
          holds where it was. {!props.cameraView && 'Camera view is off in the toolbar, so the stage shows the flat layout.'}
        </p>
      </div>

      <Section title="View">
        <NumberField label="Time" value={k.t} step={0.05} min={0} max={scene.duration} unit="s" onCommit={(v) => { if (v !== undefined) { set({ t: v }); props.onSeek(v); } }} />
        {num('zoom', 'Zoom', '×', 0.05, 0.2, 8, 1)}
        {num('x', 'Pan across', '%', 1, -100, 100, 0)}
        {num('y', 'Pan down', '%', 1, -100, 100, 0)}
        {num('tiltX', 'Tilt back', '°', 1, -70, 70, 0)}
        {num('tiltY', 'Turn', '°', 1, -70, 70, 0)}
        {num('roll', 'Roll', '°', 1, -180, 180, 0)}
        <Field label="Move into it">
          {(id) => (
            <select id={id} value={k.ease ?? CAMERA_EASE} onChange={(e) => set({ ease: e.target.value === CAMERA_EASE ? undefined : e.target.value })}>
              {NAMED_EASES.map((e) => <option key={e.id} value={e.id}>{e.label}{e.id === CAMERA_EASE ? ' (default)' : ''}</option>)}
              <option value="none">Linear</option>
            </select>
          )}
        </Field>
        <p className="field-hint wide">Zoom 2 is twice as close; panning moves the view (the stage's centre goes this far). Tilt and turn lean the whole scene in perspective.</p>
      </Section>

      <Section title="Add a move from the playhead">
        <Field label="Move">
          {(id) => (
            <select id={id} value={move} onChange={(e) => setMove(e.target.value as CameraMove)}>
              {CAMERA_MOVES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          )}
        </Field>
        <NumberField label="Length" value={len} step={0.1} min={0.2} max={20} unit="s" onCommit={(v) => v && setLen(v)} />
        <p className="field-hint wide">{CAMERA_MOVES.find((m) => m.id === move)?.hint} Starts from where the camera is at {props.time.toFixed(2)} s.</p>
        <button type="button" className="btn small wide-btn" onClick={() => {
          const r = addCameraMove(scene, props.time, move, len);
          props.onCommit(r.scene);
          props.onSelectKey(r.ids[r.ids.length - 1]);
        }}>Add {CAMERA_MOVES.find((m) => m.id === move)?.label}</button>
      </Section>

      <div className="insp-actions">
        <button type="button" className="btn small danger" onClick={() => { props.onCommit(removeCameraKey(scene, k.id)); props.onSelectKey(null); }}>Delete key</button>
      </div>
    </div>
  );
}
