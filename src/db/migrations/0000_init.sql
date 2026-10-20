CREATE TYPE "public"."actor_role" AS ENUM('STUDENT', 'TEACHER', 'SPONSOR', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."arm" AS ENUM('INTERVENTION', 'CONTROL');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('CONSENTED', 'NOT_CONSENTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."sleep_band" AS ENUM('LT5', '5_6', '6_7', '7_8', 'GT8');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('TEACHER', 'SPONSOR');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_role" "actor_role" NOT NULL,
	"action" text NOT NULL,
	"participant_code" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_code" text NOT NULL,
	"local_date" date NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stress_0_10" smallint,
	"sleep_band" "sleep_band",
	"sleep_quality" smallint,
	"workload_next_3d_0_10" smallint,
	"pna_stress" boolean DEFAULT false NOT NULL,
	"pna_sleep" boolean DEFAULT false NOT NULL,
	"pna_quality" boolean DEFAULT false NOT NULL,
	"pna_workload" boolean DEFAULT false NOT NULL,
	CONSTRAINT "checkins_participant_date_unique" UNIQUE("participant_code","local_date"),
	CONSTRAINT "checkins_stress_range" CHECK ("checkins"."stress_0_10" between 0 and 10),
	CONSTRAINT "checkins_quality_range" CHECK ("checkins"."sleep_quality" between 1 and 5),
	CONSTRAINT "checkins_workload_range" CHECK ("checkins"."workload_next_3d_0_10" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_code" text NOT NULL,
	"local_date" date NOT NULL,
	"confirmation_code" text NOT NULL,
	"late" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "confirmations_confirmation_code_unique" UNIQUE("confirmation_code"),
	CONSTRAINT "confirmations_participant_date_unique" UNIQUE("participant_code","local_date")
);
--> statement-breakpoint
CREATE TABLE "consent" (
	"participant_code" text PRIMARY KEY NOT NULL,
	"status" "consent_status" DEFAULT 'NOT_CONSENTED' NOT NULL,
	"excluded_from_study" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_section" text NOT NULL,
	"course_name" text NOT NULL,
	CONSTRAINT "course_presets_section_name_unique" UNIQUE("class_section","course_name")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_code" text NOT NULL,
	"course_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_participant_name_unique" UNIQUE("participant_code","course_name")
);
--> statement-breakpoint
CREATE TABLE "cron_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_code" text NOT NULL,
	"local_date" date NOT NULL,
	"course_id" uuid NOT NULL,
	"minutes" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_participant_date_course_unique" UNIQUE("participant_code","local_date","course_id"),
	CONSTRAINT "plans_minutes_allowed" CHECK ("plans"."minutes" in (0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 999))
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_code" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_code" text,
	"admin_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_code" text NOT NULL,
	"claim_token" text NOT NULL,
	"arm" "arm" NOT NULL,
	"class_section" text NOT NULL,
	"pin_hash" text,
	"claimed_at" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slots_participant_code_unique" UNIQUE("participant_code"),
	CONSTRAINT "slots_claim_token_unique" UNIQUE("claim_token")
);
--> statement-breakpoint
CREATE TABLE "test_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_code" text NOT NULL,
	"course_id" uuid NOT NULL,
	"test_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_dates_course_date_unique" UNIQUE("course_id","test_date")
);
--> statement-breakpoint
CREATE TABLE "weekly_supplements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_code" text NOT NULL,
	"week_start_date" date NOT NULL,
	"late_nights_0_7" smallint,
	"challenge_0_10" smallint,
	"pna_late_nights" boolean DEFAULT false NOT NULL,
	"pna_challenge" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_participant_week_unique" UNIQUE("participant_code","week_start_date"),
	CONSTRAINT "weekly_late_nights_range" CHECK ("weekly_supplements"."late_nights_0_7" between 0 and 7),
	CONSTRAINT "weekly_challenge_range" CHECK ("weekly_supplements"."challenge_0_10" between 0 and 10)
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_participant_code_slots_participant_code_fk" FOREIGN KEY ("participant_code") REFERENCES "public"."slots"("participant_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_participant_code_slots_participant_code_fk" FOREIGN KEY ("participant_code") REFERENCES "public"."slots"("participant_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_participant_code_slots_participant_code_fk" FOREIGN KEY ("participant_code") REFERENCES "public"."slots"("participant_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_participant_code_slots_participant_code_fk" FOREIGN KEY ("participant_code") REFERENCES "public"."slots"("participant_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_participant_code_slots_participant_code_fk" FOREIGN KEY ("participant_code") REFERENCES "public"."slots"("participant_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_participant_code_slots_participant_code_fk" FOREIGN KEY ("participant_code") REFERENCES "public"."slots"("participant_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_participant_code_slots_participant_code_fk" FOREIGN KEY ("participant_code") REFERENCES "public"."slots"("participant_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_dates" ADD CONSTRAINT "test_dates_participant_code_slots_participant_code_fk" FOREIGN KEY ("participant_code") REFERENCES "public"."slots"("participant_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_dates" ADD CONSTRAINT "test_dates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_supplements" ADD CONSTRAINT "weekly_supplements_participant_code_slots_participant_code_fk" FOREIGN KEY ("participant_code") REFERENCES "public"."slots"("participant_code") ON DELETE no action ON UPDATE no action;