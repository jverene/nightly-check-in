import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { confirmations, slots } from "@/db/schema";
import { schoolNightsBetween, schoolWeekStart } from "./time";

export type CompletionStats = {
  week_count: number; // this student's school-night check-ins, Sun–Thu week
  week_total: number; // always 5 school nights
  term_count: number; // this student's total check-ins
  class_percent: number; // arm-wide submission rate this school week, aggregate only
};

/**
 * Retention stats shown on the success screen. Aggregate class rate only —
 * no other code's data is ever exposed.
 */
export async function completionStats(
  participantCode: string,
  classSection: string,
  tonight: string,
): Promise<CompletionStats> {
  const weekStart = schoolWeekStart(tonight);
  const database = db();

  const mine = await database
    .select({ localDate: confirmations.localDate })
    .from(confirmations)
    .where(eq(confirmations.participantCode, participantCode));

  const termCount = mine.length;
  const weekCount = mine.filter((r) => r.localDate >= weekStart && r.localDate <= tonight).length;

  const sectionCodes = (
    await database
      .select({ participantCode: slots.participantCode })
      .from(slots)
      .where(and(eq(slots.classSection, classSection), isNotNull(slots.claimedAt)))
  ).map((r) => r.participantCode);

  let classPercent = 0;
  if (sectionCodes.length > 0) {
    const weekConfirmations = await database
      .select({ localDate: confirmations.localDate, participantCode: confirmations.participantCode })
      .from(confirmations)
      .where(and(gte(confirmations.localDate, weekStart), lte(confirmations.localDate, tonight)));
    const classWeek = weekConfirmations.filter((r) => sectionCodes.includes(r.participantCode)).length;
    const nightsElapsed = schoolNightsBetween(weekStart, tonight);
    const capacity = sectionCodes.length * nightsElapsed;
    classPercent = capacity > 0 ? Math.round((classWeek / capacity) * 100) : 0;
  }

  return { week_count: weekCount, week_total: 5, term_count: termCount, class_percent: classPercent };
}
