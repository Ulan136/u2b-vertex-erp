-- Аудит сторно + индексы леджера + секвенсы номеров (продажи, заявки).

-- 1) Сторно-аудит на finance_operations
ALTER TABLE finance_operations ADD COLUMN IF NOT EXISTS reverses uuid REFERENCES finance_operations(id);
--> statement-breakpoint
ALTER TABLE finance_operations ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
--> statement-breakpoint

-- 2) Индексы на растущий леджер (частые фильтры/сортировки)
CREATE INDEX IF NOT EXISTS finance_operations_op_date_idx ON finance_operations (op_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS finance_operations_account_idx ON finance_operations (account_id);
--> statement-breakpoint

-- 3) Секвенс номеров продаж ПРД-NNN (seed с текущего максимума)
CREATE SEQUENCE IF NOT EXISTS sales_no_seq;
--> statement-breakpoint
SELECT setval(
  'sales_no_seq',
  GREATEST(COALESCE((SELECT MAX(NULLIF(regexp_replace(sale_no, '\D', '', 'g'), '')::int) FROM sales), 0), 1),
  COALESCE((SELECT MAX(NULLIF(regexp_replace(sale_no, '\D', '', 'g'), '')::int) FROM sales), 0) > 0
);
--> statement-breakpoint

-- 4) Секвенсы номеров заявок по источникам (ЗАК-, ТЭЦ-)
CREATE SEQUENCE IF NOT EXISTS orders_field_no_seq;
--> statement-breakpoint
SELECT setval(
  'orders_field_no_seq',
  GREATEST(COALESCE((SELECT MAX(NULLIF(regexp_replace(order_no, '\D', '', 'g'), '')::int) FROM orders WHERE order_no LIKE 'ЗАК-%'), 0), 1),
  COALESCE((SELECT MAX(NULLIF(regexp_replace(order_no, '\D', '', 'g'), '')::int) FROM orders WHERE order_no LIKE 'ЗАК-%'), 0) > 0
);
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS orders_tec_no_seq;
--> statement-breakpoint
SELECT setval(
  'orders_tec_no_seq',
  GREATEST(COALESCE((SELECT MAX(NULLIF(regexp_replace(order_no, '\D', '', 'g'), '')::int) FROM orders WHERE order_no LIKE 'ТЭЦ-%'), 0), 1),
  COALESCE((SELECT MAX(NULLIF(regexp_replace(order_no, '\D', '', 'g'), '')::int) FROM orders WHERE order_no LIKE 'ТЭЦ-%'), 0) > 0
);
