// Навигация нового ERP-шелла. Каждый пункт гейтится по screenKey из
// permissions.dto (единый источник с серверной матрицей). Все экраны переехали
// на Next `/erp/*`; `legacy` оставлен в типе на случай отката отдельного пункта.
// Разделы сгруппированы в две цветовые зоны, как в старом интерфейсе:
//   income — «Доходы» (emerald), ops — «Операции и учёт» (sky).
export type NavZone = 'income' | 'ops';
export type NavItem = { label: string; screenKey: string; href: string; legacy?: boolean; external?: boolean };
export type NavSection = { title: string; icon: string; zone?: NavZone; items: NavItem[] };

export const ZONE_LABELS: Record<NavZone, string> = { income: 'Доходы', ops: 'Операции и учёт' };

export const ERP_NAV: NavSection[] = [
  // ── Верх (вне зон) ──
  { title: 'Главная', icon: '🏠', items: [
    { label: 'Рабочий стол', screenKey: 'dashboard', href: '/erp' },
  ] },

  // ── Зона «Доходы» (emerald) ──
  { title: 'Поверка', icon: '📋', zone: 'income', items: [
    { label: 'САМИ', screenKey: 'poverka_sami', href: '/erp/certs?source=САМИ' },
    { label: 'ВДК', screenKey: 'poverka_vdk', href: '/erp/certs?source=ВДК' },
    { label: 'ТЭЦ', screenKey: 'poverka_tec', href: '/erp/certs?source=ТЭЦ' },
    { label: 'Выездная', screenKey: 'poverka_field', href: '/erp/certs?source=Выездная' },
    { label: 'Первичная', screenKey: 'poverka_primary', href: '/erp/certs?source=Первичная-КМ' },
    { label: 'Астана', screenKey: 'poverka_astana', href: '/erp/certs?source=Астана' },
  ] },
  { title: 'Заявки', icon: '📥', zone: 'income', items: [
    { label: 'Выездная поверка', screenKey: 'orders_field', href: '/erp/orders?source=field_check' },
    { label: 'ТЭЦ', screenKey: 'orders_tec', href: '/erp/orders?source=tec' },
  ] },
  { title: 'Продажа', icon: '💰', zone: 'income', items: [
    { label: 'Журнал продаж', screenKey: 'sales', href: '/erp/sales' },
  ] },
  { title: 'Счета', icon: '🧾', zone: 'income', items: [
    { label: 'Поступления', screenKey: 'invoices', href: '/erp/invoices' },
    { label: 'Филиалы', screenKey: 'invoices', href: '/erp/invoices?section=branch' },
    { label: 'Прочие операции', screenKey: 'other_ops', href: '/erp/invoices?section=other' },
  ] },

  // ── Зона «Операции и учёт» (sky) ──
  { title: 'Расходы', icon: '💸', zone: 'ops', items: [
    { label: 'Журнал расходов', screenKey: 'expenses', href: '/erp/expenses' },
  ] },
  { title: 'Бухгалтерия', icon: '📒', zone: 'ops', items: [
    { label: 'Документы', screenKey: 'accounting', href: '/erp/documents' },
  ] },
  { title: 'Финансы', icon: '💳', zone: 'ops', items: [
    { label: 'Счета и операции', screenKey: 'invoices', href: '/erp/finance' },
    { label: 'Долги', screenKey: 'debts', href: '/erp/debts' },
  ] },
  { title: 'Задачи', icon: '✅', zone: 'ops', items: [
    { label: 'Задачи сотрудникам', screenKey: 'tasks', href: '/erp/tasks' },
  ] },
  { title: 'Склад', icon: '🏭', zone: 'ops', items: [
    { label: 'Журнал склада', screenKey: 'warehouse', href: '/erp/warehouse' },
    { label: 'Покупки (приход)', screenKey: 'purchases', href: '/erp/warehouse' },
  ] },
  { title: 'Сотрудники', icon: '👥', zone: 'ops', items: [
    { label: 'Руководитель', screenKey: 'staff', href: '/erp/staff/directory' },
    { label: 'Зарплата и кадры', screenKey: 'staff', href: '/erp/staff' },
  ] },
  { title: 'Данные', icon: '🗄', zone: 'ops', items: [
    { label: 'Уведомления', screenKey: 'dashboard', href: '/erp/notifications' },
    { label: 'База данных', screenKey: 'database', href: '/erp/database' },
    { label: 'Отчёты', screenKey: 'reports', href: '/erp/reports' },
    { label: 'Справочник', screenKey: 'handbook', href: '/erp/handbook' },
    { label: 'Клиенты', screenKey: 'clients', href: '/erp/clients' },
  ] },
  { title: 'Настройки', icon: '⚙️', zone: 'ops', items: [
    { label: 'Настройки', screenKey: 'settings', href: '/erp/settings' },
    { label: 'Доступы', screenKey: 'settings', href: '/erp/access' },
    { label: 'Организация', screenKey: 'settings', href: '/erp/settings/org' },
    { label: 'Филиалы', screenKey: 'settings', href: '/erp/settings/branches' },
    { label: 'Пользователи', screenKey: 'settings', href: '/erp/settings/users' },
    { label: '📱 Кабинет мастера', screenKey: 'settings', href: '/master', external: true },
    { label: '📱 Кабинет директора', screenKey: 'settings', href: '/director', external: true },
  ] },
];
