"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SetupData = {
  arm: "INTERVENTION" | "CONTROL";
  presets: string[];
  courses: { id: string; course_name: string }[];
  test_dates: { id: string; course_name: string | null; test_date: string }[];
};

type TestRow = { course_name: string; test_date: string };

export function SetupForm({ arm }: { arm: "INTERVENTION" | "CONTROL" }) {
  const router = useRouter();
  const [data, setData] = useState<SetupData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [tests, setTests] = useState<TestRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: SetupData) => {
        setData(d);
        setSelected(d.courses.map((c) => c.course_name));
        setTests(
          d.test_dates
            .filter((t) => t.course_name)
            .map((t) => ({ course_name: t.course_name!, test_date: t.test_date })),
        );
      })
      .catch(() => setError("Couldn't load your courses. Refresh to try again."));
  }, []);

  if (!data) {
    return (
      <div className="stack" aria-busy="true">
        <p className="skeleton">Loading courses</p>
        <p className="skeleton">Loading presets</p>
        <p className="skeleton">Loading test dates</p>
      </div>
    );
  }

  function toggleCourse(name: string) {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(name)) {
        setTests((ts) => ts.filter((t) => t.course_name !== name));
        return prev.filter((c) => c !== name);
      }
      if (prev.length >= 8) {
        setError("You can pick at most 8 courses.");
        return prev;
      }
      return [...prev, name];
    });
  }

  async function save() {
    setError(null);
    if (arm === "INTERVENTION" && selected.length === 0) {
      setError("Pick at least one course.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          courses: selected,
          test_dates: tests.filter((t) => t.course_name && t.test_date),
        }),
      });
      if (!res.ok) {
        setError("Couldn't save. Check your entries and try again.");
        return;
      }
      router.push("/checkin");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>Courses</h2>
        <p className="muted small" style={{ margin: "4px 0 16px" }}>
          Up to 8, from your class list.
        </p>
        <div className="chip-strip" style={{ flexWrap: "wrap", overflow: "visible" }}>
          {data.presets.map((name) => (
            <label key={name}>
              <input
                type="checkbox"
                checked={selected.includes(name)}
                onChange={() => toggleCourse(name)}
              />
              <span className="chip" style={{ fontSize: 14 }}>
                {name}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="card" id="tests">
        <h2>Test dates</h2>
        <p className="muted small" style={{ margin: "4px 0 16px" }}>
          Add tests as they&rsquo;re announced.
        </p>
        <div className="stack">
          {tests.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                className="input"
                style={{ flex: 1 }}
                value={t.course_name}
                onChange={(e) =>
                  setTests((ts) => ts.map((x, j) => (j === i ? { ...x, course_name: e.target.value } : x)))
                }
              >
                <option value="" disabled>
                  Course
                </option>
                {selected.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                className="input"
                style={{ width: 150 }}
                type="date"
                value={t.test_date}
                onChange={(e) =>
                  setTests((ts) => ts.map((x, j) => (j === i ? { ...x, test_date: e.target.value } : x)))
                }
              />
              <button
                type="button"
                className="btn-link"
                aria-label="Remove test date"
                onClick={() => setTests((ts) => ts.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          ))}
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={selected.length === 0}
              onClick={() => setTests((ts) => [...ts, { course_name: selected[0] ?? "", test_date: "" }])}
            >
              Add test date
            </button>
            {selected.length === 0 && (
              <p className="muted tiny" style={{ marginTop: 8 }}>
                Pick a course first.
              </p>
            )}
          </div>
        </div>
      </section>

      {error && <p className="error-text">{error}</p>}

      <div className="form-actions">
        <button className="btn" onClick={save} disabled={busy}>
          Save
        </button>
        <button className="btn-link" onClick={() => router.push("/checkin")}>
          Back to tonight
        </button>
      </div>
    </div>
  );
}
