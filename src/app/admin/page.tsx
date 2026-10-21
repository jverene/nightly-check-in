import Link from "next/link";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { slots } from "@/db/schema";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const database = db();
  const byArm = await database
    .select({ arm: slots.arm, total: count(), claimed: count(slots.claimedAt) })
    .from(slots)
    .groupBy(slots.arm);

  return (
    <div className="stack">
      <h1>Sponsor admin</h1>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Arm</th>
              <th>Claimed</th>
              <th>Slots</th>
            </tr>
          </thead>
          <tbody>
            {byArm.map((r) => (
              <tr key={r.arm}>
                <td>{r.arm === "INTERVENTION" ? "Intervention (AP Statistics)" : "Control (Data Management)"}</td>
                <td>{r.claimed}</td>
                <td>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card stack">
        <AdminLink href="/admin/slots" title="Claim slots" desc="Generate, print strips, check onboarding, rotate lost links" />
        <div className="divider" />
        <AdminLink href="/admin/consent" title="Consent & exclusions" desc="Set consent status and research-team exclusions by code" />
        <div className="divider" />
        <AdminLink href="/admin/export" title="Export data" desc="Consent-filtered CSV/JSON for analysis" />
        <div className="divider" />
        <AdminLink href="/admin/calendar" title="Assessment calendar" desc="Class-level test/quiz/assignment dates for analysis" />
        <div className="divider" />
        <AdminLink href="/admin/data" title="Withdrawals" desc="Delete all data for a code" />
        <div className="divider" />
        <AdminLink href="/admin/audit" title="Audit log" desc="Every sponsor action and auth failure" />
        <div className="divider" />
        <AdminLink href="/roster" title="Teacher roster" desc="The completion view teachers see" />
      </div>

      <AdminNav />
    </div>
  );
}

function AdminLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <strong style={{ fontWeight: 500 }}>{title}</strong>
      <p className="muted small">{desc}</p>
    </Link>
  );
}
