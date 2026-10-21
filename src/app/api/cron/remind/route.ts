import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { confirmations, cronRuns, pushSubscriptions, slots } from "@/db/schema";
import { consent } from "@/db/schema";
import { isSchoolNight, localParts, reminderSlots } from "@/lib/time";
import { sendReminders } from "@/lib/push";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Reminder slots (REMINDER_SLOTS, e.g. "19:30,21:30") on school nights: ping
 * subscribed students who haven't submitted tonight. vercel.json schedules
 * this at every plausible UTC half-hour; the local-time guard makes exactly
 * one run per slot fire (the rest are recorded no-ops), so DST is handled.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parts = localParts();
  const minutes = parts.hour * 60 + parts.minute;
  const slot = reminderSlots().find((s) => {
    const [h, m] = s.split(":").map(Number);
    const slotMinutes = h * 60 + m;
    return minutes >= slotMinutes && minutes < slotMinutes + 10;
  });

  if (!isSchoolNight(parts.date) || !slot) {
    await db().insert(cronRuns).values({
      job: "remind",
      detail: {
        skipped: true,
        reason: !isSchoolNight(parts.date) ? "not_school_night" : "outside_slot",
        local: parts,
      },
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
    detail: { date: tonight, slot, targeted: targets.length, ...result },
  });

  return NextResponse.json({ ok: true, date: tonight, slot, targeted: targets.length, ...result });
}
