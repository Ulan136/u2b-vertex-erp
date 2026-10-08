-- Право вести расходы филиала (кабинет филиала): только отмеченные пользователи
-- видят и вносят расходы своего филиала. Остальным роль branch расходы не показывает.
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_expense boolean NOT NULL DEFAULT false;
