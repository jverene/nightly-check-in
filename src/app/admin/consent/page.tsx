import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { consent, slots } from "@/db/schema";
import { AdminNav } from "../admin-nav";
import { ConsentForm } from "./consent-form";

export const dynamic = "force-dynamic";

export default async function ConsentPage() {
  const rows = await db()
    .select({
      participantCode: slots.participantCode,
      classSection: slots.classSection,
      claimedAt: slots.claimedAt,
      status: consent.status,
      excluded: consent.excludedFromStudy,
    })
    .from(slots)
    .leftJoin(consent, eq(consent.participantCode, slots.participantCode))
    .orderBy(asc(slots.classSection), asc(slots.participantCode));

  return (
    <div className="stack">
      <div>
        <h1>Consent & exclusions</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          Set from your paper sheet. Only CONSENTED, non-excluded codes appear in exports.
          WITHDRAWN signs the student out; use Withdrawals to delete their data.
        </p>
      </div>

      <ConsentForm />

      <table className="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Section</th>
            <th>Consent</th>
            <th>Excluded</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.participantCode}>
              <td>{r.participantCode}</td>
              <td className="muted">{r.classSection}</td>
              <td>{r.status ?? "NOT_CONSENTED"}</td>
              <td>{r.excluded ? "yes" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <AdminNav />
    </div>
  );
}
