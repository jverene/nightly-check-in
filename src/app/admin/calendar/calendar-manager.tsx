"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  course_name: string;
  section: string | null;
  assess_date: string;
  assess_type: "TEST" | "QUIZ" | "ASSIGNMENT";
};

const TYPES = ["TEST", "QUIZ", "ASSIGNMENT"] as const;
const emptyForm = { id: null as string | null, course_name: "", section: "", assess_date: "", assess_type: "TEST" as Row["assess_type"] };

export function CalendarManager({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [csv, setCsv] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        course_name: form.course_name.trim(),
        section: form.section.trim() || null,
        assess_date: form.assess_date,
        assess_type: form.assess_type,
      };
      const res = await fetch("/api/calendar", {
        method: form.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form.id ? { ...payload, id: form.id } : payload),
      });
      if (!res.ok) {
        setMessage("Couldn't save — check the date format and type.");
        return;
      }
      setForm(emptyForm);
      setMessage("Saved.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this calendar row?")) return;
    const res = await fetch("/api/calendar", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) router.refresh();
  }

  async function importCsv() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/calendar/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv_text: csv }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage("Import failed.");
        return;
      }
      setCsv("");
      setMessage(
        `Imported ${data.imported} row${data.imported === 1 ? "" : "s"}` +
          (data.errors?.length ? `; ${data.errors.length} line(s) skipped: ${data.errors.map((e: { line: number }) => e.line).join(", ")}` : ""),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card stack">
        <h2>{form.id ? "Edit row" : "Add a date"}</h2>
        <div className="field">
          <label htmlFor="cal-course">Course</label>
          <input
            id="cal-course"
            className="input"
            placeholder="AP Statistics"
            value={form.course_name}
            onChange={(e) => setForm({ ...form, course_name: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="cal-section">Section (optional)</label>
          <input
            id="cal-section"
            className="input"
            placeholder="AP Statistics"
            value={form.section}
            onChange={(e) => setForm({ ...form, section: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="cal-date">Date</label>
          <input
            id="cal-date"
            className="input"
            type="date"
            value={form.assess_date}
            onChange={(e) => setForm({ ...form, assess_date: e.target.value })}
          />
        </div>
        <div className="segmented" role="radiogroup" aria-label="Type">
          {TYPES.map((t) => (
            <label key={t}>
              <input
                type="radio"
                name="assess_type"
                checked={form.assess_type === t}
                onChange={() => setForm({ ...form, assess_type: t })}
              />
              <span className="seg">{t.charAt(0) + t.slice(1).toLowerCase()}</span>
            </label>
          ))}
        </div>
        <div className="form-actions">
          <button className="btn" onClick={save} disabled={busy || !form.course_name.trim() || !form.assess_date}>
            {form.id ? "Save changes" : "Add"}
          </button>
          {form.id && (
            <button className="btn-link" onClick={() => setForm(emptyForm)}>
              Cancel edit
            </button>
          )}
        </div>
        {message && <p className="small">{message}</p>}
      </section>

      <section className="card stack">
        <h2>Import CSV</h2>
        <p className="muted tiny">
          One per line: <code>course, section, YYYY-MM-DD, TEST|QUIZ|ASSIGNMENT</code>. Section may
          be blank. A header line is skipped.
        </p>
        <textarea
          className="input"
          rows={5}
          style={{ fontFamily: "inherit", resize: "vertical" }}
          placeholder={"AP Statistics, AP Statistics, 2026-11-04, TEST\nBiology, , 2026-11-06, QUIZ"}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={importCsv} disabled={busy || !csv.trim()}>
          Import
        </button>
      </section>

      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Course</th>
            <th>Section</th>
            <th>Type</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.assess_date}</td>
              <td>{r.course_name}</td>
              <td className="muted">{r.section ?? "—"}</td>
              <td>{r.assess_type}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button
                  className="btn-link"
                  onClick={() =>
                    setForm({
                      id: r.id,
                      course_name: r.course_name,
                      section: r.section ?? "",
                      assess_date: r.assess_date,
                      assess_type: r.assess_type,
                    })
                  }
                >
                  Edit
                </button>{" "}
                <button className="btn-link" onClick={() => remove(r.id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted small">No dates yet.</p>}
    </>
  );
}
