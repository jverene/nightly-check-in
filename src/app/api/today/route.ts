import { NextResponse } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { checkins, confirmations, courses, plans, weeklySupplements } from "@/db/schema";
import { requireStudent } from "@/lib/session";
import { checkinWindow, isSunday, overrideNow } from "@/lib/time";
import { completionStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** Everything the nightly form needs, computed server-side. */
export async function GET(request: Request) {
  const session = await requireStudent();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const code = session.slot.participantCode;
  const arm = session.slot.arm;

  const now = overrideNow(request.headers.get("x-test-now")) ?? new Date();
  const window = checkinWindow(now);
  const database = db();

  const courseRows = await database.select().from(courses).where(eq(courses.participantCode, code));
  // Both arms complete the same minimal course setup before checking in.
  const setupComplete = courseRows.length > 0;

  const base = {
    state: window.state,
    local_date: window.localDate,
    is_sunday: window.localDate ? isSunday(window.localDate) : false,
    arm,
    setup_complete: setupComplete,
    already_submitted: false,
    confirmation_code: null as string | null,
    stats: null as null | Awaited<ReturnType<typeof completionStats>>,
    courses: [] as { id: string; course_name: string }[],
    // Yes/No prefill from the most recent night with plan rows. Minutes are
    // never prefilled — every Yes requires a fresh tap each night.
    prefill: {} as Record<string, "yes" | "no">,
    existing: null as null | Record<string, unknown>,
  };

  if (arm === "INTERVENTION") {
    base.courses = courseRows.map((c) => ({ id: c.id, course_name: c.courseName }));
  }

  if (window.state !== "open" && window.state !== "late") {
    return NextResponse.json(base);
  }

  const localDate = window.localDate;
  const [checkinRows, confirmationRows, planRows, weeklyRows] = await Promise.all([
    database
      .select()
      .from(checkins)
      .where(and(eq(checkins.participantCode, code), eq(checkins.localDate, localDate)))
      .limit(1),
    database
      .select()
      .from(confirmations)
      .where(and(eq(confirmations.participantCode, code), eq(confirmations.localDate, localDate)))
      .limit(1),
    database
      .select()
      .from(plans)
      .where(and(eq(plans.participantCode, code), eq(plans.localDate, localDate))),
    isSunday(localDate)
      ? database
          .select()
          .from(weeklySupplements)
          .where(and(eq(weeklySupplements.participantCode, code), eq(weeklySupplements.weekStartDate, localDate)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const checkin = checkinRows[0];
  const confirmation = confirmationRows[0];
  base.already_submitted = !!confirmation;
  base.confirmation_code = confirmation?.confirmationCode ?? null;
  base.stats = await completionStats(code, session.slot.classSection, localDate);

  if (checkin) {
    const weekly = weeklyRows[0];
    base.existing = {
      stress_0_10: checkin.stress010,
      pna_stress: checkin.pnaStress,
      sleep_band: checkin.sleepBand,
      pna_sleep: checkin.pnaSleep,
      sleep_quality: checkin.sleepQuality,
      pna_quality: checkin.pnaQuality,
      workload_next_3d_0_10: checkin.workloadNext3d010,
      pna_workload: checkin.pnaWorkload,
      weekly: weekly
        ? {
            late_nights_0_7: weekly.lateNights07,
            pna_late_nights: weekly.pnaLateNights,
            challenge_0_10: weekly.challenge010,
            pna_challenge: weekly.pnaChallenge,
          }
        : null,
      plans: planRows.map((p) => ({ course_id: p.courseId, studying: p.studying, minutes: p.minutes })),
    };
  } else if (arm === "INTERVENTION" && courseRows.length > 0) {
    // Prefill Yes/No from the most recent prior night that has plan rows.
    const latest = await database
      .select({ localDate: plans.localDate })
      .from(plans)
      .where(and(eq(plans.participantCode, code), lt(plans.localDate, localDate)))
      .orderBy(desc(plans.localDate))
      .limit(1);
    if (latest[0]) {
      const priorRows = await database
        .select({ courseId: plans.courseId, studying: plans.studying })
        .from(plans)
        .where(and(eq(plans.participantCode, code), eq(plans.localDate, latest[0].localDate)));
      for (const r of priorRows) base.prefill[r.courseId] = r.studying ? "yes" : "no";
    }
  }

  return NextResponse.json(base);
}
