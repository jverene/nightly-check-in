"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "student" | "staff";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("student");
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "student") {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ participant_code: code.trim().toLowerCase(), pin }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(messageFor(res.status, data.error));
          return;
        }
        router.push("/checkin");
        router.refresh();
      } else {
        const res = await fetch("/api/auth/staff-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(messageFor(res.status, data.error));
          return;
        }
        router.push(data.role === "SPONSOR" ? "/admin" : "/roster");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="segmented" role="radiogroup" aria-label="Account type">
        {(
          [
            ["student", "Student"],
            ["staff", "Teacher / Sponsor"],
          ] as const
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="mode"
              value={value}
              checked={mode === value}
              onChange={() => {
                setMode(value);
                setError(null);
              }}
            />
            <span className="seg">{label}</span>
          </label>
        ))}
      </div>

      {mode === "student" ? (
        <>
          <div className="field">
            <label htmlFor="code">Your code</label>
            <input
              id="code"
              className="input"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="calm-otter-42"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="pin">4-digit PIN</label>
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
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      <button className="btn" type="submit" disabled={busy}>
        Sign in
      </button>
    </form>
  );
}

function messageFor(status: number, code?: string): string {
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  if (status === 423 || code === "locked")
    return "This account is locked. Ask the sponsor to reissue your link.";
  return "That doesn't match our records. Check and try again.";
}
