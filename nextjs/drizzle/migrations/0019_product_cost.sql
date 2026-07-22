-- Себестоимость товара (обновляется приходом).
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price numeric(12,2) DEFAULT 0;
