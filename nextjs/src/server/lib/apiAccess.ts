// API-level access mapping — pure, no DB, edge-safe (used by middleware + withApi).

// The ONLY API operations available without a session — everything the public
// client cabinets (Выездная + ТЭЦ) need: create an order and read the cabinet URL.
export function isCabinetPublicApi(method: string, pathname: string): boolean {
  if (method === 'POST' && pathname === '/api/v2/orders') return true;                 // cabinet submits an order
  if (method === 'GET' && pathname === '/api/v2/orders/external-url') return true;      // cabinet URL lookup
  if (method === 'OPTIONS') return true;                                                // preflight (same-origin has none)
  return false;
}

// Финансы — только чтение для всех, кроме Админа и Бухгалтера. GET открыт всем
// вошедшим (просмотр); создание/правка операций и счетов — admin/accountant.
export const FINANCE_WRITE_ROLES = ['admin', 'accountant'];
export function isFinanceWrite(method: string, pathname: string): boolean {
  if (method === 'GET' || method === 'OPTIONS') return false;
  return pathname === '/api/v2/finance' || pathname.startsWith('/api/v2/finance/accounts');
}
export function financeWriteAllowed(method: string, pathname: string, role?: string | null): boolean {
  if (!isFinanceWrite(method, pathname)) return true;               // не запись финансов → не ограничиваем
  return FINANCE_WRITE_ROLES.includes(role || '');
}

// Map an API request to a screen_key so the «Доступы» matrix is enforced at the
// API too. null → no specific screen (session-only). Endpoints that serve many
// screens (certs by direction, finance) stay session-only.
export function apiScreenFor(method: string, pathname: string, searchParams: URLSearchParams): string | null {
  if (pathname.startsWith('/api/v2/employees')) return 'staff';   // кадры/зарплата → раздел «Сотрудники»
  if (pathname.startsWith('/api/v2/expense-categories')) return 'expenses';   // категории расходов → «Расходы»
  if (pathname.startsWith('/api/v2/documents')) return 'accounting';          // документы → «Бухгалтерия»
  if (pathname === '/api/v2/org' || pathname.startsWith('/api/v2/org/')) {    // реквизиты: чтение всем, правка — «Настройки»
    return method === 'GET' ? null : 'settings';
  }
  if (pathname.startsWith('/api/v2/debts') || pathname.startsWith('/api/v2/debt-payments')) return 'debts';
  if (pathname.startsWith('/api/v2/tasks')) return 'tasks';
  if (pathname.startsWith('/api/v2/clients') || pathname.startsWith('/api/v2/client-categories')) return 'clients';
  if (pathname.startsWith('/api/v2/sales')) return 'sales';
  if (pathname.startsWith('/api/v2/products')) return 'warehouse';
  if (pathname.startsWith('/api/v2/role-permissions')) return 'settings';
  if (pathname === '/api/v2/users') {
    // GET активного списка (пикер исполнителей для задач) — доступен любому
    // вошедшему; полный список (?all) и создание — только «Настройки».
    return (method === 'GET' && !searchParams.get('all')) ? null : 'settings';
  }
  if (pathname.startsWith('/api/v2/users/')) return 'settings';   // правка/деактивация — «Настройки»
  if (pathname === '/api/v2/orders' && method === 'GET') {
    return searchParams.get('source') === 'tec' ? 'orders_tec' : 'orders_field';
  }
  // certificates list is per direction → gate by the matching poverka screen
  if (pathname === '/api/v2/certs' && method === 'GET') {
    const s = searchParams.get('source');
    const map: Record<string, string> = {
      'САМИ': 'poverka_sami', 'ВДК': 'poverka_vdk', 'ТЭЦ': 'poverka_tec',
      'Выездная': 'poverka_field', 'Первичная-КМ': 'poverka_primary',
      'Первичная-АК': 'poverka_primary', 'Астана': 'poverka_astana',
    };
    return (s && map[s]) || null;
  }
  return null;
}
