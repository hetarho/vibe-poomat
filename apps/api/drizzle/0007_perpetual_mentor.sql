CREATE TABLE "feedbacks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"claim_id" uuid NOT NULL,
	"mission_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" uuid,
	"first_impression" text NOT NULL,
	"stuck_at" text NOT NULL,
	"would_pay" boolean NOT NULL,
	"would_pay_reason" text NOT NULL,
	"suggestion" text NOT NULL,
	"answers" jsonb NOT NULL,
	"state" text NOT NULL,
	"rejection_reason" text,
	"rejection_note" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedbacks_claim_id_unique" UNIQUE("claim_id")
);
--> statement-breakpoint
CREATE INDEX "feedbacks_mission_idx" ON "feedbacks" USING btree ("mission_id");--> statement-breakpoint
CREATE INDEX "feedbacks_author_idx" ON "feedbacks" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "feedbacks_project_idx" ON "feedbacks" USING btree ("project_id");