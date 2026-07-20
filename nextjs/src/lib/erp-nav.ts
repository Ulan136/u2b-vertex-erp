// Навигация нового ERP-шелла. Каждый пункт гейтится по screenKey из
// permissions.dto (единый источник с серверной матрицей). Пока экран не
// переехал, href ведёт в legacy-интерфейс (sketch_screens.html); по мере
// миграции меняем href на '/erp/<screen>' и снимаем legacy.
export type NavItem = { label: string; screenKey: string; href: string; legacy?: boolean };
export type NavSection = { title: string; icon: string; items: NavItem[] };

const L = '/sketch_screens.html';

export const ERP_NAV: NavSection[] = [
  { title: 'Главная', icon: '🏠', items: [
    { label: 'Рабочий стол', screenKey: 'dashboard', href: '/erp' },
  ] },
  { title: 'Поверка', icon: '📋', items: [
    { label: 'САМИ', screenKey: 'poverka_sami', href: '/erp/certs?source=САМИ' },
    { label: 'ВДК', screenKey: 'poverka_vdk', href: '/erp/certs?source=ВДК' },
    { label: 'ТЭЦ', screenKey: 'poverka_tec', href: '/erp/certs?source=ТЭЦ' },
    { label: 'Выездная', screenKey: 'poverka_field', href: '/erp/certs?source=Выездная' },
    { label: 'Первичная', screenKey: 'poverka_primary', href: '/erp/certs?source=Первичная-КМ' },
    { label: 'Астана', screenKey: 'poverka_astana', href: '/erp/certs?source=Астана' },
  ] },
  { title: 'Заявки', icon: '📥', items: [
    { label: 'Выездная поверка', screenKey: 'orders_field', href: '/erp/orders?source=field_check' },
    { label: 'ТЭЦ', screenKey: 'orders_tec', href: '/erp/orders?source=tec' },
  ] },
  { title: 'Продажи', icon: '💰', items: [
    { label: 'Журнал продаж', screenKey: 'sales', href: '/erp/sales' },
  ] },
  { title: 'Расходы', icon: '💸', items: [
    { label: 'Журнал расходов', screenKey: 'expenses', href: L, legacy: true },
  ] },
  { title: 'Бухгалтерия', icon: '📒', items: [
    { label: 'Документы', screenKey: 'accounting', href: '/erp/documents' },
  ] },
  { title: 'Финансы', icon: '💳', items: [
    { label: 'Счета и операции', screenKey: 'invoices', href: '/erp/finance' },
    { label: 'Долги', screenKey: 'debts', href: '/erp/debts' },
  ] },
  { title: 'Задачи', icon: '✅', items: [
    { label: 'Задачи сотрудникам', screenKey: 'tasks', href: '/erp/tasks' },
  ] },
  { title: 'Склад', icon: '🏭', items: [
    { label: 'Журнал склада', screenKey: 'warehouse', href: '/erp/warehouse' },
    { label: 'Покупки (приход)', screenKey: 'purchases', href: '/erp/warehouse' },
  ] },
  { title: 'Сотрудники', icon: '👥', items: [
    { label: 'Руководитель', screenKey: 'staff', href: '/erp/staff/directory' },
    { label: 'Зарплата и кадры', screenKey: 'staff', href: '/erp/staff' },
  ] },
  { title: 'Прочее', icon: '🗂', items: [
    { label: 'База данных', screenKey: 'database', href: '/erp/database' },
    { label: 'Отчёты', screenKey: 'reports', href: '/erp/reports' },
    { label: 'Справочник', screenKey: 'handbook', href: L, legacy: true },
    { label: 'Клиенты', screenKey: 'clients', href: '/erp/clients' },
  ] },
  { title: 'Настройки', icon: '⚙️', items: [
    { label: 'Настройки', screenKey: 'settings', href: '/erp/settings' },
    { label: 'Доступы', screenKey: 'settings', href: '/erp/access' },
    { label: 'Организация', screenKey: 'settings', href: '/erp/settings/org' },
    { label: 'Пользователи', screenKey: 'settings', href: '/erp/settings/users' },
  ] },
];
