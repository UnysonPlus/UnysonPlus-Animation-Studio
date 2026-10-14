import { PauseIcon, PlayIcon, RestartIcon } from './icons';

const fmt = (t: number) => t.toFixed(2);

/** Play, pause, jump to the start and scrub. */
export function Transport(props: {
  time: number;
  duration: number;
  playing: boolean;
  disabled: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (t: number) => void;
}) {
  const { time, duration, playing, disabled } = props;
  const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
  return (
    <div className="transport">
      <button
        type="button"
        className="icon-btn"
        onClick={() => props.onSeek(0)}
        disabled={disabled}
        aria-label="Go to start"
        title="Go to start (Home)"
      >
        <RestartIcon />
      </button>
      <button
        type="button"
        className="icon-btn play"
        onClick={playing ? props.onPause : props.onPlay}
        disabled={disabled}
        aria-label={playing ? 'Pause' : 'Play'}
        title={`${playing ? 'Pause' : 'Play'} (Space)`}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="time mono" aria-live="off">
        <span className="time-now">{fmt(time)}</span>
        <span className="time-sep">/</span>
        {fmt(duration)} s
      </span>
      <input
        className="scrub"
        type="range"
        min={0}
        max={duration || 1}
        step={0.01}
        value={Math.min(time, duration || 1)}
        disabled={disabled}
        onChange={(e) => props.onSeek(Number(e.target.value))}
        aria-label="Playhead"
        aria-valuetext={`${fmt(time)} of ${fmt(duration)} seconds`}
        style={{ ['--pct' as string]: `${pct}%` }}
      />
    </div>
  );
}
