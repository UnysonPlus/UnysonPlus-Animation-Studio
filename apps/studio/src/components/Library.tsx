import { useEffect, useMemo, useRef, useState } from 'react';
import { mount, type ScenePlayer } from '@unysonplus/scene-player';
import { CATEGORY_LABELS, PRESET_CATALOG, type PresetCategory, type PresetMeta } from '@unysonplus/scene-player/catalog';
import type { Layer, Scene } from '@unysonplus/scene-player/types';

export const PRESET_MIME = 'application/x-upw-preset';

/** A one-layer scene that shows a preset on its own, for the hover preview. */
function sampleScene(p: PresetMeta): Scene {
  const textual = p.appliesTo.includes('text');
  const layer: Layer = textual
    ? { id: 's', type: 'text', text: p.id === 'text-scramble' || p.id === 'text-typewriter' ? 'Motion' : 'Aa', style: { fontSize: p.id === 'text-scramble' || p.id === 'text-typewriter' ? 17 : 30, fontWeight: 800, color: '#f4f6f8' }, box: { x: 50, y: 52 }, clips: [] }
    : { id: 's', type: 'shape', shape: 'rect', fill: '#2ad38b', radius: 3, box: { x: 50, y: 50, w: 26, ratio: 1 }, clips: [] };
  const d = Math.min(p.defaultDuration, 2.4);
  layer.clips = [{ id: 'c', preset: p.id, start: 0.15, duration: d, params: p.id === 'keyframes' ? { frames: [{ t: 0, scale: 0.8, rotate: -8 }, { t: d, scale: 1.1, rotate: 8 }] } : undefined }];
  return {
    format: 'unysonplus-scene', version: 1, duration: d + 0.75,
    stage: { breakpoints: [{ id: 'a', minWidth: 0, aspect: [16, 10] }], heightMode: 'ratio', safeArea: 0 },
    playback: { trigger: 'manual', loop: true, repeatDelay: 0.3 },
    layers: [layer],
  };
}

function Thumb({ preset, active }: { preset: PresetMeta; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    let player: ScenePlayer | null = null;
    try {
      player = mount(ref.current, sampleScene(preset), { editor: true, autoplay: false });
      player.play();
    } catch {
      /* A preview that can't play just stays blank. */
    }
    return () => player?.destroy();
  }, [active, preset]);
  return (
    <div className="thumb" aria-hidden="true">
      {active ? <div ref={ref} className="thumb-live" /> : <span className={preset.appliesTo.includes('text') ? 'thumb-aa' : 'thumb-sq'}>{preset.appliesTo.includes('text') ? 'Aa' : ''}</span>}
    </div>
  );
}

export function Library(props: {
  /** The selected layer's type, if any: presets that don't fit it are shown as unavailable. */
  layerType: Layer['type'] | null;
  /** How many layers are selected; with several, a click adds the preset to each one it suits. */
  count: number;
  onApply: (presetId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [hot, setHot] = useState<string | null>(null);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = PRESET_CATALOG.filter((p) => !q || p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    const order: PresetCategory[] = ['text', 'reveal', 'motion', 'emphasis'];
    return order.map((c) => ({ c, items: list.filter((p) => p.category === c) })).filter((g) => g.items.length);
  }, [query]);

  return (
    <aside className="library" aria-labelledby="lib-title">
      <div className="lib-head">
        <h2 id="lib-title">Presets</h2>
        <input type="search" className="lib-search" placeholder="Search presets" aria-label="Search presets" value={query} onChange={(e) => setQuery(e.target.value)} />
        <p className="lib-help">
          {props.count > 1
            ? `Click a preset to add it at the playhead to each of the ${props.count} selected layers it suits.`
            : props.layerType
              ? 'Drag a preset onto a timeline row, or click to add it to the selected layer at the playhead.'
              : 'Drag a preset onto a timeline row. Select a layer to add presets by clicking.'}
        </p>
      </div>
      <div className="lib-scroll">
        {groups.map((g) => (
          <section key={g.c} className="lib-group">
            <h3>{CATEGORY_LABELS[g.c]}</h3>
            <ul>
              {g.items.map((p) => {
                const fits = props.count > 1 || !props.layerType || p.appliesTo.includes(props.layerType);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={`preset${fits ? '' : ' unfit'}`}
                      draggable
                      title={p.description}
                      aria-disabled={!props.layerType || !fits}
                      aria-describedby={`pd-${p.id}`}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(PRESET_MIME, p.id);
                        e.dataTransfer.setData('text/plain', p.label);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => props.layerType && fits && props.onApply(p.id)}
                      onPointerEnter={() => setHot(p.id)}
                      onPointerLeave={() => setHot((h) => (h === p.id ? null : h))}
                      onFocus={() => setHot(p.id)}
                      onBlur={() => setHot((h) => (h === p.id ? null : h))}
                    >
                      <Thumb preset={p} active={hot === p.id} />
                      <span className="preset-label">{p.label}</span>
                      <span className="sr-only" id={`pd-${p.id}`}>{p.description}{p.appliesTo.includes('text') && p.appliesTo.length === 1 ? ' Text layers only.' : ''}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!groups.length && <p className="lib-empty">No preset matches “{query}”.</p>}
      </div>
    </aside>
  );
}
