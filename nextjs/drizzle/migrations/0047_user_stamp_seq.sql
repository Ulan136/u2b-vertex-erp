-- Порядковый № клейма ПЕР-МЕНЕДЖЕР (у каждого свой, не видит чужой). Заменяет
-- общий org_settings.stamp_seq_next (тот остаётся неиспользуемым).
ALTER TABLE users ADD COLUMN IF NOT EXISTS stamp_seq_next integer;
