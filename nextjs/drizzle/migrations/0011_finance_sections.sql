-- Раздел счёта (Поверка/Продажа/Прочие/Филиалы) для экрана «Финансы».
DO $$ BEGIN
  CREATE TYPE finance_section AS ENUM ('poverka','sale','other','branch');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE finance_accounts ADD COLUMN IF NOT EXISTS section finance_section DEFAULT 'other';
--> statement-breakpoint
-- name больше не уникален глобально (Каспи может быть в разных разделах).
ALTER TABLE finance_accounts DROP CONSTRAINT IF EXISTS finance_accounts_name_unique;
