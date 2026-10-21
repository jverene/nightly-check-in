import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { slots } from "@/db/schema";
import { loginSchema } from "@/lib/schemas";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { createStudentSession } from "@/lib/session";
import { pepper } from "@/lib/codes";
import { audit } from "@/lib/audit";

const MAX_FAILURES = 10;

/** Student login by short code + PIN, or by claim URL token + PIN. */
export async function POST(request: Request) {
  const rl = await rateLimit(`login:${clientIp(request)}`, 5, 60);
  if (!rl.ok) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { participant_code, claim_token, pin } = parsed.data;

  const rows = await db()
    .select()
    .from(slots)
    .where(participant_code ? eq(slots.participantCode, participant_code) : eq(slots.claimToken, claim_token!))
    .limit(1);
  const slot = rows[0];

  if (!slot || !slot.claimedAt || !slot.pinHash) {
    await audit("STUDENT", "auth.failure", participant_code ?? null, { reason: "unknown_code" });
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  if (slot.locked) {
    return NextResponse.json({ error: "locked" }, { status: 423 });
  }

  // Per-code attempt limit, independent of IP.
  const codeRl = await rateLimit(`login-code:${slot.participantCode}`, 10, 60);
  if (!codeRl.ok) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const ok = await bcrypt.compare(`${pin}:${pepper()}`, slot.pinHash);
  if (!ok) {
    const failures = slot.failedAttempts + 1;
    await db()
      .update(slots)
      .set({ failedAttempts: failures, locked: failures >= MAX_FAILURES })
      .where(eq(slots.id, slot.id));
    await audit("STUDENT", "auth.failure", slot.participantCode, {
      reason: "bad_pin",
      locked: failures >= MAX_FAILURES,
    });
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  await db().update(slots).set({ failedAttempts: 0 }).where(eq(slots.id, slot.id));
  await createStudentSession(slot.participantCode);
  return NextResponse.json({ ok: true, arm: slot.arm });
}
