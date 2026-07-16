-- Migration: new role set + role_permissions.
-- Roles: admin, director, accountant, manager, master.
-- Existing users are remapped (nobody is lost):
--   warehouse → master, buyer → manager, field → master; the rest keep their key.
-- Rebuilds the user_role enum (Postgres can't drop enum values in place).
-- Idempotent enough to re-run: remap is a no-op the second time.

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" TYPE text USING "role"::text;
--> statement-breakpoint
UPDATE "users" SET "role" = CASE "role"
  WHEN 'warehouse' THEN 'master'
  WHEN 'buyer'     THEN 'manager'
  WHEN 'field'     THEN 'master'
  ELSE "role" END;
--> statement-breakpoint
DROP TYPE IF EXISTS "user_role";
--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM ('admin', 'director', 'accountant', 'manager', 'master');
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" TYPE "user_role" USING "role"::"user_role";
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'manager';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "id"         uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "role"       varchar(40) NOT NULL,
  "screen_key" varchar(60) NOT NULL,
  "allowed"    boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_role_screen_uq" ON "role_permissions" ("role", "screen_key");
