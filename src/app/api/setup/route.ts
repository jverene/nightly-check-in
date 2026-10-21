import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { coursePresets, courses, plans, testDates } from "@/db/schema";
import { requireStudent } from "@/lib/session";
import { setupSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireStudent();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const code = session.slot.participantCode;

  const database = db();
  const [presetRows, courseRows, testRows] = await Promise.all([
    database
      .select({ courseName: coursePresets.courseName })
      .from(coursePresets)
      .where(eq(coursePresets.classSection, session.slot.classSection)),
    database.select().from(courses).where(eq(courses.participantCode, code)),
    database.select().from(testDates).where(eq(testDates.participantCode, code)),
  ]);

  const courseNameById = new Map(courseRows.map((c) => [c.id, c.courseName]));
  return NextResponse.json({
    arm: session.slot.arm,
    class_section: session.slot.classSection,
    presets: presetRows.map((p) => p.courseName),
    courses: courseRows.map((c) => ({ id: c.id, course_name: c.courseName })),
    test_dates: testRows.map((t) => ({
      id: t.id,
      course_name: courseNameById.get(t.courseId) ?? null,
      test_date: t.testDate,
    })),
  });
}

/**
 * Saves the course list and test calendar. Courses are matched against the
 * frozen preset list — free text is impossible here. A removed course is only
 * deleted when no plans reference it, so longitudinal history is never lost
 * through an edit; otherwise the row stays enrolled.
 */
export async function POST(request: Request) {
  const session = await requireStudent();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const code = session.slot.participantCode;

  const body = await request.json().catch(() => null);
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const wantedCourses = [...new Set(parsed.data.courses.map((c) => c.trim()))];
  if (session.slot.arm === "INTERVENTION" && wantedCourses.length === 0) {
    return NextResponse.json({ error: "courses_required" }, { status: 400 });
  }

  const database = db();
  const presetRows = await database
    .select({ courseName: coursePresets.courseName })
    .from(coursePresets)
    .where(eq(coursePresets.classSection, session.slot.classSection));
  const presetSet = new Set(presetRows.map((p) => p.courseName));

  for (const name of wantedCourses) {
    if (!presetSet.has(name)) {
      return NextResponse.json({ error: "course_not_in_preset_list" }, { status: 400 });
    }
  }
  for (const td of parsed.data.test_dates) {
    if (!wantedCourses.includes(td.course_name)) {
      return NextResponse.json({ error: "test_date_for_unknown_course" }, { status: 400 });
    }
  }

  const existing = await database.select().from(courses).where(eq(courses.participantCode, code));
  const wantedSet = new Set(wantedCourses);

  // Insert newly selected courses.
  const toAdd = wantedCourses.filter((n) => !existing.some((c) => c.courseName === n));
  if (toAdd.length > 0) {
    await database.insert(courses).values(toAdd.map((courseName) => ({ participantCode: code, courseName })));
  }

  // Remove deselected courses that carry no plan history.
  const toRemove = existing.filter((c) => !wantedSet.has(c.courseName));
  if (toRemove.length > 0) {
    const removeIds = toRemove.map((c) => c.id);
    const referenced = await database
      .select({ courseId: plans.courseId })
      .from(plans)
      .where(and(eq(plans.participantCode, code), inArray(plans.courseId, removeIds)));
    const referencedIds = new Set(referenced.map((r) => r.courseId));
    const deletable = removeIds.filter((id) => !referencedIds.has(id));
    if (deletable.length > 0) {
      await database.delete(testDates).where(inArray(testDates.courseId, deletable));
      await database
        .delete(courses)
        .where(and(eq(courses.participantCode, code), inArray(courses.id, deletable)));
    }
  }

  // Replace the test calendar wholesale (schedule data, not response data).
  await database.delete(testDates).where(eq(testDates.participantCode, code));
  if (parsed.data.test_dates.length > 0) {
    const current = await database.select().from(courses).where(eq(courses.participantCode, code));
    const idByName = new Map(current.map((c) => [c.courseName, c.id]));
    const rows = parsed.data.test_dates
      .map((td) => ({
        participantCode: code,
        courseId: idByName.get(td.course_name)!,
        testDate: td.test_date,
      }))
      .filter((r) => r.courseId);
    if (rows.length > 0) await database.insert(testDates).values(rows);
  }

  return NextResponse.json({ ok: true });
}
