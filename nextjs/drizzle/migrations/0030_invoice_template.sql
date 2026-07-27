-- ГОСТ-шаблон «Счёт на оплату» (xlsx в base64). Счёт печатается заполнением
-- этого файла 1-в-1 — вёрстка/логотип/печать/подпись берутся из самого шаблона.
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS invoice_template_b64 text;
