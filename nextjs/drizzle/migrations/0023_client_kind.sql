-- Тип записи клиента: client (со скидкой) | buyer (покупатель, розница). Существующие → client.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kind varchar(10) NOT NULL DEFAULT 'client';
