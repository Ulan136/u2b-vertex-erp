-- Смешанная оплата продаж: каждая оплата = строка + свой приход в финансах.
CREATE TABLE IF NOT EXISTS sale_payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES finance_accounts(id),
  account_name varchar(100),
  amount numeric(14,2) NOT NULL,
  finance_op_id uuid REFERENCES finance_operations(id),
  created_at timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sale_payments_sale_idx ON sale_payments (sale_id);
--> statement-breakpoint
-- Бэкфилл: действующий приход каждой оплаченной продажи → одна строка оплаты.
INSERT INTO sale_payments (sale_id, account_id, account_name, amount, finance_op_id, created_at)
SELECT fo.sale_id, fo.account_id, fo.account_name, fo.amount, fo.id, fo.created_at
FROM finance_operations fo
WHERE fo.source = 'Продажа' AND fo.sale_id IS NOT NULL
  AND fo.op_type = 'Приход' AND fo.reversed_at IS NULL AND fo.reverses IS NULL
  AND NOT EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.finance_op_id = fo.id);
