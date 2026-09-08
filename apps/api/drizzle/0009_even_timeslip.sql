CREATE TABLE "feedback_replies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"feedback_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "feedback_replies_thread_idx" ON "feedback_replies" USING btree ("feedback_id","created_at");