-- Координаты адреса заявки (выбор на Яндекс.Карте) + публичный JS-ключ Яндекс.Карт.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS yandex_maps_key varchar(120);
