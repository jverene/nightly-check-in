import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const armEnum = pgEnum("arm", ["INTERVENTION", "CONTROL"]);
export const consentStatusEnum = pgEnum("consent_status", [
  "CONSENTED",
  "NOT_CONSENTED",
  "WITHDRAWN",
]);
export const sleepBandEnum = pgEnum("sleep_band", ["LT5", "5_6", "6_7", "7_8", "GT8"]);
export const staffRoleEnum = pgEnum("staff_role", ["TEACHER", "SPONSOR"]);
export const actorRoleEnum = pgEnum("actor_role", ["STUDENT", "TEACHER", "SPONSOR", "SYSTEM"]);

/**
 * No student names, emails, or school IDs exist anywhere in this schema.
 * Identity mapping lives only on the sponsor's offline paper sheet.
 */

export const slots = pgTable("slots", {
  id: uuid("id").defaultRandom().primaryKey(),
  participantCode: text("participant_code").notNull().unique(),
  claimToken: text("claim_token").notNull().unique(),
  arm: armEnum("arm").notNull(),
  classSection: text("class_section").notNull(),
  pinHash: text("pin_hash"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  locked: boolean("locked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const consent = pgTable("consent", {
  participantCode: text("participant_code")
    .primaryKey()
    .references(() => slots.participantCode),
  status: consentStatusEnum("status").notNull().default("NOT_CONSENTED"),
  excludedFromStudy: boolean("excluded_from_study").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Frozen at seed time. Deliberately has no admin UI; see README. */
export const coursePresets = pgTable(
  "course_presets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    classSection: text("class_section").notNull(),
    courseName: text("course_name").notNull(),
  },
  (t) => [unique("course_presets_section_name_unique").on(t.classSection, t.courseName)],
);

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participantCode: text("participant_code")
      .notNull()
      .references(() => slots.participantCode),
    courseName: text("course_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("courses_participant_name_unique").on(t.participantCode, t.courseName)],
);

export const testDates = pgTable(
  "test_dates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participantCode: text("participant_code")
      .notNull()
      .references(() => slots.participantCode),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    testDate: date("test_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("test_dates_course_date_unique").on(t.courseId, t.testDate)],
);

export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participantCode: text("participant_code")
      .notNull()
      .references(() => slots.participantCode),
    localDate: date("local_date").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    stress010: smallint("stress_0_10"),
    sleepBand: sleepBandEnum("sleep_band"),
    sleepQuality: smallint("sleep_quality"),
    workloadNext3d010: smallint("workload_next_3d_0_10"),
    pnaStress: boolean("pna_stress").notNull().default(false),
    pnaSleep: boolean("pna_sleep").notNull().default(false),
    pnaQuality: boolean("pna_quality").notNull().default(false),
    pnaWorkload: boolean("pna_workload").notNull().default(false),
  },
  (t) => [
    unique("checkins_participant_date_unique").on(t.participantCode, t.localDate),
    check("checkins_stress_range", sql`${t.stress010} between 0 and 10`),
    check("checkins_quality_range", sql`${t.sleepQuality} between 1 and 5`),
    check("checkins_workload_range", sql`${t.workloadNext3d010} between 0 and 10`),
  ],
);

export const weeklySupplements = pgTable(
  "weekly_supplements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participantCode: text("participant_code")
      .notNull()
      .references(() => slots.participantCode),
    weekStartDate: date("week_start_date").notNull(),
    lateNights07: smallint("late_nights_0_7"),
    challenge010: smallint("challenge_0_10"),
    pnaLateNights: boolean("pna_late_nights").notNull().default(false),
    pnaChallenge: boolean("pna_challenge").notNull().default(false),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("weekly_participant_week_unique").on(t.participantCode, t.weekStartDate),
    check("weekly_late_nights_range", sql`${t.lateNights07} between 0 and 7`),
    check("weekly_challenge_range", sql`${t.challenge010} between 0 and 10`),
  ],
);

export const PLANS_MINUTES = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 999] as const;

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participantCode: text("participant_code")
      .notNull()
      .references(() => slots.participantCode),
    localDate: date("local_date").notNull(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    minutes: smallint("minutes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("plans_participant_date_course_unique").on(t.participantCode, t.localDate, t.courseId),
    check(
      "plans_minutes_allowed",
      sql`${t.minutes} in (0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 999)`,
    ),
  ],
);

export const confirmations = pgTable(
  "confirmations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    participantCode: text("participant_code")
      .notNull()
      .references(() => slots.participantCode),
    localDate: date("local_date").notNull(),
    confirmationCode: text("confirmation_code").notNull().unique(),
    late: boolean("late").notNull().default(false),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("confirmations_participant_date_unique").on(t.participantCode, t.localDate)],
);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorRole: actorRoleEnum("actor_role").notNull(),
  action: text("action").notNull(),
  participantCode: text("participant_code"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- infrastructure tables (no student response data) ----------

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: staffRoleEnum("role").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  participantCode: text("participant_code").references(() => slots.participantCode),
  adminUserId: uuid("admin_user_id").references(() => adminUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  participantCode: text("participant_code")
    .notNull()
    .references(() => slots.participantCode),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const cronRuns = pgTable("cron_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  job: text("job").notNull(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
  detail: jsonb("detail"),
});

export type Slot = typeof slots.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type Checkin = typeof checkins.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type TestDate = typeof testDates.$inferSelect;
