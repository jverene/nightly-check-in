"use client";

import { useEffect, useState } from "react";

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type State = "loading" | "unsupported" | "off" | "on" | "denied";

export function PushToggle({ vapidKey }: { vapidKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function detect() {
      if (
        !vapidKey ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState(sub ? "on" : "off");
    }
    detect();
  }, [vapidKey]);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapidKey!) as BufferSource,
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } }),
      });
      if (res.ok) setState("on");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <p className="skeleton small">Checking support</p>;
  if (state === "unsupported")
    return (
      <p className="muted small">
        Reminders aren&rsquo;t available in this browser. Your teacher gives an end-of-class
        reminder anyway, so you won&rsquo;t miss anything.
      </p>
    );
  if (state === "denied")
    return (
      <p className="muted small">
        Notifications are blocked for this site. You can re-enable them in your browser
        settings.
      </p>
    );
  if (state === "on")
    return (
      <div className="row-between">
        <p className="small">
          <span className="check-mark">✓</span>Reminders on for this device
        </p>
        <button className="btn-link" onClick={disable} disabled={busy}>
          Turn off
        </button>
      </div>
    );
  return (
    <button className="btn btn-secondary" onClick={enable} disabled={busy}>
      Enable reminders
    </button>
  );
}
