import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  checkins,
  confirmations,
  consent,
  courses,
  plans,
  pushSubscriptions,
  sessions,
  weeklySupplements,
} from "@/db/schema";
import { requireStaff } from "@/lib/session";
import { deleteDataSchema } from "@/lib/schemas";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const CODE_RE = /^[a-z]+-[a-z]+-\d{2}$/;

/**
 * Withdrawal: real deletion across every table that can hold a participant's
 * data. The consent row stays (marked WITHDRAWN) so the export filter keeps
 * excluding the code, and the audit trail keeps the deletion event itself.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const staff = await requireStaff("SPONSOR");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { code } = await params;
  if (!CODE_RE.test(code)) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = deleteDataSchema.safeParse(body);
  if (!parsed.success || parsed.data.confirm !== code) {
    return NextResponse.json({ error: "confirmation_mismatch" }, { status: 400 });
  }

  const database = db();
  const counts: Record<string, number> = {};
  counts.checkins = (await database.delete(checkins).where(eq(checkins.participantCode, code)).returning({ id: checkins.id })).length;
  counts.weekly_supplements = (await database.delete(weeklySupplements).where(eq(weeklySupplements.participantCode, code)).returning({ id: weeklySupplements.id })).length;
  counts.plans = (await database.delete(plans).where(eq(plans.participantCode, code)).returning({ id: plans.id })).length;
  counts.confirmations = (await database.delete(confirmations).where(eq(confirmations.participantCode, code)).returning({ id: confirmations.id })).length;
  counts.courses = (await database.delete(courses).where(eq(courses.participantCode, code)).returning({ id: courses.id })).length;
  counts.push_subscriptions = (await database.delete(pushSubscriptions).where(eq(pushSubscriptions.participantCode, code)).returning({ id: pushSubscriptions.id })).length;
  counts.sessions = (await database.delete(sessions).where(eq(sessions.participantCode, code)).returning({ id: sessions.id })).length;

  await database
    .insert(consent)
    .values({ participantCode: code, status: "WITHDRAWN", updatedAt: new Date() })
    .onConflictDoUpdate({
      target: consent.participantCode,
      set: { status: "WITHDRAWN", updatedAt: new Date() },
    });

  await audit("SPONSOR", "data.delete", code, { deleted: counts });
  return NextResponse.json({ ok: true, deleted: counts });
}
