-- Migration: tasks (задачи сотрудникам). Schema only, no data. Idempotent.

DO $$ BEGIN
  CREATE TYPE "task_status" AS ENUM ('new', 'accepted', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
  "id"           uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "title"        varchar(200) NOT NULL,
  "description"  text,
  "assignee_id"  uuid,
  "due_date"     date,
  "status"       "task_status" DEFAULT 'new' NOT NULL,
  "created_by"   uuid,
  "created_at"   timestamp with time zone DEFAULT now(),
  "updated_at"   timestamp with time zone DEFAULT now(),
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk"
    FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_status_idx"      ON "tasks" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_assignee_id_idx" ON "tasks" ("assignee_id");
