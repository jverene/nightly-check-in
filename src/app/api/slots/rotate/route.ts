import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { slots } from "@/db/schema";
import { requireStaff, destroySessionsForParticipant } from "@/lib/session";
import { rotateSchema } from "@/lib/schemas";
import { claimUrlFor, generateClaimToken } from "@/lib/codes";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Lost-credential recovery: invalidates the old claim token and every active
 * session, resets the PIN lockout, and issues a fresh claim URL to hand to
 * the student after verifying them against the paper sheet.
 */
export async function POST(request: Request) {
  const staff = await requireStaff("SPONSOR");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = rotateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const code = parsed.data.participant_code;

  const database = db();
  const newToken = generateClaimToken();
  const updated = await database
    .update(slots)
    .set({ claimToken: newToken, failedAttempts: 0, locked: false })
    .where(eq(slots.participantCode, code))
    .returning({ participantCode: slots.participantCode });
  if (!updated[0]) return NextResponse.json({ error: "unknown_code" }, { status: 404 });

  await destroySessionsForParticipant(code);
  await audit("SPONSOR", "slots.rotate", code);

  return NextResponse.json({ ok: true, participant_code: code, claim_url: claimUrlFor(newToken) });
}
