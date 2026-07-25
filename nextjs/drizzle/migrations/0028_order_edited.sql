-- Правка содержимого заявки после отправки: создатель меняет карточку, пока
-- логист/мастер её «не доставил» (статус ещё «В работе»). Мастер видит такие
-- заявки другим фоном и во вкладке «Изменения»; отметка снимается, когда он
-- открыл карточку (edited_seen_at ≥ edited_at). Смена статуса правкой НЕ считается.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS edited_at      timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS edited_by      uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS edited_seen_at timestamptz;
