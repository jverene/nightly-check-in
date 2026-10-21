"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChipStrip, Item, Segmented, Slider } from "./controls";

const FOOTER_TEXT =
  "This check-in is graded on completion only. Your answers are never shown to teachers and never affect your grades or workload. School counseling resources are available if you need them.";

const MINUTE_OPTIONS = [
  { value: 0, label: "0" },
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

const SLEEP_BAND_OPTIONS = [
  { value: "LT5" as const, label: "<5" },
  { value: "5_6" as const, label: "5–6" },
  { value: "6_7" as const, label: "6–7" },
  { value: "7_8" as const, label: "7–8" },
  { value: "GT8" as const, label: ">8" },
];

type SleepBand = (typeof SLEEP_BAND_OPTIONS)[number]["value"];

type TodayData = {
  state: "open" | "late" | "before" | "closed";
  local_date: string | null;
  is_sunday: boolean;
  arm: "INTERVENTION" | "CONTROL";
  setup_complete: boolean;
  already_submitted: boolean;
  confirmation_code: string | null;
  courses: { id: string; course_name: string }[];
  tests: { course_name: string; test_date: string; weekday: string; label: string }[];
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
    plans: { course_id: string; minutes: number }[];
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
  plans: Record<string, number | null>;
};

const emptyAnswer = { value: null, pna: false };

function initialForm(data: TodayData): FormState {
  const ex = data.existing;
  const plans: Record<string, number | null> = {};
  for (const c of data.courses) plans[c.id] = null;
  if (ex) for (const p of ex.plans) plans[p.course_id] = p.minutes;
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

  useEffect(() => {
    fetch("/api/today")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: TodayData) => {
        setData(d);
        setForm(initialForm(d));
        setConfirmedCode(d.confirmation_code);
      })
      .catch(() => setLoadError(true));
  }, []);

  const answered = useCallbackAnswered(form, data);

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
          <div className="confirm-code">{confirmedCode}</div>
          <p className="muted small">Screenshot this code if you want proof of completion.</p>
        </div>
        {data.state === "open" && (
          <button className="btn btn-secondary" onClick={() => setEditing(true)}>
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
    setBusy(true);
    try {
      const d = data!;
      const f = form!;
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
        payload.plans = Object.entries(f.plans)
          .filter(([, minutes]) => minutes !== null)
          .map(([course_id, minutes]) => ({ course_id, minutes }));
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
        <>
          {data.tests.length > 0 && (
            <section className="card" aria-label="Upcoming tests">
              {data.tests.map((t) => (
                <Link key={t.course_name + t.test_date} className="test-line" href="/setup#tests">
                  <span>
                    {t.course_name} test: {t.weekday}
                  </span>
                  <span className="days">{t.label}</span>
                </Link>
              ))}
            </section>
          )}

          <section className="card" aria-label="Tonight's plan">
            <h2 style={{ marginBottom: 4 }}>Tonight&rsquo;s plan</h2>
            <p className="muted small" style={{ marginBottom: 8 }}>
              How long will you study for each course tonight?
            </p>
            {data.courses.map((c) => (
              <div className="plan-row" key={c.id}>
                <div className="plan-course">{c.course_name}</div>
                <ChipStrip
                  name={`plan-${c.id}`}
                  options={MINUTE_OPTIONS}
                  value={form.plans[c.id] ?? null}
                  onToggle={(v) =>
                    setForm((f) => (f ? { ...f, plans: { ...f.plans, [c.id]: v } } : f))
                  }
                />
              </div>
            ))}
          </section>
        </>
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

function useCallbackAnswered(form: FormState | null, data: TodayData | null): boolean {
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
