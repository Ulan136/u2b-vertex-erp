-- Migration: add origin channel to orders (field_check | tec).
-- Existing rows backfill to 'field_check' via the column default → no data loss.
-- Idempotent.

DO $$ BEGIN
  CREATE TYPE "order_source" AS ENUM ('field_check', 'tec');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source" "order_source" DEFAULT 'field_check' NOT NULL;
