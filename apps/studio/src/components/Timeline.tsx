import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layer, Scene } from '@unysonplus/scene-player/types';
import { presetMeta } from '@unysonplus/scene-player/catalog';
import { addClip, roundTime, setClip } from '../lib/sceneOps';
import { PRESET_MIME } from './Library';
import type { Selection } from './Inspector';

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
  onAddLayer: (type: Layer['type']) => void;
}

/** A tick spacing that keeps labels at least ~64px apart at this zoom. */
function tickStep(pps: number) {
  for (const s of [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60]) if (s * pps >= 64) return s;
  return 120;
}

const LAYER_GLYPH: Record<Layer['type'], string> = { text: 'T', shape: '◼', image: '▣' };

export function Timeline(props: Props) {
  const { scene, time, selection } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const D = scene.duration;
  const pps = (laneW / D) * zoom;
  const width = D * pps;
  const step = tickStep(pps);
  const rows = useMemo(() => [...scene.layers].reverse(), [scene.layers]);

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
    const seekTo = (x: number) => live.current.onSeek(Math.max(0, Math.min(D, roundTime(xToTime(x)))));
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
    const points = [0, D, live.current.time];
    for (const l of scene.layers) for (const c of l.clips) if (c.id !== clipId) points.push(c.start, c.start + c.duration);
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

  /* ---- dropping presets ---- */
  const canDrop = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(PRESET_MIME);
  const onDrop = (e: React.DragEvent, layer: Layer) => {
    setDropRow(null);
    const id = e.dataTransfer.getData(PRESET_MIME);
    if (!id) return;
    e.preventDefault();
    const at = Math.max(0, xToTime(e.clientX));
    const r = addClip(scene, layer.id, id, at);
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
        <div className="tl-add" role="group" aria-label="Add a layer">
          <button type="button" className="btn small" onClick={() => props.onAddLayer('text')}>+ Text</button>
          <button type="button" className="btn small" onClick={() => props.onAddLayer('shape')}>+ Shape</button>
          <button type="button" className="btn small" onClick={() => props.onAddLayer('image')}>+ Image</button>
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
              <span className="mono">{time.toFixed(2)}s</span>
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
            <div className="tl-empty">No layers yet. Add a text, shape or image layer to start.</div>
          )}

          {rows.map((layer) => {
            const layerSel = selection.layerId === layer.id;
            const start = layer.start ?? 0;
            const end = layer.end ?? D;
            return (
              <div key={layer.id} className={`tl-row${layerSel ? ' sel' : ''}${dropRow === layer.id ? ' drop' : ''}`} style={{ height: ROW_H }}>
                <button type="button" className="tl-name" onClick={() => props.onSelect({ layerId: layer.id, clipId: null })} aria-pressed={layerSel && !selection.clipId}>
                  <span className="tl-glyph" aria-hidden="true">{LAYER_GLYPH[layer.type]}</span>
                  <span className="tl-label">{layer.name || layer.id}</span>
                </button>
                <div
                  className="tl-lane"
                  style={{ width }}
                  onPointerDown={(e) => { if (e.target === e.currentTarget) props.onSelect({ layerId: layer.id, clipId: null }); }}
                  onDragOver={(e) => { if (canDrop(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropRow(layer.id); } }}
                  onDragLeave={() => setDropRow((r) => (r === layer.id ? null : r))}
                  onDrop={(e) => onDrop(e, layer)}
                >
                  <div className="tl-span" style={{ left: start * pps, width: Math.max(0, (end - start) * pps) }} aria-hidden="true" />
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
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="tl-playhead" style={{ left: NAME_W + time * pps }} aria-hidden="true" />
          <div className="tl-after" style={{ left: NAME_W + width }} aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
