import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cronRuns } from "@/db/schema";
import { isSchoolNight, todayLocal } from "@/lib/time";
import { sweepExpiredSessions } from "@/lib/session";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Nightly self-check: verifies the reminder job ran on school nights and
 * records the verdict so /health and the sponsor can prove the pipeline is
 * alive. Also sweeps expired sessions.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const today = todayLocal();
  const database = db();

  const lastRemind = await database
    .select()
    .from(cronRuns)
    .where(eq(cronRuns.job, "remind"))
    .orderBy(desc(cronRuns.ranAt))
    .limit(5);

  const ranToday = lastRemind.filter((r) => {
    const detail = r.detail as { date?: string; skipped?: boolean } | null;
    return detail?.date === today && !detail?.skipped;
  });

  const schoolNight = isSchoolNight(today);
  const ok = !schoolNight || ranToday.length > 0;

  await database.insert(cronRuns).values({
    job: "verify",
    detail: { date: today, school_night: schoolNight, remind_ran: ranToday.length > 0, ok },
  });

  await sweepExpiredSessions();

  return NextResponse.json({ ok, date: today, school_night: schoolNight, remind_ran: ranToday.length > 0 });
}
