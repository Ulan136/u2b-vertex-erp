import { z } from 'zod';

// ── Roles (latin keys stored in DB, Russian labels shown in UI) ──
export const ROLES = ['admin', 'director', 'accountant', 'manager', 'master'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS_RU: Record<Role, string> = {
  admin: 'Админ',
  director: 'Директор',
  accountant: 'Бухгалтер',
  manager: 'Менеджер',
  master: 'Мастер',
};

// ── Screen catalog (one key per screen/section of the app) ────
export const SCREEN_KEYS = [
  'dashboard',
  'poverka_sami', 'poverka_vdk', 'poverka_tec', 'poverka_field', 'poverka_primary', 'poverka_astana',
  'orders_field', 'orders_tec',
  'sales', 'other_ops', 'expenses', 'accounting', 'debts', 'tasks',
  'warehouse', 'purchases', 'staff', 'clients', 'invoices', 'database',
  'reports', 'handbook', 'settings',
] as const;
export type ScreenKey = (typeof SCREEN_KEYS)[number];

// Русские подписи экранов (для матрицы «Доступы»). Ключи = SCREEN_KEYS.
export const SCREEN_LABELS: Record<ScreenKey, string> = {
  dashboard: 'Рабочий стол',
  poverka_sami: 'Поверка · САМИ', poverka_vdk: 'Поверка · ВДК', poverka_tec: 'Поверка · ТЭЦ',
  poverka_field: 'Поверка · Выездная', poverka_primary: 'Поверка · Первичная', poverka_astana: 'Поверка · Астана',
  orders_field: 'Заявки · Выездная', orders_tec: 'Заявки · ТЭЦ',
  sales: 'Продажа', other_ops: 'Прочие операции', expenses: 'Расходы', accounting: 'Бухгалтерия',
  debts: 'Долги', tasks: 'Задачи', warehouse: 'Склад', purchases: 'Закупки', staff: 'Сотрудники',
  clients: 'Клиенты', invoices: 'Счета', database: 'База данных', reports: 'Отчёт', handbook: 'Справочник', settings: 'Настройки',
};

// ── Pure helpers (no DB) — unit-testable ──────────────────────

// Migrate an old role key to the new set. Nobody is lost:
//   warehouse → master, buyer → manager, field → master; known roles kept;
//   anything unexpected falls back to manager.
export function migrateRole(old: string): Role {
  switch (old) {
    case 'admin': case 'director': case 'accountant': case 'manager': case 'master':
      return old;
    case 'warehouse': case 'field':
      return 'master';
    case 'buyer':
      return 'manager';
    default:
      return 'manager';
  }
}

export type PermRow = { role: string; screenKey: string; allowed: boolean };

// Access rule used by BOTH menu filtering and URL/route guarding:
//   - Админ always has full access (never restricted),
//   - no record for (role, screen) ⇒ allowed (default),
//   - otherwise the record's `allowed` flag decides.
export function isScreenAllowed(role: string, screenKey: string, perms: PermRow[]): boolean {
  if (role === 'admin') return true;
  const rec = perms.find(p => p.role === role && p.screenKey === screenKey);
  return rec ? rec.allowed : true;
}

// Screens a role may see (menu = this list; a URL not in it is denied).
export function visibleScreenKeys(role: string, perms: PermRow[], keys: readonly string[] = SCREEN_KEYS): string[] {
  return keys.filter(k => isScreenAllowed(role, k, perms));
}

// Landing screen per role after login. If it is denied by the matrix, fall back
// to the first screen the role is allowed to see.
export const START_SCREEN_BY_ROLE: Record<string, string> = {
  admin: 'dashboard',
  director: 'dashboard',
  manager: 'orders_field',
  master: 'orders_field',
  accountant: 'sales',
};

export function startScreenKey(role: string, perms: PermRow[], keys: readonly string[] = SCREEN_KEYS): string {
  const preferred = START_SCREEN_BY_ROLE[role] ?? 'dashboard';
  if (isScreenAllowed(role, preferred, perms)) return preferred;
  const visible = visibleScreenKeys(role, perms, keys);
  return visible[0] ?? 'dashboard';
}

// ── Zod schema ────────────────────────────────────────────────
export const permissionUpsertSchema = z.object({
  role: z.enum(ROLES),
  screenKey: z.enum(SCREEN_KEYS),
  allowed: z.boolean(),
});

export type PermissionUpsert = z.infer<typeof permissionUpsertSchema>;
