import { NextResponse } from "next/server";
import { db } from "@/db";
import { assessmentCalendar } from "@/db/schema";
import { requireStaff } from "@/lib/session";
import { calendarEntrySchema, calendarImportSchema } from "@/lib/schemas";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * CSV import for the assessment calendar. One row per line:
 *   course_name, section, YYYY-MM-DD, TEST|QUIZ|ASSIGNMENT
 * A header line containing "course" is skipped. Empty section → null.
 * Valid rows import; invalid lines are reported and skipped.
 */
export async function POST(request: Request) {
  const staff = await requireStaff("SPONSOR");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = calendarImportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const lines = parsed.data.csv_text.split(/\r?\n/);
  const errors: { line: number; message: string }[] = [];
  const rows: {
    courseName: string;
    section: string | null;
    assessDate: string;
    assessType: "TEST" | "QUIZ" | "ASSIGNMENT";
  }[] = [];

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (i === 0 && /course/i.test(line)) return; // header
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 3 || parts.length > 4) {
      errors.push({ line: i + 1, message: "expected: course, section, date, type" });
      return;
    }
    const [courseName, section, date, type] = parts;
    const entry = calendarEntrySchema.safeParse({
      course_name: courseName,
      section: section || null,
      assess_date: date,
      assess_type: (type || "").toUpperCase(),
    });
    if (!entry.success) {
      errors.push({ line: i + 1, message: entry.error.issues[0]?.message ?? "invalid row" });
      return;
    }
    rows.push({
      courseName: entry.data.course_name,
      section: entry.data.section,
      assessDate: entry.data.assess_date,
      assessType: entry.data.assess_type,
    });
  });

  if (rows.length > 0) {
    await db().insert(assessmentCalendar).values(rows);
  }
  await audit("SPONSOR", "calendar.import", null, { imported: rows.length, errors: errors.length });

  return NextResponse.json({ ok: true, imported: rows.length, errors });
}
