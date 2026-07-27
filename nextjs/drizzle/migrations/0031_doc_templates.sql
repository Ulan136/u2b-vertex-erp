-- ГОСТ-шаблоны накладной/акта/КП (base64). Печать = заполнение файла-шаблона 1-в-1.
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS nakl_template_b64 text;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS akt_template_b64  text;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS kp_template_b64   text;
