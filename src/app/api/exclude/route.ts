import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { consent, slots } from "@/db/schema";
import { requireStaff } from "@/lib/session";
import { excludeSchema } from "@/lib/schemas";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Marks research-team members excluded from the study export. */
export async function POST(request: Request) {
  const staff = await requireStaff("SPONSOR");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = excludeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const { participant_code, excluded } = parsed.data;

  const database = db();
  const slotRows = await database
    .select({ id: slots.id })
    .from(slots)
    .where(eq(slots.participantCode, participant_code))
    .limit(1);
  if (!slotRows[0]) return NextResponse.json({ error: "unknown_code" }, { status: 404 });

  await database
    .insert(consent)
    .values({ participantCode: participant_code, excludedFromStudy: excluded, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: consent.participantCode,
      set: { excludedFromStudy: excluded, updatedAt: new Date() },
    });

  await audit("SPONSOR", excluded ? "consent.exclude" : "consent.include", participant_code);
  return NextResponse.json({ ok: true });
}
