-- Категории долгов (кредиторка): пользователь ведёт сам. + category_id у долга.
CREATE TABLE IF NOT EXISTS debt_categories (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       varchar(100) NOT NULL,
  icon       varchar(10) DEFAULT '📁',
  sort_order integer DEFAULT 0
);
ALTER TABLE debts ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES debt_categories(id) ON DELETE SET NULL;
