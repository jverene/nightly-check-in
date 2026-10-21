"use client";

/**
 * Form controls. Segmented groups and chips are real radio inputs underneath,
 * so keyboard navigation and focus rings come for free.
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
}: {
  value: number | null;
  onChange: (v: number) => void;
  minLabel: string;
  maxLabel: string;
  max?: number;
  min?: number;
  name: string;
}) {
  return (
    <div className="slider-wrap">
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

export function ChipStrip({
  options,
  value,
  onToggle,
  name,
}: {
  options: { value: number; label: string }[];
  value: number | null;
  onToggle: (v: number | null) => void;
  name: string;
}) {
  return (
    <div className="chip-strip" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <label key={o.value}>
          <input
            type="radio"
            name={name}
            checked={value === o.value}
            onChange={() => onToggle(o.value)}
            onClick={() => {
              // Tapping the selected chip again deselects it (row returns to unanswered).
              if (value === o.value) onToggle(null);
            }}
          />
          <span className="chip">{o.label}</span>
        </label>
      ))}
    </div>
  );
}
