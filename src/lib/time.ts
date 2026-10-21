/**
 * All check-in date logic lives here. The DB stores UTC timestamps; every
 * "today", window, and countdown decision is computed in APP_TIMEZONE.
 */

export const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Toronto";

const SCHOOL_NIGHTS = new Set(
  (process.env.SCHOOL_NIGHTS ?? "0,1,2,3,4")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
);

export type LocalParts = { date: string; weekday: number; hour: number; minute: number };

/** YYYY-MM-DD / weekday / wall-clock time of `now` in the study timezone. */
export function localParts(now: Date = new Date()): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? 0 : Number(get("hour"));
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
    hour,
    minute: Number(get("minute")),
  };
}

export function todayLocal(now: Date = new Date()): string {
  return localParts(now).date;
}

function toUtcMs(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(dateStr: string, n: number): string {
  return new Date(toUtcMs(dateStr) + n * 86_400_000).toISOString().slice(0, 10);
}

/** a minus b, in whole days. */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtcMs(a) - toUtcMs(b)) / 86_400_000);
}

export function weekdayOf(dateStr: string): number {
  return new Date(toUtcMs(dateStr)).getUTCDay();
}

export function isSchoolNight(dateStr: string): boolean {
  return SCHOOL_NIGHTS.has(weekdayOf(dateStr));
}

export function isSunday(dateStr: string): boolean {
  return weekdayOf(dateStr) === 0;
}

/** Monday of the ISO week containing dateStr (roster weeks run Mon–Sun). */
export function weekStartMonday(dateStr: string): string {
  const wd = weekdayOf(dateStr);
  return addDays(dateStr, wd === 0 ? -6 : 1 - wd);
}

/**
 * The school week runs Sunday–Thursday (the five school nights). The "This
 * week" counter resets each Sunday night, so its start is the most recent
 * Sunday on or before dateStr.
 */
export function schoolWeekStart(dateStr: string): string {
  return addDays(dateStr, -weekdayOf(dateStr));
}

/** Most recent school night strictly before dateStr. */
export function prevSchoolNight(dateStr: string): string {
  let d = addDays(dateStr, -1);
  while (!isSchoolNight(d)) d = addDays(d, -1);
  return d;
}

/** Number of school nights in [from, to] inclusive. */
export function schoolNightsBetween(from: string, to: string): number {
  if (from > to) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isSchoolNight(d)) n++;
  }
  return n;
}

/** Configured reminder slots ("19:30,21:30") as "HH:MM" strings. */
export function reminderSlots(): string[] {
  return (process.env.REMINDER_SLOTS || "19:30")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{2}:\d{2}$/.test(s));
}

const OPEN_MINUTES = 16 * 60; // 4:00pm
const LATE_CUTOFF_MINUTES = 3 * 60; // 3:00am next day

export type WindowState =
  | { state: "open"; localDate: string }
  | { state: "late"; localDate: string } // after midnight, before 3am: attributed to last night, flagged late
  | { state: "before"; localDate: string } // school night coming, opens at 4pm
  | { state: "closed"; localDate: null };

export function checkinWindow(now: Date = new Date()): WindowState {
  const p = localParts(now);
  const mins = p.hour * 60 + p.minute;
  if (mins >= OPEN_MINUTES && isSchoolNight(p.date)) {
    return { state: "open", localDate: p.date };
  }
  if (mins < LATE_CUTOFF_MINUTES) {
    const yesterday = addDays(p.date, -1);
    if (isSchoolNight(yesterday)) return { state: "late", localDate: yesterday };
  }
  if (isSchoolNight(p.date)) return { state: "before", localDate: p.date };
  return { state: "closed", localDate: null };
}

/** "today" / "tomorrow" / "N days" for the planning header. */
export function daysUntilLabel(testDate: string, tonight: string): string {
  const n = diffDays(testDate, tonight);
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  return `${n} days`;
}

export function weekdayName(dateStr: string): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
    weekdayOf(dateStr)
  ];
}

export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const ms = toUtcMs(s);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === s;
}

/** Header date shown in the app shell, e.g. "Tue, Oct 21". */
export function headerDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);
}

/**
 * Converts a wall-clock time in APP_TIMEZONE ("2026-10-20", "20:00") to the
 * corresponding UTC instant. Iterates because the UTC offset is initially
 * unknown; converges in at most two steps outside DST transition minutes.
 */
export function wallTimeToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const target = Date.UTC(y, m - 1, d, hh, mm);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(new Date(guess));
    const [py, pm, pd] = p.date.split("-").map(Number);
    const current = Date.UTC(py, pm - 1, pd, p.hour, p.minute);
    const diff = target - current;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/**
 * Testing seam. When CHECKIN_WINDOW_OVERRIDE=true (never in production),
 * API routes accept an x-test-now header so the window and Sunday behavior
 * can be exercised out of hours. Accepts either an ISO instant or a
 * "YYYY-MM-DDTHH:MM" wall time in APP_TIMEZONE. Returns null when disabled.
 */
export function overrideNow(header: string | null): Date | null {
  if (process.env.CHECKIN_WINDOW_OVERRIDE !== "true" || !header) return null;
  const wall = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(header);
  if (wall) return wallTimeToUtc(wall[1], wall[2]);
  const d = new Date(header);
  return Number.isNaN(d.getTime()) ? null : d;
}
