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
    { label: 'САМИ', screenKey: 'poverka_sami', href: L, legacy: true },
    { label: 'ВДК', screenKey: 'poverka_vdk', href: L, legacy: true },
    { label: 'ТЭЦ', screenKey: 'poverka_tec', href: L, legacy: true },
    { label: 'Выездная', screenKey: 'poverka_field', href: L, legacy: true },
    { label: 'Первичная', screenKey: 'poverka_primary', href: L, legacy: true },
    { label: 'Астана', screenKey: 'poverka_astana', href: L, legacy: true },
  ] },
  { title: 'Заявки', icon: '📥', items: [
    { label: 'Выездная поверка', screenKey: 'orders_field', href: L, legacy: true },
    { label: 'ТЭЦ', screenKey: 'orders_tec', href: L, legacy: true },
  ] },
  { title: 'Продажи', icon: '💰', items: [
    { label: 'Журнал продаж', screenKey: 'sales', href: L, legacy: true },
  ] },
  { title: 'Расходы', icon: '💸', items: [
    { label: 'Журнал расходов', screenKey: 'expenses', href: L, legacy: true },
  ] },
  { title: 'Бухгалтерия', icon: '📒', items: [
    { label: 'Документы', screenKey: 'accounting', href: L, legacy: true },
  ] },
  { title: 'Финансы', icon: '💳', items: [
    { label: 'Счета и операции', screenKey: 'invoices', href: L, legacy: true },
    { label: 'Долги', screenKey: 'debts', href: L, legacy: true },
  ] },
  { title: 'Задачи', icon: '✅', items: [
    { label: 'Задачи сотрудникам', screenKey: 'tasks', href: L, legacy: true },
  ] },
  { title: 'Склад', icon: '🏭', items: [
    { label: 'Журнал склада', screenKey: 'warehouse', href: L, legacy: true },
    { label: 'Покупки', screenKey: 'purchases', href: L, legacy: true },
  ] },
  { title: 'Сотрудники', icon: '👥', items: [
    { label: 'Руководитель', screenKey: 'staff', href: L, legacy: true },
    { label: 'Зарплата и кадры', screenKey: 'staff', href: L, legacy: true },
  ] },
  { title: 'Прочее', icon: '🗂', items: [
    { label: 'База данных', screenKey: 'database', href: L, legacy: true },
    { label: 'Отчёты', screenKey: 'reports', href: L, legacy: true },
    { label: 'Справочник', screenKey: 'handbook', href: L, legacy: true },
    { label: 'Клиенты', screenKey: 'clients', href: L, legacy: true },
  ] },
  { title: 'Настройки', icon: '⚙️', items: [
    { label: 'Настройки', screenKey: 'settings', href: L, legacy: true },
  ] },
];
