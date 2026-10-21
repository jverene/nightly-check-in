import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessmentCalendar } from "@/db/schema";
import { requireStaff } from "@/lib/session";
import { calendarDeleteSchema, calendarEntrySchema, calendarUpdateSchema } from "@/lib/schemas";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Sponsor-side assessment calendar. Analysis-only data: never joined to
 * student rows anywhere in the app.
 */
export async function GET() {
  const staff = await requireStaff("SPONSOR");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db()
    .select()
    .from(assessmentCalendar)
    .orderBy(asc(assessmentCalendar.assessDate), asc(assessmentCalendar.courseName));

  return NextResponse.json({
    calendar: rows.map((r) => ({
      id: r.id,
      course_name: r.courseName,
      section: r.section,
      assess_date: r.assessDate,
      assess_type: r.assessType,
    })),
  });
}

export async function POST(request: Request) {
  const staff = await requireStaff("SPONSOR");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = calendarEntrySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const inserted = await db()
    .insert(assessmentCalendar)
    .values({
      courseName: parsed.data.course_name,
      section: parsed.data.section,
      assessDate: parsed.data.assess_date,
      assessType: parsed.data.assess_type,
    })
    .returning({ id: assessmentCalendar.id });

  await audit("SPONSOR", "calendar.create", null, parsed.data);
  return NextResponse.json({ ok: true, id: inserted[0].id });
}

export async function PATCH(request: Request) {
  const staff = await requireStaff("SPONSOR");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = calendarUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const updated = await db()
    .update(assessmentCalendar)
    .set({
      courseName: parsed.data.course_name,
      section: parsed.data.section,
      assessDate: parsed.data.assess_date,
      assessType: parsed.data.assess_type,
    })
    .where(eq(assessmentCalendar.id, parsed.data.id))
    .returning({ id: assessmentCalendar.id });
  if (!updated[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await audit("SPONSOR", "calendar.update", null, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const staff = await requireStaff("SPONSOR");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = calendarDeleteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  await db().delete(assessmentCalendar).where(eq(assessmentCalendar.id, parsed.data.id));
  await audit("SPONSOR", "calendar.delete", null, { id: parsed.data.id });
  return NextResponse.json({ ok: true });
}
