-- Продажи: мультипозиция + тип клиента (розница/скидка).
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_type varchar(20) DEFAULT 'retail';
--> statement-breakpoint
ALTER TABLE sales ADD COLUMN IF NOT EXISTS items jsonb;
