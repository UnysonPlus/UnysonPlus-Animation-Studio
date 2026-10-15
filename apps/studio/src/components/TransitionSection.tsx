import { useState } from 'react';
import type { GroupLayer, Scene } from '@unysonplus/scene-player/types';
import { NumberField, Section, SelectField } from './fields';
import { TRANSITIONS, applyTransition, groupEndTime, nextGroup, type PushTo, type TransitionStyle } from '../lib/transitions';

/** In the group inspector: hand this group over to the next one with a matched exit and entrance. */
export function TransitionSection(props: { scene: Scene; group: GroupLayer; onCommit: (scene: Scene) => void }) {
  const { scene, group } = props;
  const next = nextGroup(scene, group.id);
  const [style, setStyle] = useState<TransitionStyle>('push');
  const [duration, setDuration] = useState(0.8);
  const [pushTo, setPushTo] = useState<PushTo>('left');
  const hint = TRANSITIONS.find((t) => t.id === style)?.hint;

  return (
    <Section title="Transition to the next group">
      {next ? (
        <>
          <p className="field-hint wide">
            Next: <strong>{next.name || next.id}</strong> (starts {(next.start ?? 0).toFixed(1)} s). This group's clock ends at{' '}
            {groupEndTime(group).toFixed(1)} s; the transition ends there, and the next group starts as it begins.
          </p>
          <SelectField label="Style" value={style} options={TRANSITIONS.map((t) => ({ value: t.id, label: t.label }))} onChange={(v) => setStyle(v as TransitionStyle)} />
          <NumberField label="Length" value={duration} step={0.1} min={0.2} max={3} unit="s" onCommit={(v) => v && setDuration(v)} />
          {style === 'push' && (
            <SelectField label="Push toward" value={pushTo} onChange={(v) => setPushTo(v as PushTo)}
              options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }]} />
          )}
          <p className="field-hint wide">{hint} It replaces this group's exit and the next group's entrance, as ordinary clips you can edit.</p>
          <button type="button" className="btn small wide-btn" onClick={() => props.onCommit(applyTransition(scene, group.id, next.id, style, duration, pushTo))}>
            Apply transition
          </button>
        </>
      ) : (
        <p className="field-hint wide">No later group at this level. Put the next part of the scene in a group that starts after this one, and a transition can hand over to it.</p>
      )}
    </Section>
  );
}
