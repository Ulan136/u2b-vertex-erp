-- Простые долги/займы: выдали деньги из счёта, ждём возврат на счёт.
CREATE TABLE IF NOT EXISTS loans (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  debtor_name  varchar(200) NOT NULL,
  amount       numeric(12,2) NOT NULL,
  returned     numeric(12,2) NOT NULL DEFAULT 0,
  account_id   uuid REFERENCES finance_accounts(id) ON DELETE SET NULL,
  comment      text,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz DEFAULT now(),
  closed_at    timestamptz
);
