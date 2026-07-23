-- Автор платежа по долгу (для журнала оплат). Nullable — старые платежи без автора.
ALTER TABLE debt_payments ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
