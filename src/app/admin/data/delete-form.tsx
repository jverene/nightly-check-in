"use client";

import { useState } from "react";

export function DeleteForm() {
  const [code, setCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const normalized = code.trim().toLowerCase();
  const matches = normalized.length > 0 && confirmCode.trim().toLowerCase() === normalized;

  async function doDelete() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/data/${encodeURIComponent(normalized)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage("Deletion failed — nothing was removed.");
        return;
      }
      const total = Object.values(data.deleted as Record<string, number>).reduce((a, b) => a + b, 0);
      setMessage(`Deleted ${total} rows for ${normalized}. Consent is now WITHDRAWN.`);
      setCode("");
      setConfirmCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Delete a participant&rsquo;s data</h2>
      <div className="field">
        <label htmlFor="del-code">Participant code</label>
        <input
          id="del-code"
          className="input"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          placeholder="calm-otter-42"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="del-confirm">Type the code again to confirm</label>
        <input
          id="del-confirm"
          className="input"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          value={confirmCode}
          onChange={(e) => setConfirmCode(e.target.value)}
        />
      </div>
      <button className="btn btn-danger" onClick={doDelete} disabled={busy || !matches}>
        Permanently delete
      </button>
      {message && <p className="small">{message}</p>}
    </section>
  );
}
