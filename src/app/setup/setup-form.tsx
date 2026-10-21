"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SetupData = {
  presets: string[];
  courses: { id: string; course_name: string }[];
};

export function SetupForm() {
  const router = useRouter();
  const [data, setData] = useState<SetupData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/setup")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: SetupData) => {
        setData(d);
        setSelected(d.courses.map((c) => c.course_name));
      })
      .catch(() => setError("Couldn't load your courses. Refresh to try again."));
  }, []);

  if (!data) {
    return (
      <div className="stack" aria-busy="true">
        <p className="skeleton">Loading courses</p>
        <p className="skeleton">One moment</p>
      </div>
    );
  }

  function toggleCourse(name: string) {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(name)) return prev.filter((c) => c !== name);
      if (prev.length >= 8) {
        setError("You can pick at most 8 courses.");
        return prev;
      }
      return [...prev, name];
    });
  }

  async function save() {
    setError(null);
    if (selected.length === 0) {
      setError("Pick at least one course.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courses: selected }),
      });
      if (!res.ok) {
        setError("Couldn't save. Try again.");
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
