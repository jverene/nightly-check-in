import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { staffLoginSchema } from "@/lib/schemas";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { createStaffSession } from "@/lib/session";
import { pepper } from "@/lib/codes";
import { audit } from "@/lib/audit";

const MAX_FAILURES = 10;
const LOCK_MINUTES = 15;

/** Teacher / sponsor login by email + password. */
export async function POST(request: Request) {
  const rl = await rateLimit(`staff-login:${clientIp(request)}`, 5, 60);
  if (!rl.ok) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = staffLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();

  const rows = await db().select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  const user = rows[0];

  if (!user) {
    await audit("SYSTEM", "auth.failure", null, { reason: "unknown_staff_email", email });
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    return NextResponse.json({ error: "locked" }, { status: 423 });
  }

  const ok = await bcrypt.compare(`${parsed.data.password}:${pepper()}`, user.passwordHash);
  if (!ok) {
    const failures = user.failedAttempts + 1;
    await db()
      .update(adminUsers)
      .set({
        failedAttempts: failures,
        lockedUntil: failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      })
      .where(eq(adminUsers.id, user.id));
    await audit("SYSTEM", "auth.failure", null, {
      reason: "bad_staff_password",
      email,
      locked: failures >= MAX_FAILURES,
    });
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  await db().update(adminUsers).set({ failedAttempts: 0, lockedUntil: null }).where(eq(adminUsers.id, user.id));
  await createStaffSession(user.id);
  return NextResponse.json({ ok: true, role: user.role });
}
