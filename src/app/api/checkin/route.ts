import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { checkins, confirmations, courses, plans, weeklySupplements } from "@/db/schema";
import { requireStudent } from "@/lib/session";
import { checkinSchema } from "@/lib/schemas";
import { checkinWindow, isSunday, overrideNow } from "@/lib/time";
import { generateConfirmationCode } from "@/lib/codes";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Nightly submission. Strictly validated, upserted per (participant, date).
 * Re-submits before the cutoff update the same rows and keep the original
 * confirmation code; first submissions after midnight land on the prior
 * school night flagged late.
 */
export async function POST(request: Request) {
  const session = await requireStudent();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const code = session.slot.participantCode;

  const rl = await rateLimit(`checkin:${code}`, 30, 60);
  if (!rl.ok) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = checkinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", detail: parsed.error.issues }, { status: 400 });
  }
  const payload = parsed.data;

  const now = overrideNow(request.headers.get("x-test-now")) ?? new Date();
  const window = checkinWindow(now);
  if (window.state === "closed" || window.state === "before") {
    return NextResponse.json({ error: "closed" }, { status: 403 });
  }
  if (payload.local_date !== window.localDate) {
    return NextResponse.json(
      { error: "stale_date", current_date: window.localDate },
      { status: 409 },
    );
  }

  const arm = session.slot.arm;
  if (payload.plans && arm !== "INTERVENTION") {
    return NextResponse.json({ error: "plans_not_allowed" }, { status: 400 });
  }
  if (payload.weekly && !isSunday(window.localDate)) {
    return NextResponse.json({ error: "weekly_not_today" }, { status: 400 });
  }

  const database = db();
  const courseRows = await database.select().from(courses).where(eq(courses.participantCode, code));
  if (arm === "INTERVENTION" && courseRows.length === 0) {
    return NextResponse.json({ error: "setup_required" }, { status: 400 });
  }
  if (payload.plans && payload.plans.length > 0) {
    const ownIds = new Set(courseRows.map((c) => c.id));
    if (!payload.plans.every((p) => ownIds.has(p.course_id))) {
      return NextResponse.json({ error: "unknown_course" }, { status: 400 });
    }
  }

  const localDate = window.localDate;
  const late = window.state === "late";

  // Upsert the wellbeing core.
  const wellbeing = {
    stress010: payload.stress_0_10,
    sleepBand: payload.sleep_band,
    sleepQuality: payload.sleep_quality,
    workloadNext3d010: payload.workload_next_3d_0_10,
    pnaStress: payload.pna_stress,
    pnaSleep: payload.pna_sleep,
    pnaQuality: payload.pna_quality,
    pnaWorkload: payload.pna_workload,
  };
  await database
    .insert(checkins)
    .values({ participantCode: code, localDate, ...wellbeing })
    .onConflictDoUpdate({
      target: [checkins.participantCode, checkins.localDate],
      set: { ...wellbeing, submittedAt: new Date() },
    });

  // Sunday supplement, one row per week.
  if (payload.weekly) {
    const weekly = {
      lateNights07: payload.weekly.late_nights_0_7,
      challenge010: payload.weekly.challenge_0_10,
      pnaLateNights: payload.weekly.pna_late_nights,
      pnaChallenge: payload.weekly.pna_challenge,
    };
    await database
      .insert(weeklySupplements)
      .values({ participantCode: code, weekStartDate: localDate, ...weekly })
      .onConflictDoUpdate({
        target: [weeklySupplements.participantCode, weeklySupplements.weekStartDate],
        set: { ...weekly, submittedAt: new Date() },
      });
  }

  // Plans are replace-all for the night; absent rows stay absent (unanswered).
  if (arm === "INTERVENTION") {
    await database
      .delete(plans)
      .where(and(eq(plans.participantCode, code), eq(plans.localDate, localDate)));
    if (payload.plans && payload.plans.length > 0) {
      await database.insert(plans).values(
        payload.plans.map((p) => ({
          participantCode: code,
          localDate,
          courseId: p.course_id,
          minutes: p.minutes,
        })),
      );
    }
  }

  // Confirmation: stable code per (participant, date); late flag set at first submit.
  let confirmationCode: string | null = null;
  for (let attempt = 0; attempt < 3 && !confirmationCode; attempt++) {
    const candidate = generateConfirmationCode();
    const inserted = await database
      .insert(confirmations)
      .values({ participantCode: code, localDate, confirmationCode: candidate, late })
      .onConflictDoNothing({ target: [confirmations.participantCode, confirmations.localDate] })
      .returning({ confirmationCode: confirmations.confirmationCode });
    if (inserted[0]) {
      confirmationCode = inserted[0].confirmationCode;
    } else {
      const existing = await database
        .update(confirmations)
        .set({ submittedAt: new Date() })
        .where(and(eq(confirmations.participantCode, code), eq(confirmations.localDate, localDate)))
        .returning({ confirmationCode: confirmations.confirmationCode });
      confirmationCode = existing[0]?.confirmationCode ?? null;
    }
  }
  if (!confirmationCode) {
    return NextResponse.json({ error: "confirmation_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, confirmation_code: confirmationCode, local_date: localDate, late });
}
