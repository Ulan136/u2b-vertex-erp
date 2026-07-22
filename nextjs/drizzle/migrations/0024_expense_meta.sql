-- Поля расхода (для точной копии экрана Расходы). Все nullable — существующие
-- операции и балансы не затрагиваются. Пишутся только модалкой расхода.
ALTER TABLE finance_operations ADD COLUMN IF NOT EXISTS expense_cat varchar(100);
ALTER TABLE finance_operations ADD COLUMN IF NOT EXISTS sub_category varchar(100);
ALTER TABLE finance_operations ADD COLUMN IF NOT EXISTS supplier varchar(200);
ALTER TABLE finance_operations ADD COLUMN IF NOT EXISTS doc_no varchar(50);
ALTER TABLE finance_operations ADD COLUMN IF NOT EXISTS status varchar(20);
ALTER TABLE finance_operations ADD COLUMN IF NOT EXISTS order_id uuid;
