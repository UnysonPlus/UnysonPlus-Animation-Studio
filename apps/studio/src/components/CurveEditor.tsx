import { useEffect, useRef, useState } from 'react';
import { NAMED_EASES, cubicName, easeFunction, parseCubic } from '@unysonplus/scene-player/eases';

const CLASSIC = [
  'none', 'power1.out', 'power2.out', 'power3.out', 'power4.out', 'expo.out', 'circ.out', 'back.out(1.6)',
  'power2.in', 'power3.in', 'expo.in', 'power2.inOut', 'power3.inOut', 'expo.inOut', 'sine.inOut',
];

/** Starting shapes for a custom curve. */
const SHAPES: Array<{ label: string; c: [number, number, number, number] }> = [
  { label: 'Ease out', c: [0.22, 1, 0.36, 1] },
  { label: 'Ease in-out', c: [0.65, 0, 0.35, 1] },
  { label: 'Ease in', c: [0.55, 0, 1, 0.45] },
  { label: 'Overshoot', c: [0.34, 1.56, 0.64, 1] },
  { label: 'Anticipate', c: [0.36, -0.4, 0.6, 1] },
];

// Drawing area: time 0..1 across, value -0.5..1.5 up (room for overshoot).
const W = 220;
const H = 180;
const PAD = 12;
const px = (x: number) => PAD + x * (W - PAD * 2);
const py = (y: number) => H - PAD - ((y + 0.5) / 2) * (H - PAD * 2);
const fromPx = (X: number, Y: number) => [
  Math.min(1, Math.max(0, (X - PAD) / (W - PAD * 2))),
  Math.min(2, Math.max(-1, ((H - PAD - Y) / (H - PAD * 2)) * 2 - 0.5)),
];
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The shape of a move: pick a named ease, or draw a custom curve by dragging its two handles. A
 * custom curve is stored as "cubic(x1,y1,x2,y2)" (like CSS cubic-bezier) and played by the player itself.
 */
export function CurveEditor(props: {
  /** The ease set here, or undefined to use the fallback. */
  value: string | undefined;
  fallback: string;
  fallbackLabel: string;
  onChange: (ease: string | undefined) => void;
}) {
  const effective = props.value ?? props.fallback;
  const cubic = parseCubic(effective);
  const [draft, setDraft] = useState<[number, number, number, number] | null>(null);
  const shown = draft ?? cubic;
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => setDraft(null), [props.value]);

  const fn = shown ? easeFunction(cubicName(shown)) : easeFunction(effective);
  const path = Array.from({ length: 61 }, (_, i) => {
    const x = i / 60;
    return `${i ? 'L' : 'M'}${px(x).toFixed(1)},${py(fn(x)).toFixed(1)}`;
  }).join(' ');

  const drag = (which: 0 | 1) => (e: React.PointerEvent) => {
    if (!shown) return;
    e.preventDefault();
    const svg = svgRef.current!;
    let cur = [...shown] as [number, number, number, number];
    const move = (ev: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const [x, y] = fromPx(((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H);
      cur = which === 0 ? [r2(x), r2(y), cur[2], cur[3]] : [cur[0], cur[1], r2(x), r2(y)];
      setDraft(cur);
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      props.onChange(cubicName(cur));
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  const selectValue = props.value === undefined ? '__default' : cubic ? '__custom' : props.value;
  const known = props.value === undefined || cubic || CLASSIC.includes(props.value) || NAMED_EASES.some((e) => e.id === props.value);

  return (
    <div className="curve">
      <select
        aria-label="Ease"
        value={known ? selectValue : props.value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__default') props.onChange(undefined);
          else if (v === '__custom') props.onChange(cubicName(SHAPES[0].c));
          else props.onChange(v);
        }}
      >
        <option value="__default">Clip's ease ({props.fallbackLabel})</option>
        <option value="__custom">Custom curve…</option>
        {!known && props.value && <option value={props.value}>{props.value}</option>}
        <optgroup label="Measured">
          {NAMED_EASES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </optgroup>
        <optgroup label="Classic">
          {CLASSIC.map((e) => <option key={e} value={e}>{e}</option>)}
        </optgroup>
      </select>

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="curve-svg" role="img" aria-label="Ease curve: time across, progress up">
        <rect x={px(0)} y={py(1)} width={px(1) - px(0)} height={py(0) - py(1)} className="curve-box" />
        <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} className="curve-diag" />
        <path d={path} className="curve-path" />
        {shown && (
          <>
            <line x1={px(0)} y1={py(0)} x2={px(shown[0])} y2={py(shown[1])} className="curve-arm" />
            <line x1={px(1)} y1={py(1)} x2={px(shown[2])} y2={py(shown[3])} className="curve-arm" />
            <circle cx={px(shown[0])} cy={py(shown[1])} r={6} className="curve-handle" onPointerDown={drag(0)} />
            <circle cx={px(shown[2])} cy={py(shown[3])} r={6} className="curve-handle" onPointerDown={drag(1)} />
          </>
        )}
      </svg>

      {shown ? (
        <div className="curve-shapes">
          {SHAPES.map((s) => (
            <button key={s.label} type="button" className="curve-chip" onClick={() => props.onChange(cubicName(s.c))}>{s.label}</button>
          ))}
          <span className="curve-values mono">{cubicName(shown).replace('cubic', '')}</span>
        </div>
      ) : (
        <p className="field-hint">Pick <strong>Custom curve…</strong> to draw your own: drag the two handles. Above the box overshoots, below it pulls back first.</p>
      )}
    </div>
  );
}
