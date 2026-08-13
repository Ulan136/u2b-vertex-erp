-- Закуп ↔ финансы + отмена движений. finance_group связывает движение прихода с
-- группой финопераций-расходов (оплата закупа), чтобы отмена возвращала и склад,
-- и деньги. reversed_at помечает отменённое движение (остаток откачен, деньги сторно).
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS finance_group uuid;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
