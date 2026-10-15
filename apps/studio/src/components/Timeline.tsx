import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layer, Scene } from '@unysonplus/scene-player/types';
import { presetMeta } from '@unysonplus/scene-player/catalog';
import { addClip, layersIn, roundTime, scopePath, setClip } from '../lib/sceneOps';
import { groupDuration, groupOffset } from '@unysonplus/scene-player/groups';
import { PRESET_MIME } from './Library';
import { SAME_MOMENT, framesOf, isKeyframes, moveKey, writeFrames } from '../lib/keyframes';
import type { Clip } from '@unysonplus/scene-player/types';
import { selectedIds, selectLayers, type Selection } from './Inspector';
import { setLayerProps } from '../lib/sceneOps';

const NAME_W = 172;
const ROW_H = 30;

interface Props {
  scene: Scene;
  time: number;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onSeek: (t: number) => void;
  onCommit: (scene: Scene) => void;
  /** Gesture: live updates while dragging, one undo step when it ends. */
  onBegin: () => void;
  onLive: (scene: Scene) => void;
  onEnd: () => void;
  onAddLayer: (type: Exclude<Layer['type'], 'group'>) => void;
  /** The group being edited (null = the whole scene); its layers run on its own clock. */
  scope: string | null;
  onEnter: (groupId: string) => void;
  onLeaveTo: (groupId: string | null) => void;
}

/** A tick spacing that keeps labels at least ~64px apart at this zoom. */
function tickStep(pps: number) {
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60]) if (s * pps >= 64) return s;
  return 120;
}

const LAYER_GLYPH: Record<Layer['type'], string> = { text: 'T', shape: '◼', image: '▣', model: '◆', group: '❏' };

export function Timeline(props: Props) {
  const { scene, selection, scope } = props;
  // Inside a group everything is on the group's clock: 0 is the group's start in the scene.
  const offset = scope ? groupOffset(scene, scope) : 0;
  const time = props.time - offset;
  const scrollRef = useRef<HTMLDivElement>(null);
  /** The row a Shift + click range starts from: the last row clicked without Shift. */
  const anchorRef = useRef<string | null>(null);
  const [laneW, setLaneW] = useState(600);
  const [zoom, setZoom] = useState(1);
  const [dropRow, setDropRow] = useState<string | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLaneW(Math.max(200, el.clientWidth - NAME_W - 24)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The clock runs to the end of the scene; inside a group that is what is left of it after the
  // group starts (the group's own length is marked on the ruler).
  const D = Math.max(0.5, scene.duration - offset);
  const scopeGroup = scope ? scopePath(scene, scope).slice(-1)[0] : undefined;
  const groupLen = scopeGroup ? groupDuration(scopeGroup) : null;
  const pps = (laneW / D) * zoom;
  const width = D * pps;
  const step = tickStep(pps);
  const rows = useMemo(() => [...layersIn(scene, scope)].reverse(), [scene, scope]);

  // Keep the latest props for pointer handlers that outlive a render.
  const live = useRef(props);
  live.current = props;

  const xToTime = (clientX: number) => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    return (clientX - r.left - NAME_W + el.scrollLeft) / pps;
  };

  /* ---- scrubbing on the ruler ---- */
  const onRulerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const seekTo = (x: number) => live.current.onSeek(Math.max(0, Math.min(scene.duration, roundTime(xToTime(x) + offset))));
    seekTo(e.clientX);
    const move = (ev: PointerEvent) => seekTo(ev.clientX);
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  /* ---- moving and trimming clips ---- */
  const onClipDown = (e: React.PointerEvent, layer: Layer, clipId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const clip = layer.clips.find((c) => c.id === clipId)!;
    props.onSelect({ layerId: layer.id, clipId });
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const edge = Math.min(8, rect.width / 4);
    const mode: 'move' | 'start' | 'end' = e.clientX - rect.left < edge ? 'start' : rect.right - e.clientX < edge ? 'end' : 'move';
    const x0 = e.clientX;
    const s0 = clip.start;
    const d0 = clip.duration;
    // Edges worth snapping to: the scene's start and end, the playhead, and every other clip.
    const points = [0, D, live.current.time - offset];
    for (const l of layersIn(scene, scope)) for (const c of l.clips) if (c.id !== clipId) points.push(c.start, c.start + c.duration);
    const thr = 6 / pps;
    // Hold Alt to place freely.
    let free = false;
    const snap = (t: number) => {
      if (free) return t;
      let best = t;
      let dist = thr;
      for (const p of points) if (Math.abs(p - t) < dist) { dist = Math.abs(p - t); best = p; }
      return best;
    };
    let started = false;

    const move = (ev: PointerEvent) => {
      free = ev.altKey;
      const dt = (ev.clientX - x0) / pps;
      if (!started) {
        if (Math.abs(ev.clientX - x0) < 3) return;
        started = true;
        live.current.onBegin();
      }
      let start = s0;
      let duration = d0;
      if (mode === 'move') {
        start = Math.max(0, Math.min(D - d0, s0 + dt));
        const snappedStart = snap(start);
        const snappedEnd = snap(start + d0) - d0;
        start = snappedStart !== start ? snappedStart : snappedEnd !== start ? snappedEnd : start;
        start = Math.max(0, Math.min(D - d0, start));
      } else if (mode === 'start') {
        start = Math.max(0, Math.min(s0 + d0 - 0.05, snap(s0 + dt)));
        duration = s0 + d0 - start;
      } else {
        duration = Math.max(0.05, Math.min(D - s0, snap(s0 + d0 + dt) - s0));
      }
      live.current.onLive(setClip(live.current.scene, layer.id, clipId, { start: roundTime(start), duration: roundTime(duration) }));
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      if (started) live.current.onEnd();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  /* ---- keyframes: click a diamond to select it (and jump there), drag to move it in time ---- */
  const onKeyDown = (e: React.PointerEvent, layer: Layer, clip: Clip, index: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const frames0 = framesOf(clip);
    const f0 = frames0[index];
    props.onSelect({ layerId: layer.id, clipId: clip.id, key: index });
    props.onSeek(offset + clip.start + f0.t);
    const x0 = e.clientX;
    let started = false;
    let current = index;
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientX - x0) < 3) return;
        started = true;
        live.current.onBegin();
      }
      let t = Math.round((f0.t + (ev.clientX - x0) / pps) * 100) / 100;
      t = Math.max(0, Math.min(clip.duration, t));
      // Don't land on another keyframe's moment.
      if (frames0.some((f, j) => j !== index && Math.abs(f.t - t) < SAME_MOMENT)) return;
      const r = moveKey(frames0, index, t, clip.duration);
      current = r.index;
      live.current.onLive(writeFrames(live.current.scene, layer.id, clip.id, r.frames));
      live.current.onSeek(offset + clip.start + t);
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      if (started) {
        live.current.onEnd();
        live.current.onSelect({ layerId: layer.id, clipId: clip.id, key: current });
      }
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  /* ---- moving a group in time (its whole animation moves with it) ---- */
  const onGroupBarDown = (e: React.PointerEvent, layer: Layer) => {
    if (e.button !== 0 || layer.type !== 'group') return;
    e.stopPropagation();
    props.onSelect({ layerId: layer.id, clipId: null });
    const x0 = e.clientX;
    const s0 = layer.start ?? 0;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.abs(ev.clientX - x0) < 3) return;
        started = true;
        live.current.onBegin();
      }
      let start = Math.max(0, s0 + (ev.clientX - x0) / pps);
      if (!ev.altKey) {
        // Snap the start to the playhead and to whole tenths.
        const ph = live.current.time - offset;
        if (Math.abs(start - ph) < 6 / pps) start = ph;
        else start = Math.round(start * 10) / 10;
      }
      start = Math.min(start, Math.max(0, D - 0.1));
      live.current.onLive(setGroupStart(live.current.scene, layer.id, roundTime(start)));
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      if (started) live.current.onEnd();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  /* ---- dropping presets ---- */
  const canDrop = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(PRESET_MIME);
  const onDrop = (e: React.DragEvent, layer: Layer) => {
    setDropRow(null);
    const id = e.dataTransfer.getData(PRESET_MIME);
    if (!id) return;
    e.preventDefault();
    const at = Math.max(0, xToTime(e.clientX));
    const r = addClip(scene, layer.id, id, at, D);
    if (r) {
      props.onCommit(r.scene);
      props.onSelect({ layerId: layer.id, clipId: r.id });
    }
  };

  // Ctrl/Cmd + wheel zooms around the pointer.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => Math.max(1, Math.min(16, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const ticks: number[] = [];
  for (let t = 0; t <= D + 1e-6; t += step) ticks.push(Math.round(t * 1000) / 1000);

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="tl-bar">
        <h2>Timeline</h2>
        {scope && (
          <nav className="tl-crumbs" aria-label="Group path">
            <button type="button" className="crumb" onClick={() => props.onLeaveTo(null)}>Scene</button>
            {scopePath(scene, scope).map((g, i, all) => (
              <span key={g.id}>
                <span aria-hidden="true"> › </span>
                {i === all.length - 1
                  ? <strong>{g.name || g.id}</strong>
                  : <button type="button" className="crumb" onClick={() => props.onLeaveTo(g.id)}>{g.name || g.id}</button>}
              </span>
            ))}
          </nav>
        )}
        <div className="tl-add" role="group" aria-label="Add a layer">
          <button type="button" className="btn small" onClick={() => props.onAddLayer('text')}>+ Text</button>
          <button type="button" className="btn small" onClick={() => props.onAddLayer('shape')}>+ Shape</button>
          <button type="button" className="btn small" onClick={() => props.onAddLayer('image')}>+ Image</button>
          <button type="button" className="btn small" onClick={() => props.onAddLayer('model')} title="A 3D object: text, a shape, an SVG logo or a glTF model">+ 3D</button>
        </div>
        <label className="tl-zoom">
          <span>Zoom</span>
          <input type="range" min={1} max={16} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Timeline zoom" />
        </label>
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-inner" style={{ width: NAME_W + width + 24 }}>
          <div className="tl-ruler" onPointerDown={onRulerDown}>
            <div className="tl-corner">
              <span className="mono">{time.toFixed(2)}s{scope ? ' in group' : ''}</span>
            </div>
            <div className="tl-ticks" style={{ width }}>
              {ticks.map((t) => (
                <span key={t} className="tick" style={{ left: t * pps }}>
                  <span className="mono">{step < 1 ? t.toFixed(step < 0.5 ? 2 : 1) : t}s</span>
                </span>
              ))}
            </div>
          </div>

          {rows.length === 0 && (
            <div className="tl-empty">{scope ? 'This group is empty. Add a layer to it, or go back to the scene.' : 'No layers yet. Add a text, shape or image layer to start.'}</div>
          )}

          {rows.map((layer) => {
            const layerSel = selectedIds(selection).includes(layer.id);
            const start = layer.start ?? 0;
            const end = layer.end ?? D;
            return (
              <div key={layer.id} className={`tl-row${layerSel ? ' sel' : ''}${dropRow === layer.id ? ' drop' : ''}`} style={{ height: ROW_H }}>
                <div className="tl-head">
                <button
                  type="button"
                  className="tl-name"
                  title="Click to select. Shift + click selects every layer between, Ctrl + click adds or removes one."
                  onClick={(e) => {
                    const ids = selectedIds(selection);
                    const additive = e.ctrlKey || e.metaKey;
                    if (e.shiftKey) {
                      // A range, like a file list: from the last clicked row (or the first selected one) to this
                      // row. Locked layers in between are skipped, as on the stage.
                      const order = rows.map((r) => r.id);
                      const from = anchorRef.current && order.includes(anchorRef.current) && ids.includes(anchorRef.current)
                        ? anchorRef.current
                        : order.find((id) => ids.includes(id)) ?? layer.id;
                      const [a, b] = [order.indexOf(from), order.indexOf(layer.id)].sort((x, y) => x - y);
                      const range = rows.slice(a, b + 1).filter((r) => !r.locked || r.id === from || r.id === layer.id).map((r) => r.id);
                      props.onSelect(selectLayers(additive ? [...ids, ...range.filter((id) => !ids.includes(id))] : range));
                      return; // the anchor stays put, so a second Shift + click re-draws the range from it
                    }
                    anchorRef.current = layer.id;
                    if (additive) props.onSelect(selectLayers(ids.includes(layer.id) ? ids.filter((x) => x !== layer.id) : [...ids, layer.id]));
                    else props.onSelect({ layerId: layer.id, clipId: null });
                  }}
                  onDoubleClick={() => { if (layer.type === 'group') props.onEnter(layer.id); }}
                  aria-pressed={layerSel && !selection.clipId}
                >
                  <span className="tl-glyph" aria-hidden="true">{LAYER_GLYPH[layer.type]}</span>
                  <span className="tl-label">{layer.name || layer.id}</span>
                </button>
                <button
                  type="button"
                  className={`tl-lock${layer.locked ? ' on' : ''}`}
                  aria-pressed={!!layer.locked}
                  aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name || layer.id}`}
                  title={layer.locked ? 'Locked: can’t be selected or moved on the stage. Click to unlock.' : 'Lock so it can’t be selected or moved on the stage'}
                  onClick={() => props.onCommit(setLayerProps(scene, layer.id, { locked: layer.locked ? undefined : true }))}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    {layer.locked ? <path d="M8 11V8a4 4 0 0 1 8 0v3" /> : <path d="M8 11V8a4 4 0 0 1 7.5-2" />}
                  </svg>
                </button>
                </div>
                <div
                  className="tl-lane"
                  style={{ width }}
                  onPointerDown={(e) => { if (e.target === e.currentTarget) props.onSelect({ layerId: layer.id, clipId: null }); }}
                  onDragOver={(e) => { if (canDrop(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropRow(layer.id); } }}
                  onDragLeave={() => setDropRow((r) => (r === layer.id ? null : r))}
                  onDrop={(e) => onDrop(e, layer)}
                >
                  <div className="tl-span" style={{ left: start * pps, width: Math.max(0, (end - start) * pps) }} aria-hidden="true" />
                  {layer.type === 'group' && (
                    <button
                      type="button"
                      className="tl-groupbar"
                      style={{ left: start * pps, width: Math.max(10, groupDuration(layer) * pps) }}
                      onPointerDown={(e) => onGroupBarDown(e, layer)}
                      onDoubleClick={() => props.onEnter(layer.id)}
                      title="Drag to move the whole group in time. Double-click to open it."
                      aria-label={`Group ${layer.name || layer.id}: ${layer.layers.length} layers, from ${start.toFixed(2)} s. Double-click to open.`}
                    >
                      <span className="clip-label">{layer.layers.length} layers · open ↘</span>
                    </button>
                  )}
                  {layer.clips.map((c) => {
                    const meta = presetMeta[c.preset];
                    const out = c.params?.direction === 'out';
                    const sel = layerSel && selection.clipId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`clip cat-${meta?.category ?? 'motion'}${sel ? ' sel' : ''}`}
                        style={{ left: c.start * pps, width: Math.max(6, c.duration * pps) }}
                        onPointerDown={(e) => onClipDown(e, layer, c.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-pressed={sel}
                        aria-label={`${meta?.label ?? c.preset}${out ? ' out' : ''}, ${c.start.toFixed(2)} to ${(c.start + c.duration).toFixed(2)} seconds`}
                        title={`${meta?.label ?? c.preset}${out ? ' (out)' : ''} · ${c.start.toFixed(2)}–${(c.start + c.duration).toFixed(2)}s`}
                      >
                        <span className="clip-label">{meta?.label ?? c.preset}{out ? ' ↗' : ''}</span>
                        {isKeyframes(c) && framesOf(c).map((f, i) => (
                          <span
                            key={i}
                            role="button"
                            tabIndex={-1}
                            className={`kf-dot${sel && selection.key === i ? ' on' : ''}`}
                            style={{ left: f.t * pps }}
                            title={`Keyframe at ${f.t.toFixed(2)} s (drag to move it)`}
                            onPointerDown={(e) => onKeyDown(e, layer, c, i)}
                          />
                        ))}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {groupLen !== null && <div className="tl-groupend" style={{ left: NAME_W + groupLen * pps }} title="End of the group's own timeline" aria-hidden="true" />}
          {time >= 0 && time <= D && <div className="tl-playhead" style={{ left: NAME_W + time * pps }} aria-hidden="true" />}
          <div className="tl-after" style={{ left: NAME_W + width }} aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

/** Sets a group's start (in its parent's time), moving its whole animation. */
function setGroupStart(scene: Scene, id: string, start: number): Scene {
  const walk = (list: Layer[]): Layer[] => list.map((l) => {
    if (l.id === id) return { ...l, start: start || undefined } as Layer;
    return l.type === 'group' ? { ...l, layers: walk(l.layers) } : l;
  });
  return { ...scene, layers: walk(scene.layers) };
}
