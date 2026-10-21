"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SlotRow = {
  participant_code: string;
  arm: "INTERVENTION" | "CONTROL";
  class_section: string;
  claimed: boolean;
  locked: boolean;
  consent_status: string;
};

export function SlotsManager({ sections, slots }: { sections: string[]; slots: SlotRow[] }) {
  const router = useRouter();
  const [arm, setArm] = useState<"INTERVENTION" | "CONTROL">("INTERVENTION");
  const [section, setSection] = useState(sections[0] ?? "");
  const [newSection, setNewSection] = useState("");
  const [count, setCount] = useState(15);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  async function generate() {
    setBusy(true);
    setMessage(null);
    try {
      const targetSection = newSection.trim() || section;
      const res = await fetch("/api/slots/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ arm, count, class_section: targetSection }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage("Couldn't generate slots.");
        return;
      }
      setMessage(`Created ${data.created.length} slots for ${targetSection}. Print the strips next.`);
      setNewSection("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function rotate(code: string) {
    if (!confirm(`Rotate the login link for ${code}? Their old link and sessions stop working.`))
      return;
    const res = await fetch("/api/slots/rotate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ participant_code: code }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      prompt("New claim link — write it on a new strip and verify against your paper sheet:", data.claim_url);
      router.refresh();
    }
  }

  const shown = slots.filter((s) => {
    if (filter === "unclaimed") return !s.claimed;
    if (filter === "locked") return s.locked;
    return true;
  });

  return (
    <>
      <section className="card stack">
        <h2>Generate slots</h2>
        <div className="segmented" role="radiogroup" aria-label="Arm">
          {(
            [
              ["INTERVENTION", "Intervention"],
              ["CONTROL", "Control"],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input type="radio" name="arm" checked={arm === value} onChange={() => setArm(value)} />
              <span className="seg">{label}</span>
            </label>
          ))}
        </div>
        <div className="field">
          <label htmlFor="section">Class section</label>
          {sections.length > 0 ? (
            <select
              id="section"
              className="input"
              value={section}
              onChange={(e) => setSection(e.target.value)}
            >
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="section"
              className="input"
              placeholder="e.g. AP Statistics"
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
            />
          )}
          {sections.length > 0 && (
            <input
              className="input"
              placeholder="…or type a new section name"
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
            />
          )}
        </div>
        <div className="field">
          <label htmlFor="count">How many</label>
          <input
            id="count"
            className="input"
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
        <button className="btn" onClick={generate} disabled={busy || (!section && !newSection.trim())}>
          Generate
        </button>
        {message && <p className="small">{message}</p>}
      </section>

      <section className="card stack">
        <div className="row-between">
          <h2>Status</h2>
          <select className="input" style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="unclaimed">Unclaimed</option>
            <option value="locked">Locked</option>
          </select>
        </div>
        {sections.map((s) => (
          <a key={s} className="btn-link" href={`/admin/slots/print?section=${encodeURIComponent(s)}`}>
            Print strips — {s}
          </a>
        ))}
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Section</th>
              <th>Claimed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.participant_code}>
                <td>{s.participant_code}</td>
                <td className="muted">{s.class_section}</td>
                <td>{s.claimed ? "yes" : "—"}{s.locked ? " (locked)" : ""}</td>
                <td>
                  <button className="btn-link" onClick={() => rotate(s.participant_code)}>
                    Rotate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
