-- Migration: per-branch client categories + clients (schema only, no data).
-- Idempotent: safe to re-run; touches only the two new tables.

CREATE TABLE IF NOT EXISTS "client_categories" (
  "id"         uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "branch_id"  uuid NOT NULL,
  "name"       varchar(100) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
  "id"          uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "branch_id"   uuid NOT NULL,
  "name"        varchar(150) NOT NULL,
  "phone"       varchar(20),
  "category_id" uuid,
  "created_at"  timestamp with time zone DEFAULT now(),
  "updated_at"  timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "client_categories"
    ADD CONSTRAINT "client_categories_branch_id_branches_id_fk"
    FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "clients"
    ADD CONSTRAINT "clients_branch_id_branches_id_fk"
    FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "clients"
    ADD CONSTRAINT "clients_category_id_client_categories_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "public"."client_categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_branch_id_idx" ON "clients" ("branch_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_categories_branch_id_idx" ON "client_categories" ("branch_id");
