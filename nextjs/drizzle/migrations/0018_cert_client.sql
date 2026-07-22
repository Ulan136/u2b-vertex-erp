-- Поверка: поле «Клиент» (ТОО/название) в карточке сертификата/извещения.
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS client varchar(200);
