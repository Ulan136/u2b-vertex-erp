-- Новый раздел финансов №5 «Филиал Алматы». Существующий 'branch' = №4 «Филиал
-- Астана», 'branch_almaty' = №5 «Филиал Алматы». Порядок/номера — в коде
-- (FINANCE_SECTION_META), enum лишь хранит ключ раздела счёта.
ALTER TYPE finance_section ADD VALUE IF NOT EXISTS 'branch_almaty';
