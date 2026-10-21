"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConsentForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"CONSENTED" | "NOT_CONSENTED" | "WITHDRAWN">("CONSENTED");
  const [excluded, setExcluded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const normalized = code.trim().toLowerCase();
      const [consentRes, excludeRes] = await Promise.all([
        fetch("/api/consent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ participant_code: normalized, status }),
        }),
        fetch("/api/exclude", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ participant_code: normalized, excluded }),
        }),
      ]);
      if (!consentRes.ok || !excludeRes.ok) {
        setMessage("Couldn't save — check the code against your paper sheet.");
        return;
      }
      setMessage(`Saved ${normalized}.`);
      setCode("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2>Update a code</h2>
      <div className="field">
        <label htmlFor="code">Participant code</label>
        <input
          id="code"
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
        <label htmlFor="status">Consent status</label>
        <select
          id="status"
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="CONSENTED">CONSENTED</option>
          <option value="NOT_CONSENTED">NOT_CONSENTED</option>
          <option value="WITHDRAWN">WITHDRAWN</option>
        </select>
      </div>
      <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={excluded}
          onChange={(e) => setExcluded(e.target.checked)}
        />
        Excluded from study (research-team member)
      </label>
      <button className="btn" onClick={save} disabled={busy || !code.trim()}>
        Save
      </button>
      {message && <p className="small">{message}</p>}
    </section>
  );
}
