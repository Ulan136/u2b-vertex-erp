-- Migration: comments + notifications + users.last_seen_at. Schema only, idempotent.

DO $$ BEGIN
  CREATE TYPE "comment_entity" AS ENUM ('order', 'task');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comments" (
  "id"          uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "entity_type" "comment_entity" NOT NULL,
  "entity_id"   uuid NOT NULL,
  "author_id"   uuid,
  "text"        text NOT NULL,
  "created_at"  timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk"
    FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comments_entity_idx" ON "comments" ("entity_type", "entity_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
  "id"         uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
  "user_id"    uuid NOT NULL,
  "type"       varchar(40) NOT NULL,
  "title"      varchar(300) NOT NULL,
  "link"       varchar(200),
  "is_read"    boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" ("user_id", "created_at");
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone;
