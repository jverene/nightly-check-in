ALTER TABLE "test_dates" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "test_dates" CASCADE;--> statement-breakpoint
ALTER TABLE "plans" DROP CONSTRAINT "plans_minutes_allowed";--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "minutes" DROP NOT NULL;--> statement-breakpoint
-- v2 backfill: a v1 minutes=0 row ("planned no study") becomes an explicit
-- studying=false row with minutes null; any positive minutes means Yes.
ALTER TABLE "plans" ADD COLUMN "studying" boolean;--> statement-breakpoint
UPDATE "plans" SET "studying" = ("minutes" <> 0);--> statement-breakpoint
UPDATE "plans" SET "minutes" = NULL WHERE "minutes" = 0;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "studying" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "completion_seconds" integer;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "rows_changed" integer;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "flag_fast" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "checkins" ADD COLUMN "flag_flat" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_studying_minutes_pair" CHECK (("plans"."studying" and "plans"."minutes" is not null) or (not "plans"."studying" and "plans"."minutes" is null));--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_minutes_allowed" CHECK ("plans"."minutes" in (15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 999));
