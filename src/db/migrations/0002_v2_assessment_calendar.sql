CREATE TYPE "public"."assess_type" AS ENUM('TEST', 'QUIZ', 'ASSIGNMENT');--> statement-breakpoint
CREATE TABLE "assessment_calendar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_name" text NOT NULL,
	"section" text,
	"assess_date" date NOT NULL,
	"assess_type" "assess_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
