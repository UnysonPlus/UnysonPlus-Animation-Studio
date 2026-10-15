import type { Anchor, Breakpoint, Layer, Scene } from '@unysonplus/scene-player/types';
import { PRESET_CATALOG, presetMeta, type PresetField } from '@unysonplus/scene-player/catalog';
import {
  clearOverride, duplicateLayer, editsOverride, findClip, findLayer, moveLayer, primaryBreakpoint,
  removeClip, removeLayer, setClip, setClipParam, setLayerProps, writeLayout, type LayoutPatch,
} from '../lib/sceneOps';
import { validateScene } from '@unysonplus/scene-player/validate';
import demo from '../scenes/demo.json';
import { CheckField, ColorField, Field, NumberField, Section, SelectField, TextField } from './fields';
import { AlignPanel, type AlignMode, type AlignTo } from './AlignPanel';

/** A starting point with nothing on it, sharing the demo's stage set-up. */
function blankScene(from: Scene): Scene {
  return { ...from, title: 'Untitled', layers: [] };
}

export interface Selection {
  /** The primary layer: the one the inspector shows. */
  layerId: string | null;
  clipId: string | null;
  /** Every selected layer, primary last, when more than one is selected. */
  multi?: string[];
}

/** All selected layer ids (primary last). */
export const selectedIds = (sel: Selection): string[] => (sel.multi && sel.multi.length > 1 ? sel.multi : sel.layerId ? [sel.layerId] : []);

/** A selection of these layers, the last one primary. */
export const selectLayers = (ids: string[]): Selection => {
  const unique = [...new Set(ids)];
  return { layerId: unique[unique.length - 1] ?? null, clipId: null, multi: unique.length > 1 ? unique : undefined };
};

interface Props {
  scene: Scene;
  selection: Selection;
  /** The breakpoint showing in the preview; layout edits apply to it. */
  bp: string | null;
  onCommit: (scene: Scene) => void;
  onSelect: (sel: Selection) => void;
  alignTo: AlignTo;
  onAlignTo: (to: AlignTo) => void;
  onAlign: (mode: AlignMode) => void;
}

const EASES = [
  'none', 'power1.out', 'power2.out', 'power3.out', 'power4.out', 'expo.out', 'circ.out', 'back.out(1.6)',
  'power2.in', 'power3.in', 'expo.in', 'power2.inOut', 'power3.inOut', 'expo.inOut', 'sine.inOut',
];

const WEIGHTS = ['300', '400', '500', '600', '700', '800', '900'].map((w) => ({ value: w, label: w }));
const ANCHORS: Anchor[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];

const bpLabel = (scene: Scene, id: string | null) => {
  const bp = scene.stage.breakpoints.find((b) => b.id === id);
  return bp?.label ?? bp?.id ?? 'this';
};

export function Inspector(props: Props) {
  const { scene, selection } = props;
  const layer = findLayer(scene, selection.layerId);
  const clip = findClip(scene, selection.layerId, selection.clipId);
  const ids = selectedIds(selection);
  if (ids.length > 1) return <MultiInspector {...props} ids={ids} />;
  if (layer && clip) return <ClipInspector {...props} layer={layer} clipId={clip.id} />;
  if (layer) return <LayerInspector {...props} layer={layer} />;
  return <SceneInspector {...props} />;
}

/* ------------------------------------------------------------------ scene */

function SceneInspector({ scene, onCommit }: Props) {
  const set = (patch: Partial<Scene>) => onCommit({ ...scene, ...patch });
  const setStage = (patch: Partial<Scene['stage']>) => onCommit({ ...scene, stage: { ...scene.stage, ...patch } });
  const setPlayback = (patch: Partial<Scene['playback']>) => onCommit({ ...scene, playback: { ...scene.playback, ...patch } });
  const setBp = (i: number, patch: Partial<Breakpoint>) =>
    setStage({ breakpoints: scene.stage.breakpoints.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const fonts = scene.stage.fonts ?? [];

  return (
    <div className="insp">
      <div className="insp-head">
        <p className="insp-kicker">Scene</p>
        <p className="insp-help">Select a layer on the stage or the timeline to edit it.</p>
        <div className="insp-start">
          <button type="button" className="btn small" onClick={() => onCommit(blankScene(scene))}>Start a blank scene</button>
          <button type="button" className="btn small" onClick={() => onCommit(validateScene(demo).scene)}>Load the demo</button>
        </div>
      </div>

      <Section title="Scene">
        <TextField label="Title" value={scene.title} onCommit={(v) => set({ title: v || undefined })} wide />
        <NumberField label="Length" value={scene.duration} unit="s" step={0.1} min={0.5} max={600} onCommit={(v) => v && set({ duration: v })} />
      </Section>

      <Section title="Playback">
        <SelectField
          label="Starts"
          value={scene.playback.trigger}
          options={[{ value: 'view', label: 'When scrolled into view' }, { value: 'load', label: 'When the page loads' }, { value: 'manual', label: 'Only when told to' }]}
          onChange={(v) => setPlayback({ trigger: v })}
        />
        <CheckField label="Loop" checked={scene.playback.loop} onChange={(v) => setPlayback({ loop: v })} />
        {scene.playback.loop && (
          <NumberField label="Pause between loops" value={scene.playback.repeatDelay ?? 0} unit="s" step={0.1} min={0} onCommit={(v) => setPlayback({ repeatDelay: v ?? 0 })} />
        )}
        <NumberField
          label="Still frame"
          value={scene.playback.posterTime}
          placeholder={String(scene.duration)}
          unit="s" step={0.1} min={0} max={scene.duration} optional
          onCommit={(v) => setPlayback({ posterTime: v })}
        />
        <p className="field-hint wide">The still frame is what visitors who turn off animation see.</p>
      </Section>

      <Section title="Stage">
        <SelectField
          label="Height"
          value={scene.stage.heightMode}
          options={[{ value: 'ratio', label: 'Keep the shape' }, { value: 'ratio-capped', label: 'Keep the shape, fit the window' }, { value: 'fill', label: 'Fill the window' }]}
          onChange={(v) => setStage({ heightMode: v })}
        />
        <NumberField label="Header offset" value={scene.stage.heightOffset ?? 0} unit="px" min={0} step={1} onCommit={(v) => setStage({ heightOffset: v || undefined })} />
        <NumberField label="Safe area" value={Math.round((scene.stage.safeArea ?? 0.06) * 1000) / 10} unit="%" min={0} max={45} step={0.5} onCommit={(v) => setStage({ safeArea: (v ?? 6) / 100 })} />
        <ColorField label="Background" value={scene.stage.background} placeholder="A colour or gradient" onCommit={(v) => setStage({ background: v || undefined })} />
      </Section>

      <Section title="Breakpoints">
        <div className="bp-table wide" role="table" aria-label="Breakpoints">
          <div className="bp-row bp-headrow" role="row">
            <span role="columnheader">Name</span><span role="columnheader">From width</span><span role="columnheader">Shape</span><span />
          </div>
          {scene.stage.breakpoints.map((b, i) => (
            <div className="bp-row" role="row" key={b.id}>
              <input aria-label="Breakpoint name" value={b.label ?? b.id} onChange={(e) => setBp(i, { label: e.target.value })} />
              <input aria-label="From width (px)" inputMode="numeric" defaultValue={b.minWidth} key={`mw${b.minWidth}`}
                onBlur={(e) => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0 && n !== b.minWidth) setBp(i, { minWidth: n }); }} />
              <span className="bp-ratio">
                <input aria-label="Shape width" inputMode="numeric" defaultValue={b.aspect[0]} key={`aw${b.aspect[0]}`}
                  onBlur={(e) => { const n = Number(e.target.value); if (n > 0 && n !== b.aspect[0]) setBp(i, { aspect: [n, b.aspect[1]] }); }} />
                <span aria-hidden="true">:</span>
                <input aria-label="Shape height" inputMode="numeric" defaultValue={b.aspect[1]} key={`ah${b.aspect[1]}`}
                  onBlur={(e) => { const n = Number(e.target.value); if (n > 0 && n !== b.aspect[1]) setBp(i, { aspect: [b.aspect[0], n] }); }} />
              </span>
              <button type="button" className="icon-link" aria-label={`Remove ${b.label ?? b.id}`} disabled={scene.stage.breakpoints.length < 2}
                onClick={() => setStage({ breakpoints: scene.stage.breakpoints.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button type="button" className="btn ghost small" onClick={() => {
            const n = scene.stage.breakpoints.length + 1;
            const id = `bp-${n}`;
            setStage({ breakpoints: [...scene.stage.breakpoints, { id, label: `Breakpoint ${n}`, minWidth: 0, aspect: [1, 1] }] });
          }}>Add breakpoint</button>
        </div>
      </Section>

      <Section title="Fonts">
        {fonts.map((f, i) => (
          <div className="font-row wide" key={i}>
            <TextField label="Family" value={f.family} onCommit={(v) => setStage({ fonts: fonts.map((x, j) => (j === i ? { ...x, family: v } : x)) })} />
            <TextField label="Stylesheet address" value={f.href} mono placeholder="https://…" onCommit={(v) => setStage({ fonts: fonts.map((x, j) => (j === i ? { ...x, href: v || undefined } : x)) })} />
            <button type="button" className="btn ghost small" onClick={() => setStage({ fonts: fonts.filter((_, j) => j !== i) })}>Remove font</button>
          </div>
        ))}
        <button type="button" className="btn ghost small wide-btn" onClick={() => setStage({ fonts: [...fonts, { family: 'Inter', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap' }] })}>Add font</button>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ layer */

/* ------------------------------------------------------------------ several layers */

function MultiInspector({ scene, ids, bp, onCommit, onSelect, alignTo, onAlignTo, onAlign }: Props & { ids: string[] }) {
  const layers = ids.map((id) => findLayer(scene, id)).filter((l): l is Layer => !!l);
  const anyOverride = layers.some((l) => editsOverride(scene, l, bp));
  return (
    <div className="insp">
      <div className="insp-head">
        <p className="insp-kicker">Selection</p>
        <h2 className="insp-title-static">{layers.length} layers</h2>
        <ul className="multi-list">
          {layers.map((l) => (
            <li key={l.id}>
              <button type="button" className="crumb" onClick={() => onSelect({ layerId: l.id, clipId: null })}>{l.name || l.id}</button>
            </li>
          ))}
        </ul>
        {anyOverride && (
          <div className="bp-note is-override">
            <p>Moves apply to the <strong>{bpLabel(scene, bp)}</strong> layout only.</p>
          </div>
        )}
      </div>

      <section className="insp-section">
        <header><h3>Align and distribute</h3></header>
        <AlignPanel count={layers.length} to={alignTo} onTo={onAlignTo} onAlign={onAlign} />
      </section>

      <p className="field-hint">Drag any of them on the stage to move them together. Click a preset to add it to each layer it suits.</p>

      <div className="insp-actions">
        <button type="button" className="btn small danger" onClick={() => {
          let next = scene;
          for (const l of layers) next = removeLayer(next, l.id);
          onCommit(next);
          onSelect({ layerId: null, clipId: null });
        }}>Delete {layers.length} layers</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ layer */

function LayerInspector({ scene, layer, bp, onCommit, onSelect, alignTo, onAlignTo, onAlign }: Props & { layer: Layer }) {
  const override = editsOverride(scene, layer, bp);
  const hasOverride = !!(bp && layer.overrides?.[bp]);
  const o = (bp && layer.overrides?.[bp]) || {};
  const box = { ...layer.box, ...(o.box ?? {}) };
  const style = layer.type === 'text' ? { ...layer.style, ...(o.style ?? {}) } : undefined;
  const text = layer.type === 'text' ? o.text ?? layer.text : undefined;

  const layout = (patch: LayoutPatch) => onCommit(writeLayout(scene, layer.id, bp, patch));
  const props = (p: Record<string, unknown>) => onCommit(setLayerProps(scene, layer.id, p));
  const idx = scene.layers.findIndex((l) => l.id === layer.id);
  const fonts = scene.stage.fonts ?? [];
  const primary = primaryBreakpoint(scene);

  return (
    <div className="insp">
      <div className="insp-head">
        <p className="insp-kicker">{layer.type === 'text' ? 'Text layer' : layer.type === 'shape' ? 'Shape layer' : 'Image layer'}</p>
        <input className="insp-title" aria-label="Layer name" defaultValue={layer.name ?? layer.id} key={layer.id + (layer.name ?? '')}
          onBlur={(e) => { if (e.target.value !== (layer.name ?? layer.id)) props({ name: e.target.value || undefined }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <div className={`bp-note${override ? ' is-override' : ''}`}>
          <p>
            {override
              ? <>Position, size and type changes apply to the <strong>{bpLabel(scene, bp)}</strong> layout only.</>
              : <>Editing the base layout. Switch to a smaller screen size to change that layout separately.</>}
          </p>
          {hasOverride && (
            <button type="button" className="btn ghost small" onClick={() => onCommit(clearOverride(scene, layer.id, bp!))}>
              Reset {bpLabel(scene, bp)} to {bpLabel(scene, primary)}
            </button>
          )}
        </div>
      </div>

      {layer.type === 'text' && style && (
        <Section title="Text">
          <TextField label="Text" value={text} multiline onCommit={(v) => layout({ text: v })} />
          <SelectField
            label="Font"
            value={style.fontFamily ?? ''}
            options={[{ value: '', label: 'System' }, ...fonts.map((f) => ({ value: f.family, label: f.family }))]}
            onChange={(v) => layout({ style: { fontFamily: v || undefined } })}
          />
          <NumberField label="Size" value={style.fontSize} step={0.1} min={0.2} max={60} unit="su" onCommit={(v) => v && layout({ style: { fontSize: v } })} />
          <SelectField label="Weight" value={String(style.fontWeight ?? 400)} options={WEIGHTS} onChange={(v) => layout({ style: { fontWeight: Number(v) } })} />
          <NumberField label="Line height" value={style.lineHeight ?? 1.05} step={0.05} min={0.5} max={3} onCommit={(v) => layout({ style: { lineHeight: v } })} />
          <NumberField label="Letter spacing" value={style.letterSpacing ?? 0} step={0.01} min={-0.5} max={2} unit="em" onCommit={(v) => layout({ style: { letterSpacing: v } })} />
          <SelectField
            label="Align"
            value={style.align ?? 'center'}
            options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]}
            onChange={(v) => layout({ style: { align: v } })}
          />
          <ColorField label="Colour" value={style.color} onCommit={(v) => layout({ style: { color: v || undefined } })} />
          <CheckField label="Capitals" checked={!!style.uppercase} onChange={(v) => layout({ style: { uppercase: v || undefined } })} />
          <CheckField label="Italic" checked={!!style.italic} onChange={(v) => layout({ style: { italic: v || undefined } })} />
          <p className="field-hint wide">Sizes are in stage units: 10 is a tenth of the stage width.</p>
        </Section>
      )}

      {layer.type === 'shape' && (
        <Section title="Shape">
          <SelectField label="Shape" value={layer.shape} options={[{ value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Ellipse' }]} onChange={(v) => props({ shape: v })} />
          <NumberField label="Corner radius" value={layer.radius ?? 0} step={0.1} min={0} unit="su" onCommit={(v) => props({ radius: v })} />
          <ColorField label="Fill" value={layer.fill} placeholder="A colour or gradient" onCommit={(v) => props({ fill: v || undefined })} />
          <ColorField label="Outline" value={layer.stroke} onCommit={(v) => props({ stroke: v || undefined })} />
          <NumberField label="Outline width" value={layer.strokeWidth ?? 0.2} step={0.05} min={0} unit="su" onCommit={(v) => props({ strokeWidth: v })} />
        </Section>
      )}

      {layer.type === 'image' && (
        <Section title="Image">
          <ImageSource scene={scene} layer={layer} onCommit={onCommit} />
          <TextField label="Description" value={layer.alt} wide placeholder="What the image shows (blank if decorative)" onCommit={(v) => props({ alt: v })} />
          <SelectField label="Fit" value={layer.fit ?? 'cover'} options={[{ value: 'cover', label: 'Fill the box' }, { value: 'contain', label: 'Fit inside' }]} onChange={(v) => props({ fit: v })} />
          <NumberField label="Corner radius" value={layer.radius ?? 0} step={0.1} min={0} unit="su" onCommit={(v) => props({ radius: v })} />
        </Section>
      )}

      <Section title="Position and size">
        <NumberField label="X" value={box.x} step={0.5} unit="%" onCommit={(v) => v !== undefined && layout({ box: { x: v } })} />
        <NumberField label="Y" value={box.y} step={0.5} unit="%" onCommit={(v) => v !== undefined && layout({ box: { y: v } })} />
        <NumberField label="Width" value={box.w} step={0.5} min={0.1} unit="%" optional placeholder="Auto" onCommit={(v) => layout({ box: { w: v } })} />
        {layer.type !== 'text' && (
          box.ratio
            ? <NumberField label="Shape" value={box.ratio} step={0.05} min={0.05} unit=":1" onCommit={(v) => v && layout({ box: { ratio: v } })} />
            : <NumberField label="Height" value={box.h} step={0.5} min={0.1} unit="%" onCommit={(v) => v && layout({ box: { h: v } })} />
        )}
        <NumberField label="Rotate" value={box.rotate ?? 0} step={1} unit="°" onCommit={(v) => layout({ box: { rotate: v || undefined } })} />
        {layer.type !== 'text' && (
          <CheckField label="Keep shape" checked={!!box.ratio} onChange={(v) => {
            if (v) layout({ box: { ratio: Math.round(((box.w ?? 20) / (box.h ?? 20)) * 100) / 100 } });
            else layout({ box: { ratio: undefined, h: box.h ?? box.w ?? 20 } });
          }} />
        )}
        <Field label="Anchor" wide>
          {(id) => (
            <div className="anchor-grid" id={id} role="radiogroup" aria-label="Anchor point">
              {ANCHORS.map((a) => (
                <button key={a} type="button" role="radio" aria-checked={(box.anchor ?? 'center') === a} aria-label={a.replace('-', ' ')}
                  title={`Anchor: ${a.replace('-', ' ')}`}
                  className={(box.anchor ?? 'center') === a ? 'on' : undefined}
                  onClick={() => layout({ box: { anchor: a } })} />
              ))}
            </div>
          )}
        </Field>
      </Section>

      <section className="insp-section">
        <header><h3>Align</h3></header>
        <AlignPanel count={1} to={alignTo} onTo={onAlignTo} onAlign={onAlign} />
      </section>

      <Section title="Timing">
        <NumberField label="Appears" value={layer.start ?? 0} step={0.1} min={0} max={scene.duration} unit="s" onCommit={(v) => props({ start: v || undefined })} />
        <NumberField label="Disappears" value={layer.end} placeholder={String(scene.duration)} step={0.1} min={0} max={scene.duration} unit="s" optional onCommit={(v) => props({ end: v === undefined || v >= scene.duration ? undefined : v })} />
        <NumberField label="Opacity" value={layer.opacity ?? 1} step={0.05} min={0} max={1} onCommit={(v) => props({ opacity: v === undefined || v >= 1 ? undefined : v })} />
      </Section>

      <div className="insp-actions">
        <button type="button" className="btn small" disabled={idx >= scene.layers.length - 1} onClick={() => onCommit(moveLayer(scene, layer.id, 1))}>Bring forward</button>
        <button type="button" className="btn small" disabled={idx <= 0} onClick={() => onCommit(moveLayer(scene, layer.id, -1))}>Send backward</button>
        <button type="button" className="btn small" onClick={() => { const r = duplicateLayer(scene, layer.id); onCommit(r.scene); onSelect({ layerId: r.id, clipId: null }); }}>Duplicate</button>
        <button type="button" className="btn small danger" onClick={() => { onCommit(removeLayer(scene, layer.id)); onSelect({ layerId: null, clipId: null }); }}>Delete layer</button>
      </div>
    </div>
  );
}

function ImageSource({ scene, layer, onCommit }: { scene: Scene; layer: Extract<Layer, { type: 'image' }>; onCommit: (s: Scene) => void }) {
  const isData = layer.src.startsWith('data:');
  return (
    <div className="wide img-src">
      {isData ? (
        <p className="field-hint">Uploaded image, saved inside the scene ({Math.round((layer.src.length * 0.75) / 1024)} KB).</p>
      ) : (
        <TextField label="Image address" value={layer.src} mono placeholder="https://…" wide onCommit={(v) => onCommit(setLayerProps(scene, layer.id, { src: v }))} />
      )}
      <label className="btn small file-btn">
        {isData ? 'Replace image' : 'Upload an image'}
        <input type="file" accept="image/*" onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            const src = String(reader.result);
            const img = new Image();
            img.onload = () => {
              const ratio = Math.round((img.naturalWidth / img.naturalHeight) * 100) / 100;
              onCommit(writeLayout(setLayerProps(scene, layer.id, { src }), layer.id, null, { box: { ratio } }));
            };
            img.src = src;
          };
          reader.readAsDataURL(file);
          e.target.value = '';
        }} />
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ clip */

function ClipInspector({ scene, layer, clipId, onCommit, onSelect }: Props & { layer: Layer; clipId: string }) {
  const clip = layer.clips.find((c) => c.id === clipId)!;
  const meta = presetMeta[clip.preset];
  const params = { ...(meta?.defaults ?? {}), ...(clip.params ?? {}) };
  const set = (p: Record<string, unknown>) => onCommit(setClip(scene, layer.id, clip.id, p));
  const setParam = (key: string, value: unknown) => onCommit(setClipParam(scene, layer.id, clip.id, key, value));
  const ease = clip.ease ?? meta?.defaultEase ?? 'none';

  return (
    <div className="insp">
      <div className="insp-head">
        <p className="insp-kicker">
          <button type="button" className="crumb" onClick={() => onSelect({ layerId: layer.id, clipId: null })}>{layer.name ?? layer.id}</button>
          <span aria-hidden="true"> › </span>Clip
        </p>
        <h2 className="insp-title-static">{meta?.label ?? clip.preset}</h2>
        {meta && <p className="insp-help">{meta.description}</p>}
      </div>

      <Section title="Clip">
        <SelectField
          label="Preset"
          value={clip.preset}
          options={PRESET_CATALOG.filter((p) => p.appliesTo.includes(layer.type)).map((p) => ({ value: p.id, label: p.label }))}
          onChange={(v) => set({ preset: v, params: undefined, ease: undefined })}
        />
        <NumberField label="Starts" value={clip.start} step={0.05} min={0} max={scene.duration} unit="s" onCommit={(v) => v !== undefined && set({ start: v })} />
        <NumberField label="Length" value={clip.duration} step={0.05} min={0.05} max={scene.duration} unit="s" onCommit={(v) => v && set({ duration: v })} />
        <Field label="Easing">
          {(id) => (
            <select id={id} value={EASES.includes(ease) ? ease : '__custom'} onChange={(e) => set({ ease: e.target.value === meta?.defaultEase ? undefined : e.target.value })}>
              {!EASES.includes(ease) && <option value="__custom">{ease}</option>}
              {EASES.map((e) => <option key={e} value={e}>{e}{e === meta?.defaultEase ? ' (default)' : ''}</option>)}
            </select>
          )}
        </Field>
      </Section>

      {meta && meta.fields.length > 0 && (
        <Section title="Settings">
          {meta.fields.map((f) => <ParamField key={f.key} field={f} value={params[f.key]} onChange={(v) => setParam(f.key, v)} />)}
        </Section>
      )}
      {clip.preset === 'keyframes' && (
        <Section title="Keyframes">
          <TextField label="Frames (JSON)" multiline mono value={JSON.stringify(params.frames ?? [])}
            onCommit={(v) => { try { const frames = JSON.parse(v); if (Array.isArray(frames)) setParam('frames', frames); } catch { /* keep the old value */ } }} />
          <p className="field-hint wide">Each frame: t (seconds into the clip) and any of x, y (%), scale, rotate, opacity, blur.</p>
        </Section>
      )}

      <div className="insp-actions">
        <button type="button" className="btn small danger" onClick={() => { onCommit(removeClip(scene, layer.id, clip.id)); onSelect({ layerId: layer.id, clipId: null }); }}>Delete clip</button>
      </div>
    </div>
  );
}

function ParamField({ field, value, onChange }: { field: PresetField; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.type) {
    case 'number':
      return <NumberField label={field.label} value={typeof value === 'number' ? value : undefined} step={field.step} min={field.min} max={field.max} unit={field.unit} onCommit={(v) => v !== undefined && onChange(v)} />;
    case 'select':
      return <SelectField label={field.label} value={String(value ?? field.options[0].value)} options={field.options} onChange={onChange} />;
    case 'boolean':
      return <CheckField label={field.label} checked={value !== false} onChange={onChange} />;
    case 'color':
      return <ColorField label={field.label} value={typeof value === 'string' ? value : ''} onCommit={onChange} />;
    case 'text':
      return <TextField label={field.label} value={typeof value === 'string' ? value : ''} wide mono onCommit={onChange} />;
  }
}
