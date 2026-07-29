-- Фото поверки хранятся на самом сертификате (единый источник, без дублей),
-- отдаются по ссылке /api/v2/certs/{id}/photo/{n}. order_id связывает
-- сертификат с заявкой (field_check order): заявка = certs WHERE order_id = ...
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS order_id uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS certificates_order_id_idx ON certificates(order_id);
