-- Откат 0040_ktrm_fields.sql. Применяется вручную и только целенаправленно:
--   tsx --env-file=.env.local src/db/apply-migration.ts drizzle/migrations/0040_ktrm_fields.down.sql
-- Перед применением убедитесь, что колонки пустые — иначе данные пропадут.

DROP INDEX IF EXISTS certificates_ktrm_batch_idx;
--> statement-breakpoint
DROP INDEX IF EXISTS certificates_oper_status_idx;
--> statement-breakpoint
DROP TABLE IF EXISTS ktrm_batches;
--> statement-breakpoint

ALTER TABLE certificates DROP COLUMN IF EXISTS accuracy_class;
--> statement-breakpoint
ALTER TABLE certificates DROP COLUMN IF EXISTS owner_kind;
--> statement-breakpoint
ALTER TABLE certificates DROP COLUMN IF EXISTS owner_tax_id;
--> statement-breakpoint
ALTER TABLE certificates DROP COLUMN IF EXISTS address_kz;
--> statement-breakpoint
ALTER TABLE certificates DROP COLUMN IF EXISTS verifier;
--> statement-breakpoint
ALTER TABLE certificates DROP COLUMN IF EXISTS ktrm_batch_id;
--> statement-breakpoint

ALTER TABLE device_types DROP COLUMN IF EXISTS ktrm_template;
--> statement-breakpoint
ALTER TABLE device_types DROP COLUMN IF EXISTS ktrm_model;
--> statement-breakpoint
ALTER TABLE device_types DROP COLUMN IF EXISTS ktrm_si_name;
--> statement-breakpoint
ALTER TABLE device_types DROP COLUMN IF EXISTS ktrm_si_name_kz;
--> statement-breakpoint
ALTER TABLE device_types DROP COLUMN IF EXISTS ktrm_registry_no;
--> statement-breakpoint
ALTER TABLE device_types DROP COLUMN IF EXISTS ktrm_method;
--> statement-breakpoint
ALTER TABLE device_types DROP COLUMN IF EXISTS ktrm_range;
--> statement-breakpoint
ALTER TABLE device_types DROP COLUMN IF EXISTS manufacturer;
--> statement-breakpoint
ALTER TABLE device_types DROP COLUMN IF EXISTS manufacturer_country;
--> statement-breakpoint
ALTER TABLE device_types DROP COLUMN IF EXISTS interval_years_cold;
--> statement-breakpoint
ALTER TABLE device_types DROP COLUMN IF EXISTS interval_years_hot;
