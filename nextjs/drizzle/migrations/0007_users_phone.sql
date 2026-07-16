-- Migration: add phone to users (normalized to +7XXXXXXXXXX). Schema only.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" varchar(20);
