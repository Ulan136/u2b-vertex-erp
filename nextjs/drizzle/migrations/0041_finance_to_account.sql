-- Перевод: хранить счёт-получатель, чтобы входящий перевод был виден строкой
-- у получателя (кабинет филиала «входящие переводы»). Nullable, безопасно.
ALTER TABLE finance_operations ADD COLUMN IF NOT EXISTS to_account_id uuid;
