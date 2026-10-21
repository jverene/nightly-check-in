import { redirect } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { requireStudent } from "@/lib/session";
import { claimUrlFor } from "@/lib/codes";
import { PushToggle } from "./push-toggle";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireStudent();
  if (!session) redirect("/login");

  const claimUrl = claimUrlFor(session.slot.claimToken);
  const qrSvg = await QRCode.toString(claimUrl, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return (
    <div className="stack">
      <div>
        <h1>Settings</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          Sign in on another device with this QR code, or with your code and PIN.
        </p>
      </div>

      <section className="card stack" style={{ textAlign: "center", alignItems: "center" }}>
        <div
          style={{ width: 180, height: 180 }}
          dangerouslySetInnerHTML={{ __html: qrSvg }}
          aria-label={`QR code linking to your sign-in link`}
        />
        <p style={{ fontSize: 20, fontWeight: 600, letterSpacing: "0.02em" }}>
          {session.slot.participantCode}
        </p>
        <p className="muted tiny" style={{ wordBreak: "break-all" }}>
          {claimUrl}
        </p>
      </section>

      <section className="card">
        <h2>Nightly reminder</h2>
        <p className="muted small" style={{ margin: "4px 0 12px" }}>
          One notification at 7:30pm on school nights if you haven&rsquo;t checked in. On
          iPhone, first use Share → Add to Home Screen, then enable reminders here.
        </p>
        <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
      </section>

      <nav className="nav-row">
        <Link href="/checkin">Tonight</Link>
        <Link href="/history">History</Link>
      </nav>
    </div>
  );
}
