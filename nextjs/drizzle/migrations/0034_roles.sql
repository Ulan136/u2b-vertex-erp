-- Пользовательские роли: 5 системных + создаваемые в «Доступах». Матрица прав
-- (role_permissions.role) уже varchar; здесь снимаем enum с users.role, чтобы
-- можно было назначать кастомные роли.
CREATE TABLE IF NOT EXISTS roles (
  key        varchar(40) PRIMARY KEY,
  label      varchar(80) NOT NULL,
  is_system  boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
--> statement-breakpoint
INSERT INTO roles (key, label, is_system) VALUES
  ('admin','Админ',true),
  ('director','Директор',true),
  ('accountant','Бухгалтер',true),
  ('manager','Менеджер',true),
  ('master','Мастер',true)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN role TYPE varchar(40) USING role::text;
--> statement-breakpoint
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'manager';
