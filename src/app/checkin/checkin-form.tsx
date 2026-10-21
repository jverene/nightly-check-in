"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Item, Segmented, Slider } from "@/components/controls";
import { PlanningCards, emptyPlanCard, type PlanCardState } from "@/components/planning-cards";

const FOOTER_TEXT =
  "This check-in is graded on completion only. Your answers are never shown to teachers and never affect your grades or workload. School counseling resources are available if you need them.";

const SLEEP_BAND_OPTIONS = [
  { value: "LT5" as const, label: "<5" },
  { value: "5_6" as const, label: "5–6" },
  { value: "6_7" as const, label: "6–7" },
  { value: "7_8" as const, label: "7–8" },
  { value: "GT8" as const, label: ">8" },
];

type SleepBand = (typeof SLEEP_BAND_OPTIONS)[number]["value"];

type Stats = {
  week_count: number;
  week_total: number;
  term_count: number;
  class_percent: number;
};

type TodayData = {
  state: "open" | "late" | "before" | "closed";
  local_date: string | null;
  is_sunday: boolean;
  arm: "INTERVENTION" | "CONTROL";
  setup_complete: boolean;
  already_submitted: boolean;
  confirmation_code: string | null;
  stats: Stats | null;
  courses: { id: string; course_name: string }[];
  prefill: Record<string, "yes" | "no">;
  existing: null | {
    stress_0_10: number | null;
    pna_stress: boolean;
    sleep_band: SleepBand | null;
    pna_sleep: boolean;
    sleep_quality: number | null;
    pna_quality: boolean;
    workload_next_3d_0_10: number | null;
    pna_workload: boolean;
    weekly: null | {
      late_nights_0_7: number | null;
      pna_late_nights: boolean;
      challenge_0_10: number | null;
      pna_challenge: boolean;
    };
    plans: { course_id: string; studying: boolean; minutes: number | null }[];
  };
};

type Answer<T> = { value: T | null; pna: boolean };

type FormState = {
  stress: Answer<number>;
  sleepBand: Answer<SleepBand>;
  quality: Answer<number>;
  workload: Answer<number>;
  lateNights: Answer<number>;
  challenge: Answer<number>;
  plans: Record<string, PlanCardState>;
};

const emptyAnswer = { value: null, pna: false };

function initialForm(data: TodayData): FormState {
  const ex = data.existing;
  const plans: Record<string, PlanCardState> = {};
  for (const c of data.courses) plans[c.id] = emptyPlanCard(data.prefill[c.id] ?? null);
  if (ex) {
    // Tonight's own answers are real values (touched), not prefill hints.
    for (const p of ex.plans) {
      plans[p.course_id] = {
        answer: p.studying ? "yes" : "no",
        minutes: p.minutes,
        touched: true,
        prefilled: null,
      };
    }
  }
  return {
    stress: ex ? { value: ex.stress_0_10, pna: ex.pna_stress } : { ...emptyAnswer },
    sleepBand: ex ? { value: ex.sleep_band, pna: ex.pna_sleep } : { ...emptyAnswer },
    quality: ex ? { value: ex.sleep_quality, pna: ex.pna_quality } : { ...emptyAnswer },
    workload: ex ? { value: ex.workload_next_3d_0_10, pna: ex.pna_workload } : { ...emptyAnswer },
    lateNights: ex?.weekly
      ? { value: ex.weekly.late_nights_0_7, pna: ex.weekly.pna_late_nights }
      : { ...emptyAnswer },
    challenge: ex?.weekly
      ? { value: ex.weekly.challenge_0_10, pna: ex.weekly.pna_challenge }
      : { ...emptyAnswer },
    plans,
  };
}

export function CheckinForm() {
  const [data, setData] = useState<TodayData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmedCode, setConfirmedCode] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    fetch("/api/today")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: TodayData) => {
        setData(d);
        setForm(initialForm(d));
        setConfirmedCode(d.confirmation_code);
        setStats(d.stats);
        if (!d.confirmation_code) startedAt.current = Date.now();
      })
      .catch(() => setLoadError(true));
  }, []);

  const answered = useAnswered(form, data);

  if (loadError) {
    return <p className="error-text">Couldn&rsquo;t load tonight&rsquo;s check-in. Refresh to try again.</p>;
  }
  if (!data || !form) {
    return (
      <div className="stack" aria-busy="true">
        <p className="skeleton">Loading tonight&rsquo;s check-in</p>
        <p className="skeleton">Almost there</p>
        <p className="skeleton">One moment</p>
      </div>
    );
  }

  if (data.state === "closed") {
    return (
      <div className="card stack">
        <h1>Check-in is closed for tonight</h1>
        <p className="muted small">Come back on the next school night between 4pm and midnight.</p>
        <StudentNav />
      </div>
    );
  }

  if (data.state === "before") {
    return (
      <div className="card stack">
        <h1>Check-in opens at 4pm</h1>
        <p className="muted small">Come back between 4pm and midnight tonight.</p>
        <StudentNav />
      </div>
    );
  }

  if (!data.setup_complete) {
    return (
      <div className="card stack">
        <h1>One quick step first</h1>
        <p className="muted small">Pick your courses before your first check-in.</p>
        <Link className="btn" href="/setup">
          Set up courses
        </Link>
      </div>
    );
  }

  if (confirmedCode && !editing) {
    return (
      <div className="stack">
        <div className="card stack" style={{ textAlign: "center" }}>
          <h1>
            <span className="check-mark">✓</span>Submitted
          </h1>
          {stats && (
            <div className="stat-lines">
              <span>
                This week: {stats.week_count} of {stats.week_total} nights
              </span>
              <span>{stats.term_count} nights this term</span>
              <span>Your class is at {stats.class_percent}% this week</span>
            </div>
          )}
          <div className="confirm-code">{confirmedCode}</div>
          <p className="muted small">Screenshot this code if you want proof of completion.</p>
        </div>
        {data.state === "open" && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              startedAt.current = Date.now();
              setEditing(true);
            }}
          >
            Edit answers (until midnight)
          </button>
        )}
        <p className="form-footer">{FOOTER_TEXT}</p>
        <StudentNav />
      </div>
    );
  }

  async function submit() {
    setError(null);
    if (!answered) {
      setError("Answer each question, or tap “Prefer not to answer” on the ones you skip.");
      return;
    }
    const d = data!;
    const f = form!;
    if (d.arm === "INTERVENTION") {
      const missingMinutes = d.courses.some(
        (c) => f.plans[c.id]?.touched && f.plans[c.id]?.answer === "yes" && f.plans[c.id]?.minutes === null,
      );
      if (missingMinutes) {
        setError("Pick a time for every Yes.");
        return;
      }
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        local_date: d.local_date,
        stress_0_10: f.stress.value,
        pna_stress: f.stress.pna,
        sleep_band: f.sleepBand.value,
        pna_sleep: f.sleepBand.pna,
        sleep_quality: f.quality.value,
        pna_quality: f.quality.pna,
        workload_next_3d_0_10: f.workload.value,
        pna_workload: f.workload.pna,
        completion_seconds: Math.round((Date.now() - startedAt.current) / 1000),
      };
      if (d.is_sunday) {
        payload.weekly = {
          late_nights_0_7: f.lateNights.value,
          pna_late_nights: f.lateNights.pna,
          challenge_0_10: f.challenge.value,
          pna_challenge: f.challenge.pna,
        };
      }
      if (d.arm === "INTERVENTION") {
        // Untouched or deselected cards submit as no row (valid, unanswered).
        payload.plans = Object.entries(f.plans)
          .filter(([, s]) => s.touched && s.answer !== null)
          .map(([course_id, s]) => ({
            course_id,
            studying: s.answer === "yes",
            minutes: s.answer === "yes" ? s.minutes : null,
          }));
      }
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setError("The date rolled over. Refresh and submit again.");
        return;
      }
      if (res.status === 403) {
        setError("Check-in is closed for tonight.");
        return;
      }
      if (!res.ok) {
        setError("Couldn't submit. Check your answers and try again.");
        return;
      }
      setConfirmedCode(body.confirmation_code);
      setStats(body.stats ?? null);
      setEditing(false);
      window.scrollTo({ top: 0 });
    } finally {
      setBusy(false);
    }
  }

  const setAnswer = <T,>(key: keyof FormState & string, answer: Answer<T>) =>
    setForm((f) => (f ? ({ ...f, [key]: answer } as FormState) : f));

  return (
    <div className="stack">
      {data.state === "late" && (
        <p className="error-text">
          It&rsquo;s after midnight — this will count for last night and be marked late.
        </p>
      )}

      {data.arm === "INTERVENTION" && (
        <PlanningCards
          courses={data.courses}
          value={form.plans}
          onChange={(plans) => setForm((f) => (f ? { ...f, plans } : f))}
          onSameAsYesterday={() =>
            setForm((f) => {
              if (!f) return f;
              const plans = { ...f.plans };
              for (const [id, s] of Object.entries(plans)) {
                if (s.prefilled && !s.touched) {
                  plans[id] = { ...s, answer: s.prefilled, touched: true };
                }
              }
              return { ...f, plans };
            })
          }
        />
      )}

      <Item
        label="How stressed do you feel right now?"
        pna={form.stress.pna}
        onPnaChange={(pna) => setAnswer("stress", { value: null, pna })}
      >
        <Slider
          name="Stress"
          value={form.stress.value}
          onChange={(v) => setAnswer("stress", { value: v, pna: false })}
          minLabel="Not at all"
          maxLabel="Extremely"
        />
      </Item>

      <Item
        label="How many hours did you sleep last night?"
        pna={form.sleepBand.pna}
        onPnaChange={(pna) => setAnswer("sleepBand", { value: null, pna })}
      >
        <Segmented
          name="Hours of sleep"
          options={SLEEP_BAND_OPTIONS}
          value={form.sleepBand.value}
          onChange={(v) => setAnswer("sleepBand", { value: v, pna: false })}
        />
      </Item>

      <Item
        label="How would you rate the quality of your sleep last night?"
        pna={form.quality.pna}
        onPnaChange={(pna) => setAnswer("quality", { value: null, pna })}
      >
        <Segmented
          name="Sleep quality"
          options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
          value={form.quality.value}
          onChange={(v) => setAnswer("quality", { value: v, pna: false })}
          endpoints={["Very poor", "Very good"]}
        />
      </Item>

      <Item
        label="How much do you have due in the next 3 days?"
        pna={form.workload.pna}
        onPnaChange={(pna) => setAnswer("workload", { value: null, pna })}
      >
        <Slider
          name="Workload"
          value={form.workload.value}
          onChange={(v) => setAnswer("workload", { value: v, pna: false })}
          minLabel="Nothing"
          maxLabel="A lot"
        />
      </Item>

      {data.is_sunday && (
        <>
          <Item
            label="How many late nights (past midnight) did you have this week?"
            pna={form.lateNights.pna}
            onPnaChange={(pna) => setAnswer("lateNights", { value: null, pna })}
          >
            <Segmented
              name="Late nights"
              options={[0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))}
              value={form.lateNights.value}
              onChange={(v) => setAnswer("lateNights", { value: v, pna: false })}
            />
          </Item>

          <Item
            label="This week, my coursework was appropriately challenging."
            pna={form.challenge.pna}
            onPnaChange={(pna) => setAnswer("challenge", { value: null, pna })}
          >
            <Slider
              name="Appropriately challenging"
              value={form.challenge.value}
              onChange={(v) => setAnswer("challenge", { value: v, pna: false })}
              minLabel="Strongly disagree"
              maxLabel="Strongly agree"
            />
          </Item>
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      <button className="btn" onClick={submit} disabled={busy}>
        {data.already_submitted ? "Update tonight's answers" : "Submit"}
      </button>

      <p className="form-footer">{FOOTER_TEXT}</p>

      <div className="row-between">
        <Link href="/setup" className="muted small">
          Courses
        </Link>
        <StudentNav bare />
      </div>
    </div>
  );
}

function useAnswered(form: FormState | null, data: TodayData | null): boolean {
  return useMemo(() => {
    if (!form || !data) return false;
    const ok = <T,>(a: Answer<T>) => a.pna !== (a.value !== null);
    const core = ok(form.stress) && ok(form.sleepBand) && ok(form.quality) && ok(form.workload);
    if (!data.is_sunday) return core;
    return core && ok(form.lateNights) && ok(form.challenge);
  }, [form, data]);
}

export function StudentNav({ bare = false }: { bare?: boolean }) {
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  const links = (
    <>
      <Link href="/history">History</Link>
      <Link href="/settings">Settings</Link>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          signOut();
        }}
      >
        Sign out
      </a>
    </>
  );
  if (bare) return <span className="nav-row">{links}</span>;
  return (
    <nav className="nav-row">
      <Link href="/checkin">Tonight</Link>
      {links}
    </nav>
  );
}
