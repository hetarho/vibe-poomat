CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"task_text" varchar(1000) NOT NULL,
	"questions" jsonb NOT NULL,
	"slots" integer NOT NULL,
	"state" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "missions_project_idx" ON "missions" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "missions_one_open_per_project_unq" ON "missions" USING btree ("project_id") WHERE "missions"."state" = 'open';