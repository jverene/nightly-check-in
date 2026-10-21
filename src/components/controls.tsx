"use client";

/**
 * Form controls. Segmented groups are real radio inputs underneath, so
 * keyboard navigation and focus rings come for free.
 */

export function Item({
  label,
  pna,
  onPnaChange,
  children,
}: {
  label: string;
  pna: boolean;
  onPnaChange: (pna: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="item">
      <div className="item-head">
        <span className="item-label">{label}</span>
        <button
          type="button"
          className="pna-toggle"
          aria-pressed={pna}
          onClick={() => onPnaChange(!pna)}
        >
          {pna ? "✓ Prefer not to answer" : "Prefer not to answer"}
        </button>
      </div>
      {pna ? <p className="pna-active">Prefer not to answer — noted.</p> : children}
    </section>
  );
}

export function Slider({
  value,
  onChange,
  minLabel,
  maxLabel,
  max = 10,
  min = 0,
  name,
  onCommit,
}: {
  value: number | null;
  onChange: (v: number) => void;
  minLabel: string;
  maxLabel: string;
  max?: number;
  min?: number;
  name: string;
  /** Fired when a pointer interaction commits a value (tap/drag release) or Enter is pressed. Used by the demo wizard for auto-advance. */
  onCommit?: () => void;
}) {
  return (
    <div
      className="slider-wrap"
      onPointerUp={() => {
        if (value !== null) onCommit?.();
      }}
    >
      <div className="slider-value" aria-live="polite">
        {value === null ? <span className="unset">Slide to answer</span> : value}
      </div>
      <input
        type="range"
        className="slider"
        aria-label={name}
        min={min}
        max={max}
        step={1}
        value={value ?? min}
        onChange={(e) => onChange(Number(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value !== null) {
            e.preventDefault();
            onCommit?.();
          }
        }}
      />
      <div className="slider-ends">
        <span>
          {min} — {minLabel}
        </span>
        <span>
          {max} — {maxLabel}
        </span>
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  name,
  endpoints,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  name: string;
  endpoints?: [string, string];
}) {
  return (
    <div>
      <div className="segmented" role="radiogroup" aria-label={name}>
        {options.map((o) => (
          <label key={String(o.value)}>
            <input
              type="radio"
              name={name}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span className="seg">{o.label}</span>
          </label>
        ))}
      </div>
      {endpoints && (
        <div className="slider-ends" style={{ marginTop: 8 }}>
          <span>{endpoints[0]}</span>
          <span>{endpoints[1]}</span>
        </div>
      )}
    </div>
  );
}
