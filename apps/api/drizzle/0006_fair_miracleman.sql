CREATE TABLE "feedback_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mission_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"state" text NOT NULL,
	"held_until" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feedback_claims_mission_idx" ON "feedback_claims" USING btree ("mission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_claims_one_live_per_user_unq" ON "feedback_claims" USING btree ("mission_id","user_id") WHERE "feedback_claims"."state" in ('held', 'submitted', 'settled');