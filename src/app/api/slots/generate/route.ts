import { NextResponse } from "next/server";
import { db } from "@/db";
import { consent, slots } from "@/db/schema";
import { requireStaff } from "@/lib/session";
import { generateSlotsSchema } from "@/lib/schemas";
import { generateClaimToken, generateParticipantCode } from "@/lib/codes";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Bulk-create claim slots. Codes are the only identity that ever exists. */
export async function POST(request: Request) {
  const staff = await requireStaff("SPONSOR");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`slots-generate:${staff.admin.id}`, 10, 60);
  if (!rl.ok) return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });

  const body = await request.json().catch(() => null);
  const parsed = generateSlotsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const { arm, count, class_section } = parsed.data;
  const database = db();
  const created: string[] = [];

  for (let i = 0; i < count; i++) {
    let inserted = false;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      try {
        const participantCode = generateParticipantCode();
        await database.insert(slots).values({
          participantCode,
          claimToken: generateClaimToken(),
          arm,
          classSection: class_section,
        });
        await database.insert(consent).values({ participantCode }).onConflictDoNothing();
        created.push(participantCode);
        inserted = true;
      } catch {
        // rare code collision — retry with a fresh code
      }
    }
    if (!inserted) {
      return NextResponse.json({ error: "code_generation_failed", created }, { status: 500 });
    }
  }

  await audit("SPONSOR", "slots.generate", null, { arm, count, class_section });
  return NextResponse.json({ ok: true, created });
}
