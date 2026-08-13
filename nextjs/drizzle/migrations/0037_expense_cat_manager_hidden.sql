-- Флаг «скрыто от менеджеров» на категории расходов. Админ переключает глазиком;
-- при включённом флаге суммы/операции этой категории не отдаются неруководящим
-- ролям (сервер фильтрует overview). Руководство (admin/accountant/director) — всё.
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS manager_hidden boolean DEFAULT false;
