"use client";

import { useState } from "react";

export function ExportForm({ tables }: { tables: string[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  return (
    <section className="card stack">
      <h2>Range</h2>
      <div style={{ display: "flex", gap: 8 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="from">From</label>
          <input
            id="from"
            className="input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="to">To</label>
          <input
            id="to"
            className="input"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      <p className="muted tiny">
        Leave blank for all dates. test_dates always exports in full (it defines the test
        calendar).
      </p>

      <h2>Download</h2>
      <div>
        <a className="btn" href={`/api/export?${params.toString()}`}>
          All tables (JSON)
        </a>
      </div>
      {tables.map((t) => (
        <div key={t}>
          <a className="btn btn-secondary" href={`/api/export?format=csv&table=${t}&${params.toString()}`}>
            {t} (CSV)
          </a>
        </div>
      ))}
    </section>
  );
}
