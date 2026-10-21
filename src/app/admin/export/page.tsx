import { AdminNav } from "../admin-nav";
import { ExportForm } from "./export-form";

export const dynamic = "force-dynamic";

const TABLES = ["checkins", "weekly_supplements", "plans", "test_dates", "confirmations"];

export default function ExportPage() {
  return (
    <div className="stack">
      <div>
        <h1>Export data</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          Includes only codes with consent status CONSENTED that are not excluded from the
          study — enforced in the database query itself. Every export is logged. Lead-time is
          derived offline: earliest plans.local_date per course minus test_date.
        </p>
      </div>
      <ExportForm tables={TABLES} />
      <AdminNav />
    </div>
  );
}
