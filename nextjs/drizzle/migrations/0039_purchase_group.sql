-- Мультипозиционный закуп: все приходы одного закупа делят purchase_group.
-- Отмена/удаление любой позиции откатывает весь закуп (склад + деньги).
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS purchase_group uuid;
