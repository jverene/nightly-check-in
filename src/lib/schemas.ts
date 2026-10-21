import { z } from "zod";
import { isValidDateStr } from "./time";
import { PLANS_MINUTES } from "@/db/schema";

/**
 * Every request body in the app is validated with a .strict() schema:
 * unexpected fields — including any attempt at free text — are rejected.
 */

const dateStr = z.string().refine(isValidDateStr, "expected YYYY-MM-DD");
const pin = z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits");
const participantCode = z.string().regex(/^[a-z]+-[a-z]+-\d{2}$/, "invalid code format");

export const claimSchema = z
  .object({
    token: z.string().min(20).max(200),
    pin,
  })
  .strict();

export const loginSchema = z
  .object({
    participant_code: participantCode.optional(),
    claim_token: z.string().min(20).max(200).optional(),
    pin,
  })
  .strict()
  .refine((v) => (v.participant_code ? !v.claim_token : !!v.claim_token), {
    message: "provide exactly one of participant_code or claim_token",
  });

export const staffLoginSchema = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(8).max(200),
  })
  .strict();

export const setupSchema = z
  .object({
    courses: z.array(z.string().min(1).max(80)).max(8),
  })
  .strict();

/** For each item: exactly one of (value set) or (pna flag true). */
function answeredOrPna(value: unknown, pna: boolean, path: (string | number)[], ctx: z.RefinementCtx) {
  if (pna && value !== null) {
    ctx.addIssue({ code: "custom", path, message: "pna items must have null value" });
  }
  if (!pna && value === null) {
    ctx.addIssue({ code: "custom", path, message: "answer the item or mark prefer-not-to-answer" });
  }
}

const minutesEnum = z
  .number()
  .int()
  .refine((n): n is (typeof PLANS_MINUTES)[number] => (PLANS_MINUTES as readonly number[]).includes(n), {
    message: "invalid minutes value",
  });

const planRow = z
  .object({
    course_id: z.string().uuid(),
    studying: z.boolean(),
    minutes: minutesEnum.nullable(),
  })
  .strict()
  .superRefine((p, ctx) => {
    // Yes must carry a fresh minutes tap; No must carry none.
    if (p.studying && p.minutes === null) {
      ctx.addIssue({ code: "custom", path: ["minutes"], message: "yes requires minutes" });
    }
    if (!p.studying && p.minutes !== null) {
      ctx.addIssue({ code: "custom", path: ["minutes"], message: "no cannot carry minutes" });
    }
  });

export const checkinSchema = z
  .object({
    local_date: dateStr,
    stress_0_10: z.number().int().min(0).max(10).nullable(),
    pna_stress: z.boolean(),
    sleep_band: z.enum(["LT5", "5_6", "6_7", "7_8", "GT8"]).nullable(),
    pna_sleep: z.boolean(),
    sleep_quality: z.number().int().min(1).max(5).nullable(),
    pna_quality: z.boolean(),
    workload_next_3d_0_10: z.number().int().min(0).max(10).nullable(),
    pna_workload: z.boolean(),
    completion_seconds: z.number().int(),
    weekly: z
      .object({
        late_nights_0_7: z.number().int().min(0).max(7).nullable(),
        pna_late_nights: z.boolean(),
        challenge_0_10: z.number().int().min(0).max(10).nullable(),
        pna_challenge: z.boolean(),
      })
      .strict()
      .optional(),
    plans: z.array(planRow).max(8).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    answeredOrPna(v.stress_0_10, v.pna_stress, ["stress_0_10"], ctx);
    answeredOrPna(v.sleep_band, v.pna_sleep, ["sleep_band"], ctx);
    answeredOrPna(v.sleep_quality, v.pna_quality, ["sleep_quality"], ctx);
    answeredOrPna(v.workload_next_3d_0_10, v.pna_workload, ["workload_next_3d_0_10"], ctx);
    if (v.weekly) {
      answeredOrPna(v.weekly.late_nights_0_7, v.weekly.pna_late_nights, ["weekly", "late_nights_0_7"], ctx);
      answeredOrPna(v.weekly.challenge_0_10, v.weekly.pna_challenge, ["weekly", "challenge_0_10"], ctx);
    }
    if (v.plans) {
      const ids = v.plans.map((p) => p.course_id);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: "custom", path: ["plans"], message: "duplicate course in plans" });
      }
    }
  });

export const generateSlotsSchema = z
  .object({
    arm: z.enum(["INTERVENTION", "CONTROL"]),
    count: z.number().int().min(1).max(100),
    class_section: z.string().min(1).max(80),
  })
  .strict();

export const consentSchema = z
  .object({
    participant_code: participantCode,
    status: z.enum(["CONSENTED", "NOT_CONSENTED", "WITHDRAWN"]),
  })
  .strict();

export const excludeSchema = z
  .object({
    participant_code: participantCode,
    excluded: z.boolean(),
  })
  .strict();

export const rotateSchema = z.object({ participant_code: participantCode }).strict();

export const deleteDataSchema = z
  .object({
    confirm: z.string().min(1).max(80),
  })
  .strict();

export const pushSubscribeSchema = z
  .object({
    endpoint: z.string().url().max(2000),
    keys: z
      .object({
        p256dh: z.string().min(1).max(500),
        auth: z.string().min(1).max(500),
      })
      .strict(),
  })
  .strict();

export const pushUnsubscribeSchema = z
  .object({
    endpoint: z.string().url().max(2000),
  })
  .strict();

export const calendarEntrySchema = z
  .object({
    course_name: z.string().min(1).max(80),
    section: z.string().min(1).max(80).nullable(),
    assess_date: dateStr,
    assess_type: z.enum(["TEST", "QUIZ", "ASSIGNMENT"]),
  })
  .strict();

export const calendarUpdateSchema = calendarEntrySchema.extend({ id: z.string().uuid() }).strict();

export const calendarDeleteSchema = z.object({ id: z.string().uuid() }).strict();

export const calendarImportSchema = z
  .object({
    csv_text: z.string().min(1).max(200_000),
  })
  .strict();

export type CheckinPayload = z.infer<typeof checkinSchema>;
