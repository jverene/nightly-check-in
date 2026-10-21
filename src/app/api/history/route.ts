import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { confirmations } from "@/db/schema";
import { requireStudent } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Own confirmation codes only — never response content. */
export async function GET() {
  const session = await requireStudent();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db()
    .select({
      local_date: confirmations.localDate,
      confirmation_code: confirmations.confirmationCode,
      late: confirmations.late,
      submitted_at: confirmations.submittedAt,
    })
    .from(confirmations)
    .where(eq(confirmations.participantCode, session.slot.participantCode))
    .orderBy(desc(confirmations.localDate))
    .limit(200);

  return NextResponse.json({ confirmations: rows });
}
