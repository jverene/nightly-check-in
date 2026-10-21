import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { confirmations } from "@/db/schema";
import { requireStudent } from "@/lib/session";
import { weekdayName } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await requireStudent();
  if (!session) redirect("/login");

  const rows = await db()
    .select({
      local_date: confirmations.localDate,
      confirmation_code: confirmations.confirmationCode,
      late: confirmations.late,
    })
    .from(confirmations)
    .where(eq(confirmations.participantCode, session.slot.participantCode))
    .orderBy(desc(confirmations.localDate))
    .limit(200);

  return (
    <div className="stack">
      <div>
        <h1>Your confirmations</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          Proof of completion, newest first. Your answers are never shown here.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="muted small">No check-ins yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Code</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.local_date}>
                <td>
                  {weekdayName(r.local_date).slice(0, 3)}, {r.local_date.slice(5)}
                </td>
                <td style={{ letterSpacing: "0.06em" }}>{r.confirmation_code}</td>
                <td className="muted tiny">{r.late ? "late" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <nav className="nav-row">
        <Link href="/checkin">Tonight</Link>
        <Link href="/settings">Settings</Link>
      </nav>
    </div>
  );
}
