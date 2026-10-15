import type { ReactNode } from 'react';

export type AlignMode =
  | 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
  | 'dist-left' | 'dist-hcenter' | 'dist-right' | 'dist-top' | 'dist-vcenter' | 'dist-bottom'
  | 'space-h' | 'space-v';
export type AlignTo = 'selection' | 'stage' | 'safe';

const S = (p: { children: ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    {p.children}
  </svg>
);
const R = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} rx="1" fill="currentColor" stroke="none" />;

/** Icons drawn the way design tools draw them: the line is the edge or centre things line up on. */
const ICONS: Record<AlignMode, ReactNode> = {
  left: <S><path d="M4 3v18" />{R(6, 6, 13, 4)}{R(6, 14, 8, 4)}</S>,
  hcenter: <S><path d="M12 3v18" />{R(5, 6, 14, 4)}{R(8, 14, 8, 4)}</S>,
  right: <S><path d="M20 3v18" />{R(5, 6, 13, 4)}{R(10, 14, 8, 4)}</S>,
  top: <S><path d="M3 4h18" />{R(6, 6, 4, 13)}{R(14, 6, 4, 8)}</S>,
  vcenter: <S><path d="M3 12h18" />{R(6, 5, 4, 14)}{R(14, 8, 4, 8)}</S>,
  bottom: <S><path d="M3 20h18" />{R(6, 5, 4, 13)}{R(14, 10, 4, 8)}</S>,
  'dist-left': <S>{R(3, 7, 4, 10)}{R(10, 7, 4, 10)}{R(17, 7, 4, 10)}<path d="M3 4v2M10 4v2M17 4v2" /></S>,
  'dist-hcenter': <S>{R(3, 7, 4, 10)}{R(10, 7, 4, 10)}{R(17, 7, 4, 10)}<path d="M5 4v2M12 4v2M19 4v2" /></S>,
  'dist-right': <S>{R(3, 7, 4, 10)}{R(10, 7, 4, 10)}{R(17, 7, 4, 10)}<path d="M7 4v2M14 4v2M21 4v2" /></S>,
  'dist-top': <S>{R(7, 3, 10, 4)}{R(7, 10, 10, 4)}{R(7, 17, 10, 4)}<path d="M4 3h2M4 10h2M4 17h2" /></S>,
  'dist-vcenter': <S>{R(7, 3, 10, 4)}{R(7, 10, 10, 4)}{R(7, 17, 10, 4)}<path d="M4 5h2M4 12h2M4 19h2" /></S>,
  'dist-bottom': <S>{R(7, 3, 10, 4)}{R(7, 10, 10, 4)}{R(7, 17, 10, 4)}<path d="M4 7h2M4 14h2M4 21h2" /></S>,
  'space-h': <S>{R(3, 5, 4, 14)}{R(17, 5, 4, 14)}<path d="M9.5 12h5M9.5 12l1.5-1.5M9.5 12l1.5 1.5M14.5 12l-1.5-1.5M14.5 12 13 13.5" /></S>,
  'space-v': <S>{R(5, 3, 14, 4)}{R(5, 17, 14, 4)}<path d="M12 9.5v5M12 9.5l-1.5 1.5M12 9.5l1.5 1.5M12 14.5l-1.5-1.5M12 14.5l1.5-1.5" /></S>,
};

const LABELS: Record<AlignMode, string> = {
  left: 'Align left edges', hcenter: 'Align horizontal centres', right: 'Align right edges',
  top: 'Align top edges', vcenter: 'Align vertical centres', bottom: 'Align bottom edges',
  'dist-left': 'Distribute left edges', 'dist-hcenter': 'Distribute horizontal centres', 'dist-right': 'Distribute right edges',
  'dist-top': 'Distribute top edges', 'dist-vcenter': 'Distribute vertical centres', 'dist-bottom': 'Distribute bottom edges',
  'space-h': 'Equal gaps across', 'space-v': 'Equal gaps down',
};

function Row({ modes, disabled, onAlign, label }: { modes: AlignMode[]; disabled: boolean; onAlign: (m: AlignMode) => void; label: string }) {
  return (
    <div className="align-row" role="group" aria-label={label}>
      {modes.map((m, i) => (
        <span key={m} className="align-cell">
          {i === 3 && <span className="align-gap" aria-hidden="true" />}
          <button type="button" className="align-btn" aria-label={LABELS[m]} title={LABELS[m]} disabled={disabled} onClick={() => onAlign(m)}>
            {ICONS[m]}
          </button>
        </span>
      ))}
    </div>
  );
}

/**
 * Align and Distribute. With one layer it lines that layer up with the stage or the safe area; with
 * several it can also line them up with each other ("Selection") and space them out.
 */
export function AlignPanel(props: { count: number; to: AlignTo; onTo: (to: AlignTo) => void; onAlign: (mode: AlignMode) => void }) {
  const { count, to } = props;
  const toSelection = to === 'selection' && count > 1;
  // Distributing needs three layers among themselves, or two spread across the stage.
  const canDistribute = toSelection ? count >= 3 : count >= 2;
  return (
    <div className="align-panel">
      <div className="align-block">
        <p className="align-label">Align</p>
        <Row label="Align" modes={['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom']} disabled={count < 1} onAlign={props.onAlign} />
      </div>
      <div className="align-block">
        <p className="align-label">Distribute</p>
        <Row label="Distribute" modes={['dist-top', 'dist-vcenter', 'dist-bottom', 'dist-left', 'dist-hcenter', 'dist-right']} disabled={!canDistribute} onAlign={props.onAlign} />
      </div>
      <div className="align-foot">
        <div className="align-block">
          <p className="align-label">Distribute spacing</p>
          <Row label="Distribute spacing" modes={['space-v', 'space-h']} disabled={!canDistribute} onAlign={props.onAlign} />
        </div>
        <label className="align-block align-to">
          <span className="align-label">Align to</span>
          <select value={count > 1 ? to : to === 'selection' ? 'stage' : to} onChange={(e) => props.onTo(e.target.value as AlignTo)}>
            {count > 1 && <option value="selection">Selection</option>}
            <option value="stage">Stage</option>
            <option value="safe">Safe area</option>
          </select>
        </label>
      </div>
      {!canDistribute && count > 0 && (
        <p className="field-hint">
          {count === 1 ? 'Select more layers (Shift+click) to distribute them.' : 'Distributing within the selection needs three or more layers.'}
        </p>
      )}
    </div>
  );
}
