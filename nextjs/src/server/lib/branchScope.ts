// Изоляция кабинета филиала (роль 'branch'). Два механизма:
//   1. Филиал → финансовый раздел (Астана='branch', Алматы='branch_almaty').
//   2. Белый список API: филиал может дёргать ТОЛЬКО свои эндпоинты, всё
//      «компанейское» (общие финансы/продажи/склад/…) закрыто на сервере —
//      даже прямым запросом. Дополняет экранный гейт (BRANCH_SCREENS).

// Филиал → раздел финансов. По названию/городу (устойчиво к смене id).
// Головной (Тараз) и прочие → null: у них нет филиального раздела.
export function branchFinanceSection(branch: { name?: string | null; city?: string | null } | null | undefined): string | null {
  const s = `${branch?.name || ''} ${branch?.city || ''}`.toLowerCase();
  if (/алмат/.test(s)) return 'branch_almaty';
  if (/астан/.test(s)) return 'branch';
  return null;
}

// Разрешённые для роли 'branch' API-префиксы. Всё остальное под /api/v2/* —
// закрыто (403). Заявки/сертификаты дополнительно скоупятся по branchId в своих
// сервисах; сюда попадают и служебные справочники, нужные формам (клиенты,
// типы приборов, филиалы, реквизиты — только чтение общих справочников).
const BRANCH_API_ALLOW: readonly string[] = [
  '/api/v2/branch',            // ← весь скоуп-кабинет филиала (финансы/расходы/переводы)
  '/api/v2/orders',            // свои заявки (скоуп по branchId в orders.service)
  '/api/v2/certs',             // свои серт/извещения (скоуп по branchId)
  '/api/v2/device-types',      // справочник типов приборов (форма серта)
  '/api/v2/clients',           // клиенты/покупатели (общий справочник, нужен формам)
  '/api/v2/client-categories',
  '/api/v2/branches',          // селект «Филиал» (GET открыт всем)
  '/api/v2/org',               // реквизиты для печати (чтение)
  '/api/v2/handbook',
];

// Явно закрытые для филиала «компанейские» эндпоинты (даже если session-only,
// т.е. не имеют экранного гейта — напр. /api/v2/finance). Приоритетнее allow.
const BRANCH_API_DENY: readonly string[] = [
  '/api/v2/finance',           // общие счета/операции ВСЕЙ компании → только через /api/v2/branch/*
  '/api/v2/sales', '/api/v2/purchases', '/api/v2/products', '/api/v2/expenses',
  '/api/v2/debts', '/api/v2/reports', '/api/v2/staff', '/api/v2/employees',
  '/api/v2/documents', '/api/v2/invoices', '/api/v2/tasks', '/api/v2/accounting',
  '/api/v2/role-permissions', '/api/v2/roles', '/api/v2/users',
];

// Можно ли роли 'branch' обратиться к этому пути. deny > allow > (по умолчанию нет).
export function branchApiAllowed(pathname: string): boolean {
  if (BRANCH_API_DENY.some(p => pathname === p || pathname.startsWith(p + '/'))) return false;
  return BRANCH_API_ALLOW.some(p => pathname === p || pathname.startsWith(p + '/'));
}
