-- Смешанная оплата расхода: строки одного расхода делят expense_group_id
-- (отмена/сторно затрагивает всю группу). Nullable — существующие не тронуты.
ALTER TABLE finance_operations ADD COLUMN IF NOT EXISTS expense_group_id uuid;
CREATE INDEX IF NOT EXISTS finance_ops_expgroup_idx ON finance_operations (expense_group_id);
