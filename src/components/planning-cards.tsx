"use client";

import { useRef } from "react";

/**
 * The v2 planning component: one full-width card per course, No (left) /
 * Yes (right) half-width buttons, minutes chips expanding inline on Yes.
 *
 * Keyboard: Up/Down moves between cards; Left/Right or Y/N selects on the
 * focused card; the minutes strip is a native radio group (Left/Right moves
 * across chips), Enter confirms; Tab order stays linear.
 */

export type PlanCardState = {
  answer: "yes" | "no" | null; // confirmed once touched
  minutes: number | null;
  touched: boolean; // tapped directly or confirmed via same-as-yesterday
  prefilled: "yes" | "no" | null; // prior-night hint, gray until touched
};

export const PLAN_MINUTE_OPTIONS = [
  { value: 15, label: "15" },
  { value: 30, label: "30" },
  { value: 45, label: "45" },
  { value: 60, label: "1h" },
  { value: 75, label: "1h15" },
  { value: 90, label: "1h30" },
  { value: 105, label: "1h45" },
  { value: 120, label: "2h" },
  { value: 135, label: "2h15" },
  { value: 150, label: "2h30" },
  { value: 165, label: "2h45" },
  { value: 180, label: "3h" },
  { value: 999, label: "3h+" },
];

export const emptyPlanCard = (prefilled: "yes" | "no" | null = null): PlanCardState => ({
  answer: null,
  minutes: null,
  touched: false,
  prefilled,
});

export function PlanningCards({
  courses,
  value,
  onChange,
  onSameAsYesterday,
}: {
  courses: { id: string; course_name: string }[];
  value: Record<string, PlanCardState>;
  onChange: (next: Record<string, PlanCardState>) => void;
  onSameAsYesterday: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasPrefill = courses.some((c) => value[c.id]?.prefilled && !value[c.id]?.touched);

  function setCard(id: string, next: PlanCardState) {
    onChange({ ...value, [id]: next });
  }

  function select(courseId: string, side: "yes" | "no") {
    const cur = value[courseId];
    if (cur?.touched && cur.answer === side) {
      // Tapping the selected state again returns the row to unanswered.
      setCard(courseId, { answer: null, minutes: null, touched: false, prefilled: cur.prefilled });
      return;
    }
    setCard(courseId, {
      answer: side,
      minutes: side === "yes" ? cur?.minutes ?? null : null,
      touched: true,
      prefilled: cur?.prefilled ?? null,
    });
  }

  function cardIndexOf(el: Element | null): number {
    const card = el?.closest("[data-card-index]");
    return card ? Number(card.getAttribute("data-card-index")) : -1;
  }

  function focusCard(index: number) {
    const container = containerRef.current;
    if (!container) return;
    const card = container.querySelector(`[data-card-index="${index}"]`);
    const btn = card?.querySelector<HTMLButtonElement>(".yn-btn");
    btn?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement;
    const idx = cardIndexOf(target);
    if (idx < 0) return;
    const courseId = courses[idx].id;
    const onChip = target.tagName === "INPUT";

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      // Between cards; inside a chip strip this overrides the radio default.
      e.preventDefault();
      const next = e.key === "ArrowDown" ? idx + 1 : idx - 1;
      if (next >= 0 && next < courses.length) focusCard(next);
      return;
    }

    if (!onChip && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      select(courseId, e.key === "ArrowLeft" ? "no" : "yes");
      return;
    }
    if (!onChip && (e.key === "y" || e.key === "Y" || e.key === "n" || e.key === "N")) {
      e.preventDefault();
      select(courseId, e.key.toLowerCase() === "y" ? "yes" : "no");
      return;
    }
    if (onChip && e.key === "Enter") {
      // Enter confirms the focused chip (arrow keys already move selection).
      const input = target as HTMLInputElement;
      const minutes = Number(input.value);
      const cur = value[courseId];
      if (cur) setCard(courseId, { ...cur, minutes });
    }
  }

  return (
    <section className="card" aria-label="Tonight's plan">
      <div className="row-between" style={{ marginBottom: 4 }}>
        <h2>Tonight&rsquo;s plan</h2>
        {hasPrefill && (
          <button type="button" className="btn-link" onClick={onSameAsYesterday}>
            Same as yesterday
          </button>
        )}
      </div>
      <p className="muted small" style={{ marginBottom: 8 }}>
        Studying for each course tonight?
      </p>
      <div ref={containerRef} onKeyDown={onKeyDown}>
        {courses.map((c, i) => {
          const state = value[c.id] ?? emptyPlanCard();
          const expanded = state.touched && state.answer === "yes";
          return (
            <div className="yn-card" data-card-index={i} key={c.id}>
              <div className="yn-course">{c.course_name}</div>
              <div className="yn-row" role="group" aria-label={`${c.course_name}: studying tonight?`}>
                {(["no", "yes"] as const).map((side) => {
                  const selected = state.touched && state.answer === side;
                  const prefilled = !state.touched && state.prefilled === side;
                  return (
                    <button
                      key={side}
                      type="button"
                      className={`yn-btn${selected ? " selected" : ""}${prefilled ? " prefilled" : ""}`}
                      aria-pressed={selected}
                      onClick={() => select(c.id, side)}
                    >
                      {side === "yes" ? "Yes" : "No"}
                    </button>
                  );
                })}
              </div>
              {expanded && (
                <div
                  className="chip-strip chip-grid"
                  role="radiogroup"
                  aria-label={`${c.course_name}: how long`}
                >
                  {PLAN_MINUTE_OPTIONS.map((o) => (
                    <label key={o.value}>
                      <input
                        type="radio"
                        name={`minutes-${c.id}`}
                        value={o.value}
                        checked={state.minutes === o.value}
                        onChange={() => setCard(c.id, { ...state, minutes: o.value })}
                      />
                      <span className="chip">{o.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
