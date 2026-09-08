CREATE TABLE "notification_prefs" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_prefs_user_id_type_pk" PRIMARY KEY("user_id","type")
);
