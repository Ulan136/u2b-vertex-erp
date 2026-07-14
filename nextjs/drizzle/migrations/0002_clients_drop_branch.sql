-- Migration: drop branch scoping from clients + client_categories.
-- Clients are now organization-wide; the only grouping is category.
-- Idempotent; DROP COLUMN cascades its FK constraint and index automatically.
-- Existing rows in other columns are preserved.

ALTER TABLE "clients" DROP COLUMN IF EXISTS "branch_id";
--> statement-breakpoint
ALTER TABLE "client_categories" DROP COLUMN IF EXISTS "branch_id";
