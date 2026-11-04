-- Поддержка: заявки от филиалов и сотрудников в техподдержку.
-- Переписка живёт в уже существующей таблице comments (entity_type='support'),
-- отдельную таблицу сообщений не заводим.

ALTER TYPE comment_entity ADD VALUE IF NOT EXISTS 'support';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS support_tickets (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_no   integer,                                        -- человекочитаемый номер, сквозной
  branch_id   uuid REFERENCES branches(id),                   -- филиал автора (для фильтра)
  screen      varchar(60),                                    -- где возникло: «Расходы», «Поверка · Астана» …
  title       varchar(200) NOT NULL,
  body        text NOT NULL,
  severity    varchar(20) NOT NULL DEFAULT 'Обычная',          -- Обычная | Срочная | Блокирует работу
  status      varchar(20) NOT NULL DEFAULT 'Новая',            -- Новая | В работе | Отвечено | Закрыта
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  answered_at timestamptz,
  closed_at   timestamptz
);
--> statement-breakpoint

-- Сквозная нумерация заявок поддержки (ПДД-1, ПДД-2 …).
CREATE SEQUENCE IF NOT EXISTS support_ticket_no_seq OWNED BY support_tickets.ticket_no;
--> statement-breakpoint
ALTER TABLE support_tickets ALTER COLUMN ticket_no SET DEFAULT nextval('support_ticket_no_seq');
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_tickets_branch_idx ON support_tickets (branch_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_tickets_created_idx ON support_tickets (created_at DESC);
