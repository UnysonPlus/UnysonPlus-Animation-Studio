import { useCallback, useEffect, useRef, useState } from 'react';
import { validateScene } from '@unysonplus/scene-player/validate';
import type { HeightMode, Layer, Scene } from '@unysonplus/scene-player/types';
import demo from './scenes/demo.json';
import { previewHtml } from './lib/documents';
import { ExportDialog } from './components/ExportDialog';
import { useEditorConnection } from './lib/connection';
import { formatScene } from './lib/format';
import { useHistory } from './lib/history';
import {
  addClip, addLayer, containerOf, duplicateLayer, findClip, findLayer, groupLayers, layersIn, moveBy, removeClip,
  removeLayer, roundTime, setClip, ungroupLayer, writeLayout,
} from './lib/sceneOps';
import { groupDuration, groupOffset } from '@unysonplus/scene-player/groups';
import { DEVICES, Preview, type Device } from './components/Preview';
import { Transport } from './components/Transport';
import { ScenePanel } from './components/ScenePanel';
import { Segmented } from './components/Segmented';
import { Inspector, selectedIds, selectLayers, type Selection } from './components/Inspector';
import type { AlignMode, AlignTo } from './components/AlignPanel';
import { Library } from './components/Library';
import { Timeline } from './components/Timeline';
import {
  DesktopIcon, DownloadIcon, LaptopIcon, Logo, OpenIcon, PhoneIcon, RedoIcon, SaveIcon, TabletIcon, UndoIcon,
} from './components/icons';

const DRAFT_KEY = 'upw-studio-draft-v1';
const DEMO = validateScene(demo).scene;

function loadInitial(): Scene {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const r = validateScene(JSON.parse(raw));
      if (r.ok) return r.scene;
    }
  } catch {
    /* Blocked storage or an unreadable draft: start from the demo. */
  }
  return DEMO;
}

function saveDraft(scene: Scene) {
  try {
    localStorage.setItem(DRAFT_KEY, formatScene(scene));
  } catch {
    /* Private windows and blocked storage: the draft just isn't kept. */
  }
}

function slug(scene: Scene) {
  return (scene.title || 'animation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'animation';
}

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const DEVICE_ICONS: Record<Device['id'], JSX.Element> = {
  desktop: <DesktopIcon />, laptop: <LaptopIcon />, tablet: <TabletIcon />, mobile: <PhoneIcon />,
};

const HEIGHT_MODES: Array<{ value: HeightMode; label: string; hint: string }> = [
  { value: 'ratio', label: 'Ratio', hint: 'Keeps its shape; the page scrolls if it is taller than the window' },
  { value: 'ratio-capped', label: 'Capped', hint: 'Keeps its shape but never grows taller than the window' },
  { value: 'fill', label: 'Fill', hint: 'Exactly one window tall, whatever its shape' },
];

interface PreviewState {
  time: number;
  duration: number;
  playing: boolean;
  breakpoint: string | null;
  stageHeight: number;
}

interface KeyInfo {
  key: string;
  code: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export function App() {
  const history = useHistory<Scene>(loadInitial);
  const scene = history.present;
  const [selection, setSelection] = useState<Selection>({ layerId: null, clipId: null });
  const [deviceId, setDeviceId] = useState<Device['id']>('desktop');
  const [safe, setSafe] = useState(false);
  const [tab, setTab] = useState<'inspect' | 'json'>('inspect');
  const [state, setState] = useState<PreviewState>({ time: 0, duration: scene.duration, playing: false, breakpoint: null, stageHeight: 0 });
  const [frameError, setFrameError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [alignTo, setAlignTo] = useState<AlignTo>('selection');
  /** The group being edited (double-click to enter, Escape to leave); null = the whole scene. */
  const [scope, setScope] = useState<string | null>(null);
  // Opened from a Unyson+ page editor ("Open in Animation Studio"): load its scene, offer "Save to page".
  const conn = useEditorConnection((incoming) => {
    commit(incoming);
    setSelection({ layerId: null, clipId: null });
    setNotice('Loaded the scene from your page. Undo to go back to what you had here.');
  });
  const sceneAtLoad = useRef<Scene | null>(null);
  // The preview document is built once; after that, scene changes are sent to it as messages.
  const [srcDoc] = useState(() => previewHtml(scene, { safeArea: false }));

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const openRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const sentScene = useRef<Scene>(scene);
  const firstReady = useRef(true);

  // Latest values for handlers that outlive a render (message and key listeners).
  const latest = useRef({ scene, selection, state, scope });
  latest.current = { scene, selection, state, scope };

  const device = DEVICES.find((d) => d.id === deviceId)!;
  const post = useCallback((msg: Record<string, unknown>) => iframeRef.current?.contentWindow?.postMessage(msg, '*'), []);
  const commit = history.commit;

  // ---- keep the preview in step with the scene, selection and settings ----
  useEffect(() => {
    if (!ready || sentScene.current === scene) return;
    sentScene.current = scene;
    post({ type: 'scene', scene });
  }, [scene, ready, post]);
  const selKey = selectedIds(selection).join('|');
  useEffect(() => { if (ready) post({ type: 'select', ids: selKey ? selKey.split('|') : [] }); }, [selKey, ready, post]);
  useEffect(() => { if (ready) post({ type: 'safe', show: safe }); }, [safe, ready, post]);
  useEffect(() => { if (ready) post({ type: 'ui', scale }); }, [scale, ready, post]);

  useEffect(() => { if (ready) post({ type: 'scope', id: scope }); }, [scope, ready, post]);
  useEffect(() => {
    if (scope && findLayer(scene, scope)?.type !== 'group') setScope(null);
  }, [scene, scope]);

  // Drop a selection that no longer exists (after undo, delete or a file edit).
  useEffect(() => {
    const { layerId, clipId } = selection;
    const ids = selectedIds(selection);
    const alive = ids.filter((id) => findLayer(scene, id));
    if (alive.length !== ids.length) setSelection(selectLayers(alive));
    else if (layerId && clipId && !findClip(scene, layerId, clipId)) setSelection({ layerId, clipId: null });
  }, [scene, selection]);

  // Any edit after a save means the page's copy is out of date again.
  useEffect(() => {
    if (sceneAtLoad.current === null) { sceneAtLoad.current = scene; return; }
    conn.touched();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // Autosave the working scene in this browser.
  useEffect(() => {
    const t = setTimeout(() => saveDraft(scene), 400);
    return () => clearTimeout(t);
  }, [scene]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  const play = useCallback(() => post({ type: 'play' }), [post]);
  const pause = useCallback(() => post({ type: 'pause' }), [post]);
  const seek = useCallback((t: number) => post({ type: 'seek', time: t }), [post]);

  // ---- actions ----
  type LeafType = Exclude<Layer['type'], 'group'>;
  const addLayerOfType = useCallback((type: LeafType, extra: Partial<Layer> = {}) => {
    const r = addLayer(latest.current.scene, type, extra, latest.current.scope);
    commit(r.scene);
    setSelection({ layerId: r.id, clipId: null });
  }, [commit]);

  const onAddLayer = (type: LeafType) => {
    if (type === 'image') imageRef.current?.click();
    else addLayerOfType(type);
  };

  /** Steps into a group: the timeline shows its layers on its own clock, the stage dims the rest. */
  const enterGroup = useCallback((id: string) => {
    if (findLayer(latest.current.scene, id)?.type !== 'group') return;
    setScope(id);
    setSelection({ layerId: null, clipId: null });
  }, []);

  /** Leaves the current group (or jumps to an outer one), selecting the group just left. */
  const leaveTo = useCallback((target: string | null) => {
    const from = latest.current.scope;
    setScope(target);
    setSelection(from ? { layerId: from, clipId: null } : { layerId: null, clipId: null });
  }, []);

  const groupSelection = useCallback(() => {
    const { scene: s, selection: sel } = latest.current;
    const r = groupLayers(s, selectedIds(sel));
    if (!r) return;
    commit(r.scene);
    setSelection({ layerId: r.id, clipId: null });
    setNotice('Grouped. Double-click the group to edit what is inside.');
  }, [commit]);

  const ungroupSelection = useCallback(() => {
    const { scene: s, selection: sel } = latest.current;
    const g = findLayer(s, sel.layerId);
    if (!g || g.type !== 'group') return;
    const kids = g.layers.map((l) => l.id);
    const r = ungroupLayer(s, g.id);
    if (!r) return;
    commit(r.scene);
    setSelection(selectLayers(kids));
    if (r.dropped) setNotice(`Ungrouped. The group's own ${r.dropped === 1 ? 'clip was' : `${r.dropped} clips were`} removed with it (undo to bring ${r.dropped === 1 ? 'it' : 'them'} back).`);
  }, [commit]);

  /** Adds a preset at the playhead to every selected layer it suits (one undo step). */
  const applyPreset = (presetId: string) => {
    const ids = selectedIds(selection);
    let next = scene;
    let lastClip: string | null = null;
    for (const id of ids) {
      const parent = containerOf(next, id);
      const parentGroup = parent ? findLayer(next, parent) : null;
      const local = parent ? state.time - groupOffset(next, parent) : state.time;
      const limit = parentGroup && parentGroup.type === 'group' ? Math.max(groupDuration(parentGroup), scene.duration) : scene.duration;
      const r = addClip(next, id, presetId, Math.max(0, local), limit);
      if (r) {
        next = r.scene;
        lastClip = r.id;
      }
    }
    if (next === scene) return;
    commit(next);
    if (ids.length === 1 && lastClip) setSelection({ layerId: ids[0], clipId: lastClip });
  };

  const align = (mode: AlignMode) => {
    const count = selectedIds(selection).length;
    post({ type: 'align', mode, to: count > 1 ? alignTo : alignTo === 'selection' ? 'stage' : alignTo });
  };

  const saveProject = useCallback(() => {
    download(`${slug(latest.current.scene)}.scene.json`, 'application/json', formatScene(latest.current.scene));
    setNotice('Project saved to your downloads.');
  }, []);

  const openProject = (file: File) => {
    file.text().then((text) => {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        setNotice(`“${file.name}” isn't a scene file (not valid JSON).`);
        return;
      }
      const r = validateScene(data);
      if (!r.ok) {
        setNotice(`“${file.name}” can't be opened: ${r.errors[0]}`);
        return;
      }
      commit(r.scene);
      setSelection({ layerId: null, clipId: null });
      setNotice(`Opened “${file.name}”. Undo to go back to the previous scene.`);
    });
  };

  // ---- keyboard (from the Studio, or forwarded by the preview while it has focus) ----
  const handleKey = useCallback((k: KeyInfo): boolean => {
    const { scene: s, selection: sel, state: st, scope: sc } = latest.current;
    const key = k.key.length === 1 ? k.key.toLowerCase() : k.key;
    if (k.mod && key === 'g') { if (k.shift) ungroupSelection(); else groupSelection(); return true; }
    if (k.mod && key === 'z') { if (k.shift) history.redo(); else history.undo(); return true; }
    if (k.mod && key === 'y') { history.redo(); return true; }
    if (k.mod && key === 's') { saveProject(); return true; }
    if (k.mod && key === 'a') {
      setSelection(selectLayers(layersIn(s, sc).filter((l) => !l.locked).map((l) => l.id)));
      return true;
    }
    if (k.mod && key === 'd') {
      if (sel.layerId) {
        const r = duplicateLayer(s, sel.layerId, st.breakpoint);
        commit(r.scene);
        setSelection({ layerId: r.id, clipId: null });
      }
      return true;
    }
    if (k.mod) return false;
    if (k.code === 'Space') { if (st.playing) pause(); else play(); return true; }
    if (key === 'Home') { seek(0); return true; }
    if (key === ',' || key === '.') {
      const stepT = (k.shift ? 1 : 1 / 30) * (key === ',' ? -1 : 1);
      seek(Math.max(0, Math.min(s.duration, st.time + stepT)));
      return true;
    }
    if (key === 'Escape') {
      // First clear the selection; with nothing selected, step out of the group being edited.
      if (selectedIds(sel).length) setSelection({ layerId: null, clipId: null });
      else if (sc) leaveTo(containerOf(s, sc));
      return true;
    }
    if (key === 'Delete' || key === 'Backspace') {
      const ids = selectedIds(sel);
      if (sel.layerId && sel.clipId && ids.length === 1) { commit(removeClip(s, sel.layerId, sel.clipId)); setSelection({ layerId: sel.layerId, clipId: null }); }
      else if (ids.length) {
        let next = s;
        for (const id of ids) next = removeLayer(next, id);
        commit(next);
        setSelection({ layerId: null, clipId: null });
      }
      return true;
    }
    if (key.startsWith('Arrow')) {
      const dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
      const dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
      const clip = findClip(s, sel.layerId, sel.clipId);
      if (clip && sel.layerId && dx) {
        // Nudge the selected clip in time.
        const start = roundTime(Math.max(0, Math.min(s.duration - clip.duration, clip.start + dx * (k.shift ? 0.5 : 0.05))));
        commit(setClip(s, sel.layerId, clip.id, { start }));
      } else if (sel.layerId && !sel.clipId) {
        // Nudge the selected layers on the stage (one undo step).
        const step = k.shift ? 5 : 0.5;
        let next = s;
        for (const id of selectedIds(sel)) {
          const layer = findLayer(next, id);
          if (!layer || layer.locked) continue;
          next = moveBy(next, id, dx * step, dy * step, st.breakpoint);
        }
        commit(next);
      } else if (dx) {
        seek(Math.max(0, Math.min(s.duration, st.time + dx * (k.shift ? 1 : 0.1))));
      }
      return true;
    }
    return false;
  }, [commit, history, pause, play, saveProject, seek, groupSelection, ungroupSelection, leaveTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      // Keys typed into a field, or pressed inside an open window (Escape closes it), aren't shortcuts.
      if (el.closest('input, textarea, select, [contenteditable], dialog')) return;
      if (el.closest('button, a, [role="radio"]') && (e.code === 'Space' || e.key === 'Enter')) return;
      if (handleKey({ key: e.key, code: e.code, mod: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey })) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleKey]);

  // ---- messages from the preview ----
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow || !e.data || typeof e.data.type !== 'string') return;
      const m = e.data;
      const { scene: s, state: st } = latest.current;
      switch (m.type) {
        case 'upw:ready':
          setReady(true);
          setFrameError(null);
          if (firstReady.current) {
            firstReady.current = false;
            post({ type: 'play' });
          }
          break;
        case 'upw:state':
          setState({ time: m.time, duration: m.duration, playing: m.playing, breakpoint: m.breakpoint, stageHeight: m.stageHeight });
          break;
        case 'upw:error':
          setFrameError(m.message ? String(m.message) : null);
          break;
        case 'upw:select':
          setSelection(selectLayers(Array.isArray(m.ids) ? m.ids : m.id ? [m.id] : []));
          break;
        case 'upw:layout': {
          // One or more layers moved, resized or aligned: one undo step for all of them.
          const items: Array<{ id: string; box?: Record<string, number>; move?: { dx: number; dy: number } }> =
            Array.isArray(m.items) ? m.items : m.id ? [{ id: m.id, box: m.box }] : [];
          let next = s;
          for (const it of items) {
            if (!findLayer(next, it.id)) continue;
            if (it.move) next = moveBy(next, it.id, it.move.dx, it.move.dy, st.breakpoint);
            else if (it.box) next = writeLayout(next, it.id, st.breakpoint, { box: it.box });
          }
          commit(next);
          break;
        }
        case 'upw:enter':
          enterGroup(String(m.id));
          break;
        case 'upw:text':
          if (findLayer(s, m.id)) commit(writeLayout(s, m.id, st.breakpoint, { text: String(m.text) }));
          break;
        case 'upw:key':
          handleKey(m as KeyInfo);
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post, commit, handleKey, enterGroup]);

  // Once the preview is ready, make sure it has the current scene (edits may have happened while it loaded).
  useEffect(() => {
    if (ready && sentScene.current !== latest.current.scene) {
      sentScene.current = latest.current.scene;
      post({ type: 'scene', scene: latest.current.scene });
    }
  }, [ready, post]);

  const bp = scene.stage.breakpoints.find((b) => b.id === state.breakpoint);
  const selectedLayer = findLayer(scene, selection.layerId);

  return (
    <div className="app">
      <div className="head">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <div>
            <h1>
              Animation Studio
              <button type="button" className="stage-tag" {...{ popovertarget: 'stage-info' }} aria-describedby="stage-info">Alpha</button>
            </h1>
            <p className="brand-sub">Unyson+ · {__STUDIO_VERSION__}</p>
            <div id="stage-info" className="stage-info" {...{ popover: 'auto' }} role="note">
              <strong>Alpha: early testing</strong>
              <p>The Studio works, but features are still missing, things may break, and the scene file format may change between versions.</p>
              <p>Use <em>Save</em> to keep a project file of anything you want to hold on to. Pages you export or embed keep working whatever changes later.</p>
            </div>
          </div>
        </div>
        <div className="top-actions">
          <div className="btn-group" role="group" aria-label="History">
            <button type="button" className="icon-btn" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)"><UndoIcon /></button>
            <button type="button" className="icon-btn" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><RedoIcon /></button>
          </div>
          <button type="button" className="btn" onClick={() => openRef.current?.click()} title="Open a saved .scene.json file"><OpenIcon /> Open</button>
          <button type="button" className="btn" onClick={saveProject} title="Save the project as a .scene.json file (Ctrl+S)"><SaveIcon /> Save</button>
          <button type="button" className="btn primary" onClick={() => setExporting(true)}><DownloadIcon /> Export</button>
          <input ref={openRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openProject(f); e.target.value = ''; }} />
          <input ref={imageRef} type="file" accept="image/*" hidden onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const src = String(reader.result);
              const img = new Image();
              img.onload = () => addLayerOfType('image', {
                name: file.name.replace(/\.[^.]+$/, ''), src, alt: '',
                box: { x: 50, y: 50, w: 30, ratio: Math.round((img.naturalWidth / img.naturalHeight) * 100) / 100 },
              } as Partial<Layer>);
              img.src = src;
            };
            reader.readAsDataURL(file);
          }} />
        </div>
      </header>
      {conn.state.status !== 'none' && (
        <div className={`connect-bar is-${conn.state.status}`} role="status">
          {conn.state.status === 'waiting' && <span>Connecting to your Unyson+ page…</span>}
          {conn.state.status === 'connected' && (
            <>
              <span>
                Editing a scene for a Studio Scene element on <strong>{conn.state.site}</strong>.
                {conn.state.saved ? ' Saved to the page. Update the page in WordPress to keep it.' : ' Save to send your changes back.'}
              </span>
              <button type="button" className="btn primary small" onClick={() => {
                if (!conn.save(scene)) setNotice('The page editor is no longer open. Use Export or Save instead.');
              }}>{conn.state.saved ? 'Saved' : 'Save to page'}</button>
            </>
          )}
          {conn.state.status === 'closed' && (
            <span>The page editor on <strong>{conn.state.site}</strong> was closed. Use Export (embed code) or Save to keep this scene.</span>
          )}
        </div>
      )}
      </div>

      <main className="workspace">
        <Library layerType={selectedLayer?.type ?? null} count={selectedIds(selection).length} onApply={applyPreset} />

        <section className="stagecol" aria-label="Stage">
          <div className="toolbar">
            <Segmented
              legend="Screen size"
              value={deviceId}
              onChange={setDeviceId}
              options={DEVICES.map((d) => ({ value: d.id, label: d.label, icon: DEVICE_ICONS[d.id], iconOnly: true, hint: `${d.label}, ${d.width} × ${d.height} window` }))}
            />
            <span className="tb-sep" aria-hidden="true" />
            <Segmented
              legend="Height mode"
              value={scene.stage.heightMode}
              onChange={(mode) => commit({ ...scene, stage: { ...scene.stage, heightMode: mode } })}
              options={HEIGHT_MODES}
            />
            <label className="toggle">
              <input type="checkbox" checked={safe} onChange={(e) => setSafe(e.target.checked)} />
              <span className="toggle-track" aria-hidden="true" />
              Safe area
            </label>
            <p className="bp-readout" aria-live="polite">
              {bp ? (
                <>
                  <strong>{bp.label ?? bp.id}</strong> layout · {bp.aspect[0]}:{bp.aspect[1]} · stage {state.stageHeight}px tall
                </>
              ) : 'Loading…'}
            </p>
          </div>

          <Preview ref={iframeRef} device={device} srcDoc={srcDoc} label="Scene preview" onScale={setScale} />

          {frameError && <p className="frame-error" role="alert">{frameError}</p>}

          <Transport
            time={state.time}
            duration={state.duration}
            playing={state.playing}
            disabled={!ready}
            onPlay={play}
            onPause={pause}
            onSeek={seek}
          />

          <Timeline
            scene={scene}
            time={state.time}
            selection={selection}
            onSelect={setSelection}
            onSeek={seek}
            onCommit={commit}
            onBegin={history.begin}
            onLive={history.live}
            onEnd={history.end}
            onAddLayer={onAddLayer}
            scope={scope}
            onEnter={enterGroup}
            onLeaveTo={leaveTo}
          />
        </section>

        <aside className="panel" aria-label="Properties">
          <div className="tabs" role="tablist" aria-label="Panel">
            <button type="button" role="tab" aria-selected={tab === 'inspect'} className={tab === 'inspect' ? 'on' : undefined} onClick={() => setTab('inspect')}>Inspector</button>
            <button type="button" role="tab" aria-selected={tab === 'json'} className={tab === 'json' ? 'on' : undefined} onClick={() => setTab('json')}>Scene file</button>
          </div>
          <div className="panel-body" role="tabpanel">
            {tab === 'inspect'
              ? <Inspector scene={scene} selection={selection} bp={state.breakpoint} onCommit={commit} onSelect={setSelection} alignTo={alignTo} onAlignTo={setAlignTo} onAlign={align} onEnter={enterGroup} onGroup={groupSelection} onUngroup={ungroupSelection} />
              : <ScenePanel scene={scene} onCommit={commit} />}
          </div>
        </aside>
      </main>

      <ExportDialog open={exporting} scene={scene} fileName={slug(scene)} onClose={() => setExporting(false)} onDone={setNotice} />
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
