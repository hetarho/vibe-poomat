CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(60) NOT NULL,
	"live_url" text NOT NULL,
	"pitch" varchar(200) NOT NULL,
	"description" text,
	"cover_key" text,
	"tags" text[] NOT NULL,
	"upvote_count" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "projects_created_at_idx" ON "projects" USING btree ("created_at" desc) WHERE "projects"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "projects_tags_idx" ON "projects" USING gin ("tags");