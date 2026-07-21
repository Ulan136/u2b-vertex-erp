-- Журнал действий (аудит-трейл). Неизменяемый: правок/удалений нет.
CREATE TABLE IF NOT EXISTS audit_log (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      uuid REFERENCES users(id),
  user_name    varchar(200),
  action       varchar(30) NOT NULL,
  entity_type  varchar(40),
  entity_id    uuid,
  entity_label varchar(200),
  details      jsonb,
  ip           varchar(60),
  created_at   timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log (user_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity_type, entity_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action);
