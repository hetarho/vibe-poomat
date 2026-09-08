CREATE TABLE "upvotes" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upvotes_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "upvotes_project_created_idx" ON "upvotes" USING btree ("project_id","created_at" desc);