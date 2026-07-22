// Навигация нового ERP-шелла. Каждый пункт гейтится по screenKey из
// permissions.dto (единый источник с серверной матрицей). Все экраны переехали
// на Next `/erp/*`; `legacy` оставлен в типе на случай отката отдельного пункта.
// Разделы сгруппированы в две цветовые зоны, как в старом интерфейсе:
//   income — «Доходы» (emerald), ops — «Операции и учёт» (sky).
export type NavZone = 'income' | 'ops';
// heading: подзаголовок-разделитель внутри секции (напр. источник поверки «САМИ»),
// не кликается; href для него не нужен.
export type NavItem = { label: string; screenKey: string; href?: string; legacy?: boolean; external?: boolean; heading?: boolean };
// divider: под-раздел внутри зоны (напр. «Операционные», «Финансы и учёт») — как в оригинале.
export type NavSection = { title: string; icon: string; zone?: NavZone; divider?: string; items: NavItem[] };

export const ZONE_LABELS: Record<NavZone, string> = { income: 'Доходы', ops: 'Операции и учёт' };

export const ERP_NAV: NavSection[] = [
  // ── Верх (вне зон) ──
  { title: 'Главная', icon: '🏠', items: [
    { label: 'Рабочий стол', screenKey: 'dashboard', href: '/erp' },
  ] },

  // ── Зона «Доходы» (emerald) ──
  // ПОВЕРКА: под каждым источником отдельные пункты Сертификат/Извещение
  // (и Заявки у ТЭЦ/Выездной) — как в оригинальном сайдбаре.
  { title: 'Поверка', icon: '📋', zone: 'income', items: [
    { label: 'САМИ', screenKey: 'poverka_sami', heading: true },
    { label: 'Сертификат', screenKey: 'poverka_sami', href: '/erp/certs?source=САМИ&type=cert' },
    { label: 'Извещение', screenKey: 'poverka_sami', href: '/erp/certs?source=САМИ&type=izv' },
    { label: 'ВДК', screenKey: 'poverka_vdk', heading: true },
    { label: 'Сертификат', screenKey: 'poverka_vdk', href: '/erp/certs?source=ВДК&type=cert' },
    { label: 'Извещение', screenKey: 'poverka_vdk', href: '/erp/certs?source=ВДК&type=izv' },
    { label: 'ТЭЦ', screenKey: 'poverka_tec', heading: true },
    { label: 'Заявки', screenKey: 'orders_tec', href: '/erp/orders?source=tec' },
    { label: 'Сертификат', screenKey: 'poverka_tec', href: '/erp/certs?source=ТЭЦ&type=cert' },
    { label: 'Извещение', screenKey: 'poverka_tec', href: '/erp/certs?source=ТЭЦ&type=izv' },
    { label: '🚗 Выездная поверка', screenKey: 'poverka_field', heading: true },
    { label: 'Заявки', screenKey: 'orders_field', href: '/erp/orders?source=field_check' },
    { label: 'Сертификат', screenKey: 'poverka_field', href: '/erp/certs?source=Выездная&type=cert' },
    { label: 'Извещение', screenKey: 'poverka_field', href: '/erp/certs?source=Выездная&type=izv' },
    { label: '🆕 Первичная · KAZMETER', screenKey: 'poverka_primary', heading: true },
    { label: 'Сертификат', screenKey: 'poverka_primary', href: '/erp/certs?source=Первичная-КМ&type=cert' },
    { label: 'Извещение', screenKey: 'poverka_primary', href: '/erp/certs?source=Первичная-КМ&type=izv' },
    { label: 'Первичная · AQUA', screenKey: 'poverka_primary', heading: true },
    { label: 'Сертификат', screenKey: 'poverka_primary', href: '/erp/certs?source=Первичная-АК&type=cert' },
    { label: 'Извещение', screenKey: 'poverka_primary', href: '/erp/certs?source=Первичная-АК&type=izv' },
  ] },
  // ФИЛИАЛЫ: Астана → Выездная поверка → Сертификат/Извещение (как в оригинале).
  { title: 'Филиалы', icon: '🏢', zone: 'income', items: [
    { label: 'Астана · Выездная поверка', screenKey: 'poverka_astana', heading: true },
    { label: 'Сертификат', screenKey: 'poverka_astana', href: '/erp/certs?source=Астана&type=cert' },
    { label: 'Извещение', screenKey: 'poverka_astana', href: '/erp/certs?source=Астана&type=izv' },
  ] },
  { title: 'Продажа', icon: '💰', zone: 'income', items: [
    { label: 'Журнал продаж', screenKey: 'sales', href: '/erp/sales' },
  ] },
  // ПРОЧИЕ ОПЕРАЦИИ: Проект / Тендер / Услуга.
  { title: 'Прочие операции', icon: '📄', zone: 'income', items: [
    { label: '📁 Проект', screenKey: 'other_ops', href: '/erp/invoices?section=other&kind=Проект' },
    { label: '📜 Тендер', screenKey: 'other_ops', href: '/erp/invoices?section=other&kind=Тендер' },
    { label: '🛠 Услуга', screenKey: 'other_ops', href: '/erp/invoices?section=other&kind=Услуга' },
  ] },

  // ── Зона «Операции и учёт» (sky) · под-раздел «Операционные» ──
  { title: 'Расходы', icon: '💸', zone: 'ops', divider: 'Операционные', items: [
    { label: 'Журнал расходов', screenKey: 'expenses', href: '/erp/expenses' },
    { label: 'Категории', screenKey: 'expenses', href: '/erp/expenses?tab=cats' },
    { label: 'Аналитика', screenKey: 'expenses', href: '/erp/reports?kind=expenses' },
  ] },
  { title: 'Бухгалтерия', icon: '📒', zone: 'ops', items: [
    { label: 'Документы', screenKey: 'accounting', href: '/erp/documents' },
  ] },
  { title: 'Финансы', icon: '💳', zone: 'ops', items: [
    { label: 'Счета и операции', screenKey: 'finance', href: '/erp/finance' },
  ] },
  { title: 'Долги', icon: '💳', zone: 'ops', items: [
    { label: 'Дебиторка / Кредиторка', screenKey: 'debts', href: '/erp/debts' },
  ] },
  { title: 'Задачи', icon: '✅', zone: 'ops', items: [
    { label: 'Задачи сотрудникам', screenKey: 'tasks', href: '/erp/tasks' },
  ] },
  { title: 'Склад', icon: '🏭', zone: 'ops', items: [
    { label: 'Журнал склада', screenKey: 'warehouse', href: '/erp/warehouse' },
    { label: '🛒 Закупки', screenKey: 'purchases', href: '/erp/purchases' },
  ] },
  { title: 'Сотрудники', icon: '👥', zone: 'ops', items: [
    { label: 'Руководитель', screenKey: 'staff', href: '/erp/staff/directory' },
    { label: 'Зарплата и кадры', screenKey: 'staff', href: '/erp/staff' },
  ] },

  // ── под-раздел «Финансы и учёт» ──
  { title: 'Счета', icon: '🧾', zone: 'ops', divider: 'Финансы и учёт', items: [
    { label: '№1 📋 Поверка', screenKey: 'invoices', href: '/erp/invoices?section=poverka' },
    { label: '№2 💰 Продажа', screenKey: 'invoices', href: '/erp/invoices?section=sale' },
    { label: '№3 🏢 Филиалы', screenKey: 'invoices', href: '/erp/invoices?section=branch' },
    { label: '№4 📄 Прочие операции', screenKey: 'invoices', href: '/erp/invoices?section=other' },
  ] },
  { title: 'База данных', icon: '🗄', zone: 'ops', items: [
    { label: 'База данных', screenKey: 'database', href: '/erp/database' },
  ] },

  // ── под-раздел «Аналитика» ──
  { title: 'Отчёт', icon: '📊', zone: 'ops', divider: 'Аналитика', items: [
    { label: 'Отчёты', screenKey: 'reports', href: '/erp/reports' },
  ] },
  { title: 'Справочник', icon: '📖', zone: 'ops', items: [
    { label: 'Справочники', screenKey: 'handbook', href: '/erp/handbook' },
  ] },

  // ── под-раздел «Система» ──
  { title: 'Настройка', icon: '⚙️', zone: 'ops', divider: 'Система', items: [
    { label: 'Настройки', screenKey: 'settings', href: '/erp/settings' },
    { label: 'Доступы', screenKey: 'settings', href: '/erp/access' },
    { label: 'Организация', screenKey: 'settings', href: '/erp/settings/org' },
    { label: 'Филиалы', screenKey: 'settings', href: '/erp/settings/branches' },
    { label: 'Пользователи', screenKey: 'settings', href: '/erp/settings/users' },
    { label: 'Клиенты', screenKey: 'clients', href: '/erp/clients' },
    { label: '📱 Кабинет мастера', screenKey: 'settings', href: '/master', external: true },
    { label: '📱 Кабинет директора', screenKey: 'settings', href: '/director', external: true },
  ] },
];
