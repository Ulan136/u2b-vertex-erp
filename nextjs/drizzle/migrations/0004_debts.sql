-- Migration: debts (дебиторка/кредиторка) + debt_payments (погашения).
-- Schema only, no data. Idempotent.

DO $$ BEGIN CREATE TYPE "debt_type"   AS ENUM ('debit', 'credit');           EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "debt_status" AS ENUM ('open', 'partial', 'closed'); EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "debts" (
  "id"                     uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "type"                   "debt_type" NOT NULL,
  "counterparty_client_id" uuid,
  "counterparty_name"      varchar(200),
  "amount"                 numeric(12,2) NOT NULL,
  "paid_amount"            numeric(12,2) DEFAULT '0' NOT NULL,
  "account_id"             uuid,
  "due_date"               date,
  "comment"                text,
  "status"                 "debt_status" DEFAULT 'open' NOT NULL,
  "created_at"             timestamp with time zone DEFAULT now(),
  "updated_at"             timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "debt_payments" (
  "id"            uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "debt_id"       uuid NOT NULL,
  "amount"        numeric(12,2) NOT NULL,
  "account_id"    uuid,
  "finance_op_id" uuid,
  "pay_date"      date DEFAULT CURRENT_DATE,
  "comment"       text,
  "created_at"    timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "debts" ADD CONSTRAINT "debts_counterparty_client_id_clients_id_fk"
    FOREIGN KEY ("counterparty_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "debts" ADD CONSTRAINT "debts_account_id_finance_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_debts_id_fk"
    FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_account_id_finance_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_finance_op_id_finance_operations_id_fk"
    FOREIGN KEY ("finance_op_id") REFERENCES "public"."finance_operations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debts_type_idx"   ON "debts" ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debts_status_idx" ON "debts" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debt_payments_debt_id_idx" ON "debt_payments" ("debt_id");
