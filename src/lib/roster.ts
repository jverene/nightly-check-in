import { and, asc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { confirmations, slots } from "@/db/schema";
import {
  addDays,
  isValidDateStr,
  schoolNightsBetween,
  todayLocal,
  weekStartMonday,
} from "./time";

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

export type RosterAggregateRow = {
  class_section: string;
  claimed: number;
  completions_this_week: number;
  percent: number;
};

/**
 * Class-aggregate view: one row per section, weekly completion percentage
 * only. No codes — this is the view a skeptical teacher gets shown.
 * Percentage is against claimed slots × school nights elapsed this week.
 */
export async function rosterAggregate(
  weekParam: string | null,
): Promise<{ week_start: string; week_end: string; rows: RosterAggregateRow[] }> {
  const weekStart = weekStartMonday(
    weekParam && isValidDateStr(weekParam) ? weekParam : todayLocal(),
  );
  const weekEnd = addDays(weekStart, 6);
  const tonight = todayLocal();
  const nightsElapsed = schoolNightsBetween(weekStart, weekEnd < tonight ? weekEnd : tonight);

  const database = db();
  const slotRows = await database
    .select({ participantCode: slots.participantCode, classSection: slots.classSection })
    .from(slots)
    .where(isNotNull(slots.claimedAt));

  const codes = slotRows.map((s) => s.participantCode);
  const weekRows =
    codes.length === 0
      ? []
      : await database
          .select({ participantCode: confirmations.participantCode })
          .from(confirmations)
          .where(
            and(
              inArray(confirmations.participantCode, codes),
              gte(confirmations.localDate, weekStart),
              lte(confirmations.localDate, weekEnd),
            ),
          );

  const weekCounts = new Map<string, number>();
  for (const r of weekRows) weekCounts.set(r.participantCode, (weekCounts.get(r.participantCode) ?? 0) + 1);

  const sections = new Map<string, { claimed: number; completions: number }>();
  for (const s of slotRows) {
    const agg = sections.get(s.classSection) ?? { claimed: 0, completions: 0 };
    agg.claimed++;
    agg.completions += weekCounts.get(s.participantCode) ?? 0;
    sections.set(s.classSection, agg);
  }

  return {
    week_start: weekStart,
    week_end: weekEnd,
    rows: [...sections.entries()].map(([class_section, agg]) => ({
      class_section,
      claimed: agg.claimed,
      completions_this_week: agg.completions,
      percent:
        agg.claimed > 0 && nightsElapsed > 0
          ? Math.round((agg.completions / (agg.claimed * nightsElapsed)) * 100)
          : 0,
    })),
  };
}
