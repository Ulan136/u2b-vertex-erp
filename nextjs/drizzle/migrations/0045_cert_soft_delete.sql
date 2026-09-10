-- Корзина сертификатов: мягкое удаление вместо жёсткого. Удаление ставит deleted_at
-- (запись остаётся в корзине), из корзины можно восстановить (deleted_at=NULL) или
-- удалить насовсем. Обычные списки исключают deleted_at IS NOT NULL.
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_certificates_deleted_at ON certificates(deleted_at);
