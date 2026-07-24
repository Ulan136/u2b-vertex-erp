-- Автор записи (created_by) для заявок, клиентов и долгов. Nullable — старые
-- записи заполняем из audit_log по событию 'created'; чего нет в логе — оставляем
-- пусто (показываем «—»). Автор проставляется сервером из сессии, руками не меняется.
ALTER TABLE orders  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE debts   ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- Бэкфилл автора из audit_log (событие создания записи).
UPDATE orders o SET created_by = a.user_id
  FROM audit_log a
  WHERE o.created_by IS NULL AND a.user_id IS NOT NULL
    AND a.entity_type = 'order' AND a.entity_id = o.id AND a.action = 'created';

UPDATE clients c SET created_by = a.user_id
  FROM audit_log a
  WHERE c.created_by IS NULL AND a.user_id IS NOT NULL
    AND a.entity_type = 'client' AND a.entity_id = c.id AND a.action = 'created';

UPDATE debts d SET created_by = a.user_id
  FROM audit_log a
  WHERE d.created_by IS NULL AND a.user_id IS NOT NULL
    AND a.entity_type = 'debt' AND a.entity_id = d.id AND a.action = 'created';
