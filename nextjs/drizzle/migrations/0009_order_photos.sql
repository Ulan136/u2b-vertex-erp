-- Фотоотчёт мастера по заявке: массив data-URL строк (сжатые на клиенте).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;
