import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { confirmations, cronRuns, pushSubscriptions, slots } from "@/db/schema";
import { consent } from "@/db/schema";
import { isSchoolNight, localParts } from "@/lib/time";
import { sendReminders } from "@/lib/push";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * 7:30pm on school nights: remind subscribed students who haven't submitted.
 * vercel.json schedules this at both plausible UTC hours; the local-time
 * guard makes exactly one of them fire (the other is a recorded no-op), so
 * reminders survive DST shifts.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parts = localParts();
  const minutes = parts.hour * 60 + parts.minute;
  const inWindow = minutes >= 19 * 60 + 25 && minutes <= 19 * 60 + 40;

  if (!isSchoolNight(parts.date) || !inWindow) {
    await db().insert(cronRuns).values({
      job: "remind",
      detail: { skipped: true, reason: !isSchoolNight(parts.date) ? "not_school_night" : "outside_local_window", local: parts },
    });
    return NextResponse.json({ ok: true, skipped: true });
  }

  const tonight = parts.date;
  const database = db();

  // Codes that already submitted tonight.
  const submitted = await database
    .select({ participantCode: confirmations.participantCode })
    .from(confirmations)
    .where(eq(confirmations.localDate, tonight));
  const submittedCodes = submitted.map((r) => r.participantCode);

  // Withdrawn codes must never be notified.
  const withdrawn = await database
    .select({ participantCode: consent.participantCode })
    .from(consent)
    .where(eq(consent.status, "WITHDRAWN"));
  const withdrawnCodes = withdrawn.map((r) => r.participantCode);

  const subs = await database
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      participantCode: pushSubscriptions.participantCode,
    })
    .from(pushSubscriptions)
    .innerJoin(
      slots,
      and(eq(slots.participantCode, pushSubscriptions.participantCode), isNotNull(slots.claimedAt)),
    );

  const targets = subs.filter(
    (s) => !submittedCodes.includes(s.participantCode) && !withdrawnCodes.includes(s.participantCode),
  );
  const result = await sendReminders(targets);

  await database.insert(cronRuns).values({
    job: "remind",
    detail: { date: tonight, targeted: targets.length, ...result },
  });

  return NextResponse.json({ ok: true, date: tonight, targeted: targets.length, ...result });
}
