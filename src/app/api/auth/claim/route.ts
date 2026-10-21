import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { consent, slots } from "@/db/schema";
import { claimSchema } from "@/lib/schemas";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { createStudentSession } from "@/lib/session";
import { pepper } from "@/lib/codes";

/** First visit to a claim URL: set the 4-digit PIN and activate the slot. */
export async function POST(request: Request) {
  const rl = await rateLimit(`claim:${clientIp(request)}`, 5, 60);
  if (!rl.ok) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const rows = await db().select().from(slots).where(eq(slots.claimToken, parsed.data.token)).limit(1);
  const slot = rows[0];
  if (!slot) {
    return NextResponse.json({ error: "invalid_link" }, { status: 404 });
  }
  if (slot.claimedAt) {
    return NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }
  if (slot.locked) {
    return NextResponse.json({ error: "locked" }, { status: 423 });
  }

  const pinHash = await bcrypt.hash(`${parsed.data.pin}:${pepper()}`, 10);
  await db()
    .update(slots)
    .set({ pinHash, claimedAt: new Date(), failedAttempts: 0 })
    .where(eq(slots.id, slot.id));

  // Consent defaults to NOT_CONSENTED until the sponsor updates it from the paper sheet.
  await db()
    .insert(consent)
    .values({ participantCode: slot.participantCode })
    .onConflictDoNothing();

  await createStudentSession(slot.participantCode);
  return NextResponse.json({ ok: true, arm: slot.arm });
}
