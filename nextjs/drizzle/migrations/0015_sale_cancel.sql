-- Отмена продажи: помечаем «Отменена» со следом (не удаляем).
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
--> statement-breakpoint
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id);
--> statement-breakpoint
-- индекс для связи приход→продажа (используется при отмене)
CREATE INDEX IF NOT EXISTS finance_operations_sale_idx ON finance_operations (sale_id);
