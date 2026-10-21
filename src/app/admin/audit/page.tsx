import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { AdminNav } from "../admin-nav";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const rows = await db()
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  return (
    <div className="stack">
      <div>
        <h1>Audit log</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          Sponsor actions, exports, deletions, rotations, and auth failures. Newest first.
        </p>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Time (UTC)</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Code</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="tiny">{r.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
              <td>{r.actorRole}</td>
              <td>{r.action}</td>
              <td className="muted">{r.participantCode ?? "—"}</td>
              <td className="tiny muted">{r.meta ? JSON.stringify(r.meta) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <AdminNav />
    </div>
  );
}
