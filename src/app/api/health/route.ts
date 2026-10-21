import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cronRuns } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Liveness + proof the reminder pipeline is running. No sensitive data. */
export async function GET() {
  let dbOk = false;
  try {
    await db().execute(sql`select 1`);
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const lastRuns: Record<string, string | null> = { remind: null, verify: null };
  if (dbOk) {
    for (const job of ["remind", "verify"]) {
      const rows = await db()
        .select({ ranAt: cronRuns.ranAt })
        .from(cronRuns)
        .where(eq(cronRuns.job, job))
        .orderBy(desc(cronRuns.ranAt))
        .limit(1);
      lastRuns[job] = rows[0]?.ranAt.toISOString() ?? null;
    }
  }

  return NextResponse.json(
    { ok: dbOk, db: dbOk ? "up" : "down", last_cron_runs: lastRuns, time: new Date().toISOString() },
    { status: dbOk ? 200 : 503 },
  );
}
