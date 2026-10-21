import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { consent, slots } from "@/db/schema";
import { AdminNav } from "../admin-nav";
import { SlotsManager } from "./slots-manager";

export const dynamic = "force-dynamic";

export default async function SlotsPage() {
  const database = db();
  const rows = await database
    .select({
      participantCode: slots.participantCode,
      arm: slots.arm,
      classSection: slots.classSection,
      claimedAt: slots.claimedAt,
      locked: slots.locked,
      consentStatus: consent.status,
    })
    .from(slots)
    .leftJoin(consent, eq(consent.participantCode, slots.participantCode))
    .orderBy(asc(slots.classSection), asc(slots.participantCode));

  const sections = [...new Set(rows.map((r) => r.classSection))];

  return (
    <div className="stack">
      <div>
        <h1>Claim slots</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          Generate strips, print them, and track onboarding. Codes only — names live on your
          paper sheet.
        </p>
      </div>
      <SlotsManager
        sections={sections}
        slots={rows.map((r) => ({
          participant_code: r.participantCode,
          arm: r.arm,
          class_section: r.classSection,
          claimed: !!r.claimedAt,
          locked: r.locked,
          consent_status: r.consentStatus ?? "NOT_CONSENTED",
        }))}
      />
      <AdminNav />
    </div>
  );
}
