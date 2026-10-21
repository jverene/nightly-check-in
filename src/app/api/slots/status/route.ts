import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { consent, slots } from "@/db/schema";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Claimed vs unclaimed, by code only. Includes claim URLs so the sponsor can reprint. */
export async function GET(request: Request) {
  const staff = await requireStaff("SPONSOR");
  if (!staff) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const section = url.searchParams.get("section");

  const database = db();
  const baseQuery = database
    .select({
      participantCode: slots.participantCode,
      arm: slots.arm,
      classSection: slots.classSection,
      claimToken: slots.claimToken,
      claimedAt: slots.claimedAt,
      locked: slots.locked,
      consentStatus: consent.status,
      excludedFromStudy: consent.excludedFromStudy,
    })
    .from(slots)
    .leftJoin(consent, eq(consent.participantCode, slots.participantCode))
    .orderBy(asc(slots.classSection), asc(slots.participantCode));

  const rows = section ? await baseQuery.where(eq(slots.classSection, section)) : await baseQuery;

  return NextResponse.json({
    slots: rows.map((r) => ({
      participant_code: r.participantCode,
      arm: r.arm,
      class_section: r.classSection,
      claim_token: r.claimToken,
      claimed: !!r.claimedAt,
      claimed_at: r.claimedAt,
      locked: r.locked,
      consent_status: r.consentStatus ?? "NOT_CONSENTED",
      excluded_from_study: r.excludedFromStudy ?? false,
    })),
  });
}
