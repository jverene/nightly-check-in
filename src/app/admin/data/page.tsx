import { AdminNav } from "../admin-nav";
import { DeleteForm } from "./delete-form";

export const dynamic = "force-dynamic";

export default function DataPage() {
  return (
    <div className="stack">
      <div>
        <h1>Withdrawals</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          Deletes every row for a code — check-ins, supplements, plans, confirmations, test
          dates, courses, reminders, sessions — and marks consent WITHDRAWN so exports keep
          excluding it. This cannot be undone. The deletion itself is logged.
        </p>
      </div>
      <DeleteForm />
      <AdminNav />
    </div>
  );
}
