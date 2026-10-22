"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Segmented, Slider } from "@/components/controls";
import { PLAN_MINUTE_OPTIONS, type PlanCardState } from "@/components/planning-cards";

/**
 * Public, no-login click-through demo of the nightly flow. One page per
 * question, auto-advance on answer, ArrowUp/ArrowDown to move between pages.
 * Zero network requests, zero animations: state lives here and dies with the
 * tab. Exists so a teacher can gauge the effort on their own phone.
 *
 * Keyboard rule everywhere: Left/Right work the control, Up/Down change pages.
 */

const FOOTER_TEXT =
  "This check-in is graded on completion only. Your answers are never shown to teachers and never affect your grades or workload. School counseling resources are available if you need them.";

const DEMO_COURSES = [
  { id: "d1", course_name: "AP Statistics" },
  { id: "d2", course_name: "Data Management" },
  { id: "d3", course_name: "English" },
  { id: "d4", course_name: "Biology" },
  { id: "d5", course_name: "Chemistry" },
  { id: "d6", course_name: "Physics" },
  { id: "d7", course_name: "History" },
  { id: "d8", course_name: "French" },
];

// Night-30 prefill: yesterday they studied for two courses, skipped the rest.
const DEMO_PREFILL: Record<string, "yes" | "no"> = {
  d1: "yes",
  d2: "no",
  d3: "no",
  d4: "yes",
  d5: "no",
  d6: "no",
  d7: "no",
  d8: "no",
};

const SLEEP_BAND_OPTIONS = [
  { value: "LT5", label: "<5" },
  { value: "5_6", label: "5–6" },
  { value: "6_7", label: "6–7" },
  { value: "7_8", label: "7–8" },
  { value: "GT8", label: ">8" },
];

const STEP_STRESS = 8;
const STEP_SLEEP = 9;
const STEP_QUALITY = 10;
const STEP_WORKLOAD = 11;
const STEP_SUBMIT = 12;

type Answer<T> = { value: T | null; pna: boolean };
const emptyAnswer = <T,>(): Answer<T> => ({ value: null, pna: false });

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function fakeCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const raw = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function courseAnswered(s: PlanCardState | undefined): boolean {
  return !!s?.touched && (s.answer === "no" || (s.answer === "yes" && s.minutes !== null));
}

export function DemoForm() {
  const [step, setStep] = useState(0);
  const [plans, setPlans] = useState<Record<string, PlanCardState>>(() =>
    Object.fromEntries(
      DEMO_COURSES.map((c) => [
        c.id,
        { answer: null, minutes: null, touched: false, prefilled: DEMO_PREFILL[c.id] ?? null },
      ]),
    ),
  );
  const [stress, setStress] = useState<Answer<number>>(emptyAnswer);
  const [sleepBand, setSleepBand] = useState<Answer<string>>(emptyAnswer);
  const [quality, setQuality] = useState<Answer<number>>(emptyAnswer);
  const [workload, setWorkload] = useState<Answer<number>>(emptyAnswer);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ code: string; seconds: number } | null>(null);
  const startedAt = useRef<number>(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  // The pages this session actually showed, so Back retraces the real path
  // instead of stepping through pages that auto-advance skipped over.
  const visited = useRef<number[]>([]);

  const wellbeingOk = useMemo(() => {
    const ok = <T,>(a: Answer<T>) => a.pna !== (a.value !== null);
    return ok(stress) && ok(sleepBand) && ok(quality) && ok(workload);
  }, [stress, sleepBand, quality, workload]);

  // Focus the primary control of each page as it appears.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const el =
      container.querySelector<HTMLElement>("[data-autofocus]") ??
      container.querySelector<HTMLElement>("input, button.btn");
    el?.focus();
  }, [step]);

  // Give every page its own history entry so the browser's back button walks
  // the wizard instead of leaving the demo. The state guard keeps a popstate
  // navigation from pushing a duplicate entry for the page it just restored.
  useEffect(() => {
    window.history.replaceState({ ...(window.history.state ?? {}), demoStep: 0 }, "");
  }, []);

  useEffect(() => {
    if ((window.history.state as { demoStep?: number } | null)?.demoStep === step) return;
    window.history.pushState({ ...(window.history.state ?? {}), demoStep: step }, "");
  }, [step]);

  useEffect(() => {
    function onPop(e: PopStateEvent) {
      const restored = (e.state as { demoStep?: number } | null)?.demoStep;
      if (typeof restored !== "number") return;
      visited.current = Array.from({ length: restored }, (_, i) => i);
      setError(null);
      setStep(restored);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function wellbeingAnswered(s: number): boolean {
    const a = [stress, sleepBand, quality, workload][s - STEP_STRESS];
    // Answered means "has a value" XOR "prefer not to answer".
    return a ? a.pna !== (a.value !== null) : false;
  }

  function stepAnswered(s: number): boolean {
    if (s < 8) return courseAnswered(plans[DEMO_COURSES[s].id]);
    if (s < STEP_SUBMIT) return wellbeingAnswered(s);
    return false;
  }

  /** Forward always lands on the next page that still needs input. */
  function nextUnanswered(from: number): number {
    for (let s = from + 1; s < STEP_SUBMIT; s++) {
      if (!stepAnswered(s)) return s;
    }
    return STEP_SUBMIT;
  }

  /** Move to a page, remembering the one we came from. */
  function go(next: number) {
    if (next === step) return;
    // Same-tick double fires (a slider commit followed by its change event)
    // must not record the same page twice, or Back would stall on it.
    if (visited.current[visited.current.length - 1] !== step) visited.current.push(step);
    setStep(next);
  }

  /** Back retraces the pages that were actually shown, in reverse. */
  function back() {
    setError(null);
    const prev = visited.current.pop();
    setStep(prev ?? Math.max(step - 1, 0));
  }

  function advance() {
    setError(null);
    go(nextUnanswered(step));
  }

  function selectCourse(id: string, side: "yes" | "no") {
    const cur = plans[id];
    if (cur?.touched && cur.answer === side) {
      setPlans({ ...plans, [id]: { answer: null, minutes: null, touched: false, prefilled: cur.prefilled } });
      return;
    }
    setPlans({
      ...plans,
      [id]: { answer: side, minutes: side === "yes" ? cur?.minutes ?? null : null, touched: true, prefilled: cur?.prefilled ?? null },
    });
    if (side === "no") advance();
    // Yes expands the minutes strip on the same page; minutes tap advances.
  }

  function selectMinutes(id: string, minutes: number) {
    setPlans((p) => ({ ...p, [id]: { ...p[id], minutes } }));
    advance();
  }

  function sameAsYesterday() {
    const next = Object.fromEntries(
      Object.entries(plans).map(([id, s]) => [
        id,
        s.prefilled && !s.touched ? { ...s, answer: s.prefilled, touched: true } : s,
      ]),
    );
    setPlans(next);
    // Jump to the first Yes that still needs minutes, else to the sliders.
    const needsMinutes = DEMO_COURSES.findIndex(
      (c) => next[c.id]?.touched && next[c.id]?.answer === "yes" && next[c.id]?.minutes === null,
    );
    go(needsMinutes >= 0 ? needsMinutes : STEP_STRESS);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement;
    const onControl =
      target.tagName === "INPUT" || target.classList.contains("yn-btn");

    if (e.key === "ArrowUp") {
      e.preventDefault();
      back();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      advance();
      return;
    }
    if (e.key === "Enter" && step === STEP_SUBMIT) {
      e.preventDefault();
      submit();
      return;
    }
    // Course pages: Y/N and Left/Right select on the focused card.
    if (step < 8 && !onControl) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        selectCourse(DEMO_COURSES[step].id, e.key === "ArrowLeft" ? "no" : "yes");
        return;
      }
      if (e.key === "y" || e.key === "Y" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        selectCourse(DEMO_COURSES[step].id, e.key.toLowerCase() === "y" ? "yes" : "no");
      }
      return;
    }
    if (step < 8 && target.classList.contains("yn-btn")) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        selectCourse(DEMO_COURSES[step].id, e.key === "ArrowLeft" ? "no" : "yes");
        return;
      }
      if (e.key === "y" || e.key === "Y" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        selectCourse(DEMO_COURSES[step].id, e.key.toLowerCase() === "y" ? "yes" : "no");
      }
    }
  }

  function submit() {
    if (!wellbeingOk) {
      const firstBad =
        [stress, sleepBand, quality, workload].findIndex((a) => a.pna === (a.value !== null)) +
        STEP_STRESS;
      setError("Answer this, or tap “Prefer not to answer”.");
      // A validation jump restarts the trail: Back from here goes one page up.
      visited.current = Array.from({ length: firstBad }, (_, i) => i);
      setStep(firstBad);
      return;
    }
    const badPlan = DEMO_COURSES.findIndex(
      (c) => plans[c.id]?.touched && plans[c.id]?.answer === "yes" && plans[c.id]?.minutes === null,
    );
    if (badPlan >= 0) {
      setError("Pick a time for this Yes.");
      visited.current = Array.from({ length: badPlan }, (_, i) => i);
      setStep(badPlan);
      return;
    }
    setError(null);
    setDone({ code: fakeCode(), seconds: Math.round((Date.now() - startedAt.current) / 1000) });
    window.scrollTo({ top: 0 });
  }

  function reset() {
    setPlans(
      Object.fromEntries(
        DEMO_COURSES.map((c) => [
          c.id,
          { answer: null, minutes: null, touched: false, prefilled: DEMO_PREFILL[c.id] ?? null },
        ]),
      ),
    );
    setStress(emptyAnswer());
    setSleepBand(emptyAnswer());
    setQuality(emptyAnswer());
    setWorkload(emptyAnswer());
    setError(null);
    setDone(null);
    visited.current = [];
    setStep(0);
    startedAt.current = Date.now();
    window.scrollTo({ top: 0 });
  }

  if (done) {
    return (
      <div className="stack">
        <span className="demo-label">Demo</span>
        <div className="card stack" style={{ textAlign: "center" }}>
          <h1>
            <span className="check-mark">✓</span>Submitted
          </h1>
          <div className="stat-lines">
            <span>This week: 3 of 5 nights</span>
            <span>30 nights this term</span>
            <span>Completed in {done.seconds} seconds</span>
          </div>
          <div className="confirm-code">{done.code}</div>
          <p className="muted small">Screenshot this code if you want proof of completion.</p>
        </div>
        <button className="btn btn-secondary" onClick={reset}>
          Try again
        </button>
        <p className="form-footer">{FOOTER_TEXT}</p>
      </div>
    );
  }

  const hasPrefill = step < 8 && Object.values(plans).some((s) => s.prefilled && !s.touched);

  return (
    <div className="stack" ref={containerRef} onKeyDown={onKeyDown}>
      <div className="row-between" style={{ minHeight: 24 }}>
        <span>
          {step > 0 ? (
            <button type="button" className="btn-link" onClick={back}>
              ← Back <span className="muted tiny">(↑)</span>
            </button>
          ) : (
            <span className="demo-label">Demo</span>
          )}
        </span>
        <span className="muted tiny" style={{ fontVariantNumeric: "tabular-nums" }}>
          {Math.min(step + 1, 12)} of 12
        </span>
      </div>

      {step < 8 &&
        (() => {
          const c = DEMO_COURSES[step];
          const state = plans[c.id];
          const expanded = state.touched && state.answer === "yes";
          return (
            <div className="stack" key={c.id}>
              <div className="row-between">
                <h1>{c.course_name}</h1>
                {hasPrefill && (
                  <button type="button" className="btn-link" onClick={sameAsYesterday}>
                    Same as yesterday
                  </button>
                )}
              </div>
              <p className="muted small">Studying for this course tonight?</p>
              <div className="yn-row" role="group" aria-label={`${c.course_name}: studying tonight?`}>
                {(["no", "yes"] as const).map((side) => {
                  const selected = state.touched && state.answer === side;
                  const prefilled = !state.touched && state.prefilled === side;
                  return (
                    <button
                      key={side}
                      type="button"
                      data-autofocus={side === "no" ? true : undefined}
                      className={`yn-btn${selected ? " selected" : ""}${prefilled ? " prefilled" : ""}`}
                      aria-pressed={selected}
                      onClick={() => selectCourse(c.id, side)}
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
                        onChange={() => selectMinutes(c.id, o.value)}
                      />
                      <span className="chip">{o.label}</span>
                    </label>
                  ))}
                </div>
              )}
              {error && <p className="error-text">{error}</p>}
            </div>
          );
        })()}

      {step === STEP_STRESS && (
        <WizardItem
          label="How stressed do you feel right now?"
          pna={stress.pna}
          onPna={() => {
            setStress({ value: null, pna: true });
            advance();
          }}
          error={error}
        >
          <Slider
            name="Stress"
            value={stress.value}
            onChange={(v) => setStress({ value: v, pna: false })}
            onCommit={advance}
            minLabel="Not at all"
            maxLabel="Extremely"
          />
        </WizardItem>
      )}

      {step === STEP_SLEEP && (
        <WizardItem
          label="How many hours did you sleep last night?"
          pna={sleepBand.pna}
          onPna={() => {
            setSleepBand({ value: null, pna: true });
            advance();
          }}
          error={error}
        >
          <div onChangeCapture={advance}>
            <Segmented
              name="Hours of sleep"
              options={SLEEP_BAND_OPTIONS}
              value={sleepBand.value}
              onChange={(v) => setSleepBand({ value: v, pna: false })}
            />
          </div>
        </WizardItem>
      )}

      {step === STEP_QUALITY && (
        <WizardItem
          label="How would you rate the quality of your sleep last night?"
          pna={quality.pna}
          onPna={() => {
            setQuality({ value: null, pna: true });
            advance();
          }}
          error={error}
        >
          <div onChangeCapture={advance}>
            <Segmented
              name="Sleep quality"
              options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
              value={quality.value}
              onChange={(v) => setQuality({ value: v, pna: false })}
              endpoints={["Very poor", "Very good"]}
            />
          </div>
        </WizardItem>
      )}

      {step === STEP_WORKLOAD && (
        <WizardItem
          label="How much do you have due in the next 3 days?"
          pna={workload.pna}
          onPna={() => {
            setWorkload({ value: null, pna: true });
            advance();
          }}
          error={error}
        >
          <Slider
            name="Workload"
            value={workload.value}
            onChange={(v) => setWorkload({ value: v, pna: false })}
            onCommit={advance}
            minLabel="Nothing"
            maxLabel="A lot"
          />
        </WizardItem>
      )}

      {step === STEP_SUBMIT && (
        <div className="stack">
          <h1>That&rsquo;s it</h1>
          <p className="muted small">
            {wellbeingOk
              ? "Press Submit — or go back with ↑ to change anything."
              : "A few items still need an answer or “Prefer not to answer”."}
          </p>
          {error && <p className="error-text">{error}</p>}
          <button className="btn" data-autofocus onClick={submit} disabled={!wellbeingOk}>
            Submit
          </button>
          <p className="form-footer">{FOOTER_TEXT}</p>
        </div>
      )}
    </div>
  );
}

function WizardItem({
  label,
  pna,
  onPna,
  error,
  children,
}: {
  label: string;
  pna: boolean;
  onPna: () => void;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="stack">
      <h1 style={{ fontSize: 20 }}>{label}</h1>
      {pna ? <p className="pna-active">Prefer not to answer — noted.</p> : children}
      {!pna && (
        <div>
          <button type="button" className="pna-toggle" aria-pressed={false} onClick={onPna}>
            Prefer not to answer
          </button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
