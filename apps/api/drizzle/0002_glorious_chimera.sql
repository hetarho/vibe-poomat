CREATE TABLE "credit_accounts" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"escrowed" integer DEFAULT 0 NOT NULL,
	"received" integer DEFAULT 0 NOT NULL,
	"given" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_accounts_balance_non_negative" CHECK ("credit_accounts"."balance" >= 0),
	CONSTRAINT "credit_accounts_escrowed_non_negative" CHECK ("credit_accounts"."escrowed" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"type" text NOT NULL,
	"balance_delta" integer NOT NULL,
	"escrow_delta" integer NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_operation_unq" ON "ledger_entries" USING btree ("type","account_id","ref_type","ref_id") WHERE "ledger_entries"."ref_id" is not null;