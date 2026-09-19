-- Причина непригодности (извещение о непригодности) — отдельное поле, уходит в е-КТРМ.
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS unfit_reason text;
