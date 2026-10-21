import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { consent, slots } from "@/db/schema";
import { requireStaff, destroySessionsForParticipant } from "@/lib/session";
import { consentSchema } from "@/lib/schemas";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Sponsor sets consent status from the paper sheet. WITHDRAWN also kills sessions. */
export async function POST(request: Request) {
  const staff = await requireStaff("SPONSOR");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = consentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { participant_code, status } = parsed.data;

  const database = db();
  const slotRows = await database
    .select({ id: slots.id })
    .from(slots)
    .where(eq(slots.participantCode, participant_code))
    .limit(1);
  if (!slotRows[0]) return NextResponse.json({ error: "unknown_code" }, { status: 404 });

  await database
    .insert(consent)
    .values({ participantCode: participant_code, status, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: consent.participantCode,
      set: { status, updatedAt: new Date() },
    });

  if (status === "WITHDRAWN") {
    await destroySessionsForParticipant(participant_code);
  }

  await audit("SPONSOR", "consent.update", participant_code, { status });
  return NextResponse.json({ ok: true });
}
