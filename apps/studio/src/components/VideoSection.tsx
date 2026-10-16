import { useEffect, useRef, useState } from 'react';
import type { Scene } from '@unysonplus/scene-player/types';
import { VIDEO_SIZES, canRender, renderVideo, type RenderCheck } from '../lib/video';
import { DownloadIcon } from './icons';

const GUIDE = 'https://docs.unysonplus.com/guides/set-up-ai-for-unysonplus';
const KIT_REPO = 'https://github.com/UnysonPlus/UnysonPlus-AI-Dev-Kit';

/** Export → Video: an MP4 or WebM rendered frame by frame by the AI Dev Kit on this computer. */
export function VideoSection(props: { scene: Scene; open: boolean; onDone: (note: string) => void }) {
  const [check, setCheck] = useState<RenderCheck | null>(null);
  const [size, setSize] = useState('1080p');
  const [fps, setFps] = useState(30);
  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setCheck(null);
    canRender().then(setCheck);
  }, [props.open]);

  const s = VIDEO_SIZES.find((v) => v.id === size)!;
  const frames = Math.round(props.scene.duration * fps);

  const start = async () => {
    setError(null);
    setProgress({ done: 0, total: frames });
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const { blob, name, warnings } = await renderVideo(props.scene, { width: s.width, height: s.height, fps, format }, (done, total) => setProgress({ done, total }), ctl.signal);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      props.onDone(`Video saved to your downloads (${(blob.size / 1048576).toFixed(1)} MB).${warnings.length ? ` Rendered without: ${warnings.slice(0, 3).join(', ')}${warnings.length > 3 ? '…' : ''} (it did not load in time).` : ''}`);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  const busy = progress !== null;
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className="export-opt">
      <h3>Video</h3>
      <p>
        An MP4 or WebM for social posts, presentations or anywhere HTML can't go. The AI Dev Kit on this computer renders it
        frame by frame, so every frame is exact. The size picks the layout: a vertical video uses the scene's mobile layout.
      </p>
      {check && !check.ok && (
        <p className="export-warn">
          {check.reason === 'kit' && <>Video export runs through the <a href={KIT_REPO} target="_blank" rel="noopener noreferrer"><strong>AI Dev Kit</strong></a> on your computer. <a href={GUIDE} target="_blank" rel="noopener noreferrer">Set it up</a>, start it (start.bat or start.command), then open Export again.</>}
          {check.reason === 'outdated' && <>Your AI Dev Kit needs an update for video export. Close it and start it again: it updates itself.</>}
          {check.reason === 'ffmpeg' && <>The AI Dev Kit needs <strong>ffmpeg</strong> to make videos. Install it (Windows: <code>winget install Gyan.FFmpeg</code>; macOS: <code>brew install ffmpeg</code>), restart the kit, then open Export again.</>}
        </p>
      )}
      <div className="video-opts">
        <label className="field">
          <span>Size</span>
          <select value={size} onChange={(e) => setSize(e.target.value)} disabled={busy}>
            {VIDEO_SIZES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Frame rate</span>
          <select value={fps} onChange={(e) => setFps(Number(e.target.value))} disabled={busy}>
            {[24, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
          </select>
        </label>
        <label className="field">
          <span>Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as 'mp4' | 'webm')} disabled={busy}>
            <option value="mp4" title="H.264: plays everywhere">MP4</option>
            <option value="webm" title="VP9: smaller files">WebM</option>
          </select>
        </label>
      </div>
      {busy ? (
        <div className="export-row">
          <div className="video-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><span style={{ width: `${pct}%` }} /></div>
          <span className="export-meta">{progress!.done} / {progress!.total} frames</span>
          <button type="button" className="btn small" onClick={() => abort.current?.abort()}>Stop</button>
        </div>
      ) : (
        <div className="export-row">
          <button type="button" className="btn primary" onClick={start} disabled={!check?.ok}>
            <DownloadIcon /> Render video
          </button>
          <span className="export-meta">{frames} frames, {props.scene.duration} s{check === null ? ' · looking for the AI Dev Kit…' : ''}</span>
        </div>
      )}
      {error && <p className="export-error" role="alert">{error}</p>}
    </section>
  );
}
