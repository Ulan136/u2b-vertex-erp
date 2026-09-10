-- Серт, оплата которого закрыта взаиморасчётом (зачётом комиссии).
-- В списке сертификатов колонка «Счёт» для таких показывает «Смешанная».
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS settled_by_offset boolean DEFAULT false;
