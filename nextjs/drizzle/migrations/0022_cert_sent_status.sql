-- Извещение: статус отправки (Отправлено | Не отправлено | Запланировано).
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS sent_status varchar(20) DEFAULT 'Не отправлено';
