import { asc } from "drizzle-orm";
import { db } from "@/db";
import { assessmentCalendar } from "@/db/schema";
import { AdminNav } from "../admin-nav";
import { CalendarManager } from "./calendar-manager";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const rows = await db()
    .select()
    .from(assessmentCalendar)
    .orderBy(asc(assessmentCalendar.assessDate), asc(assessmentCalendar.courseName));

  return (
    <div className="stack">
      <div>
        <h1>Assessment calendar</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          Class-level test, quiz, and assignment dates from teacher-provided agendas.
          Analysis-only: students never see this, and it is never joined to student rows.
          Included in every export.
        </p>
      </div>
      <CalendarManager
        rows={rows.map((r) => ({
          id: r.id,
          course_name: r.courseName,
          section: r.section,
          assess_date: r.assessDate,
          assess_type: r.assessType,
        }))}
      />
      <AdminNav />
    </div>
  );
}
