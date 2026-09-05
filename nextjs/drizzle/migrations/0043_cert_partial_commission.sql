-- Частичная оплата сертификата («Есть остаток») + выплата комиссии клиенту (ТЭЦ).
ALTER TYPE pay_status ADD VALUE IF NOT EXISTS 'Есть остаток';
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) DEFAULT 0;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS commission_paid_at timestamptz;
