-- Поля, которых требует карточка «Сертификат о поверке» в е-КТРМ,
-- но которых не было в нашей карточке. Проверено на выборке 1673 сертификатов
-- ТОО «VERTEX METROLOGY» за май–август 2026 года.

-- ── Сертификат: недостающие реквизиты ──────────────────────────
-- Заключение → «По классу», например «±5; ±2».
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS accuracy_class varchar(40);
--> statement-breakpoint
-- Сведения о пользователе → физлицо (ИИН + ФИО) либо юрлицо (БИН + наименование).
-- В е-КТРМ эти ветки взаимоисключающие: заполнена всегда ровно одна.
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS owner_kind varchar(10) DEFAULT 'физлицо';
--> statement-breakpoint
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS owner_tax_id varchar(12);
--> statement-breakpoint
-- Парное поле к адресу: «Адрес (на казахском языке)».
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS address_kz text;
--> statement-breakpoint
-- Поверитель. В е-КТРМ это отдельное поле, не автор записи:
-- один и тот же человек не должен попадать туда в разных написаниях.
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS verifier varchar(120);
--> statement-breakpoint
-- Метка пачки выгрузки — защита от повторной отправки одной записи.
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS ktrm_batch_id uuid;
--> statement-breakpoint

-- ── Справочник типов: привязка к е-КТРМ ────────────────────────
-- «Выбор шаблона» в модуле разворачивает наименование СИ, модель,
-- диапазон, методику поверки и изготовителя. Держим соответствие здесь.
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS ktrm_template varchar(200);
--> statement-breakpoint
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS ktrm_model varchar(200);
--> statement-breakpoint
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS ktrm_si_name varchar(200);
--> statement-breakpoint
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS ktrm_si_name_kz varchar(200);
--> statement-breakpoint
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS ktrm_registry_no varchar(50);
--> statement-breakpoint
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS ktrm_method varchar(300);
--> statement-breakpoint
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS ktrm_range varchar(160);
--> statement-breakpoint
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS manufacturer varchar(200);
--> statement-breakpoint
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS manufacturer_country varchar(80);
--> statement-breakpoint
-- Межповерочный интервал в годах. Из него считается «Действителен до».
-- Раздельно для холодной и горячей воды: госреестр даёт разные сроки,
-- а е-КТРМ этого различия не видит и ставит один на всех.
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS interval_years_cold smallint;
--> statement-breakpoint
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS interval_years_hot smallint;
--> statement-breakpoint

-- ── Пачки выгрузки в е-КТРМ ────────────────────────────────────
CREATE TABLE IF NOT EXISTS ktrm_batches (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  status       varchar(20) NOT NULL DEFAULT 'Подготовлена',
  cert_count   integer NOT NULL DEFAULT 0,
  file_name    varchar(200),
  error        text,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz DEFAULT now(),
  imported_at  timestamptz,
  signed_at    timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS certificates_ktrm_batch_idx ON certificates (ktrm_batch_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS certificates_oper_status_idx ON certificates (oper_status);
