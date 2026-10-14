import { useId, type ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Shown on hover and announced to screen readers. */
  hint?: string;
  /** Hide the text label, keeping it for screen readers. */
  iconOnly?: boolean;
}

/** A row of mutually exclusive choices, built on real radio buttons so the keyboard works as expected. */
export function Segmented<T extends string>(props: {
  legend: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="seg">
      <legend className="sr-only">{props.legend}</legend>
      {props.options.map((o) => (
        <label key={o.value} className="seg-opt" title={o.hint ?? o.label}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={props.value === o.value}
            onChange={() => props.onChange(o.value)}
          />
          <span className="seg-face">
            {o.icon}
            <span className={o.iconOnly ? 'sr-only' : undefined}>{o.label}</span>
            {o.hint && <span className="sr-only">: {o.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
