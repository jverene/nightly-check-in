"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClaimForm({ token, claimed, locked }: { token: string; claimed: boolean; locked: boolean }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (locked) {
    return (
      <div className="card">
        <p className="small">
          This account is locked after too many wrong PIN attempts. Ask the sponsor to reissue
          your link.
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!claimed && pin !== pinConfirm) {
      setError("The two PINs don't match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(claimed ? "/api/auth/login" : "/api/auth/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(claimed ? { claim_token: token, pin } : { token, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429) setError("Too many attempts. Wait a minute and try again.");
        else if (res.status === 423 || data.error === "locked")
          setError("This account is locked. Ask the sponsor to reissue your link.");
        else if (data.error === "already_claimed")
          setError("This link was already claimed. Enter your PIN to sign in.");
        else setError("Something didn't match. Check and try again.");
        return;
      }
      // Intervention students must pick courses before their first check-in.
      router.push(!claimed && data.arm === "INTERVENTION" ? "/setup" : "/checkin");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label htmlFor="pin">{claimed ? "4-digit PIN" : "Choose a 4-digit PIN"}</label>
        <input
          id="pin"
          className="input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          pattern="\d{4}"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          required
        />
      </div>
      {!claimed && (
        <div className="field">
          <label htmlFor="pin2">Confirm PIN</label>
          <input
            id="pin2"
            className="input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            pattern="\d{4}"
            value={pinConfirm}
            onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 4))}
            required
          />
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <button className="btn" type="submit" disabled={busy}>
        {claimed ? "Sign in" : "Start"}
      </button>
    </form>
  );
}
