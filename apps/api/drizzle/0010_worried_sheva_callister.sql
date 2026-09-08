-- FDBK-8 counts a maker's settled reports, so the maker is denormalised onto the
-- row. Added nullable and backfilled first, because a plain NOT NULL would fail
-- against any database that already holds reports. The backfill is the one place
-- `projects` may be read from here: it is a one-time schema step, not a query the
-- feedback context runs (ARCH-14).
ALTER TABLE "feedbacks" ADD COLUMN "maker_id" uuid;--> statement-breakpoint
UPDATE "feedbacks" SET "maker_id" = "projects"."owner_id"
  FROM "projects" WHERE "projects"."id" = "feedbacks"."project_id";--> statement-breakpoint
ALTER TABLE "feedbacks" ALTER COLUMN "maker_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "feedbacks_maker_state_idx" ON "feedbacks" USING btree ("maker_id","state");
