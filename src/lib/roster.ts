import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { confirmations, slots } from "@/db/schema";
import { addDays, isValidDateStr, todayLocal, weekStartMonday } from "./time";

export type RosterRow = {
  participant_code: string;
  arm: "INTERVENTION" | "CONTROL";
  completions_this_week: number;
  completions_total: number;
};

/**
 * The entire teacher surface: per-code completion counts. Reads the
 * confirmations table and nothing else — no response content exists here.
 */
export async function rosterData(
  section: string,
  weekParam: string | null,
): Promise<{ week_start: string; week_end: string; section: string; rows: RosterRow[] }> {
  const weekStart = weekStartMonday(
    weekParam && isValidDateStr(weekParam) ? weekParam : todayLocal(),
  );
  const weekEnd = addDays(weekStart, 6);

  const database = db();
  const slotRows = await database
    .select({
      participantCode: slots.participantCode,
      arm: slots.arm,
    })
    .from(slots)
    .where(and(eq(slots.classSection, section), isNotNull(slots.claimedAt)))
    .orderBy(asc(slots.participantCode));

  const codes = slotRows.map((s) => s.participantCode);
  const confirmationRows =
    codes.length === 0
      ? []
      : await database
          .select({
            participantCode: confirmations.participantCode,
            localDate: confirmations.localDate,
          })
          .from(confirmations)
          .where(inArray(confirmations.participantCode, codes));

  const totals = new Map<string, number>();
  const weekCounts = new Map<string, number>();
  for (const c of confirmationRows) {
    totals.set(c.participantCode, (totals.get(c.participantCode) ?? 0) + 1);
    if (c.localDate >= weekStart && c.localDate <= weekEnd) {
      weekCounts.set(c.participantCode, (weekCounts.get(c.participantCode) ?? 0) + 1);
    }
  }

  return {
    week_start: weekStart,
    week_end: weekEnd,
    section,
    rows: slotRows.map((s) => ({
      participant_code: s.participantCode,
      arm: s.arm,
      completions_this_week: weekCounts.get(s.participantCode) ?? 0,
      completions_total: totals.get(s.participantCode) ?? 0,
    })),
  };
}
