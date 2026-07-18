-- Кадры и зарплата: сотрудник = пользователь системы.
-- Оклад держим отдельной таблицей, чтобы права на users не раскрывали зарплаты.
CREATE TABLE IF NOT EXISTS employee_salary (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  fixed_salary numeric(14,2) DEFAULT '0',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);
--> statement-breakpoint
-- Выплаты зарплаты/авансов. Каждая выплата ссылается на реальную операцию
-- «Расход» в финансах (finance_op_id).
CREATE TABLE IF NOT EXISTS salary_payments (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        numeric(14,2) NOT NULL,
  account_id    uuid REFERENCES finance_accounts(id) ON DELETE SET NULL,
  finance_op_id uuid REFERENCES finance_operations(id) ON DELETE SET NULL,
  pay_date      date DEFAULT CURRENT_DATE,
  kind          varchar(20) DEFAULT 'salary',
  comment       text,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS salary_payments_user_idx ON salary_payments(user_id);
