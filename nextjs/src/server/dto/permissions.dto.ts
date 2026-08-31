import { z } from 'zod';

// ── Roles (latin keys stored in DB, Russian labels shown in UI) ──
export const ROLES = ['admin', 'director', 'accountant', 'manager', 'master', 'branch'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS_RU: Record<Role, string> = {
  admin: 'Админ',
  director: 'Директор',
  accountant: 'Бухгалтер',
  manager: 'Менеджер',
  master: 'Мастер',
  branch: 'Филиал',
};

// ── Screen catalog (one key per screen/section of the app) ────
export const SCREEN_KEYS = [
  'dashboard',
  'poverka_sami', 'poverka_vdk', 'poverka_tec', 'poverka_field', 'poverka_primary', 'poverka_astana',
  'orders_field', 'orders_tec',
  'sales', 'other_ops', 'expenses', 'accounting', 'finance', 'debts', 'tasks',
  'warehouse', 'purchases', 'staff', 'clients', 'invoices', 'database',
  'reports', 'handbook', 'settings',
  'branch_finance',   // кабинет филиала: свой счёт + расходы + переводы (изолировано по разделу)
] as const;
export type ScreenKey = (typeof SCREEN_KEYS)[number];

// Русские подписи экранов (для матрицы «Доступы»). Ключи = SCREEN_KEYS.
export const SCREEN_LABELS: Record<ScreenKey, string> = {
  dashboard: 'Рабочий стол',
  poverka_sami: 'Поверка · САМИ', poverka_vdk: 'Поверка · ВДК', poverka_tec: 'Поверка · ТЭЦ',
  poverka_field: 'Поверка · Выездная', poverka_primary: 'Поверка · Первичная', poverka_astana: 'Поверка · Астана (филиал)',
  orders_field: 'Заявки · Выездная', orders_tec: 'Заявки · ТЭЦ',
  sales: 'Продажа', other_ops: 'Прочие операции', expenses: 'Расходы', accounting: 'Бухгалтерия',
  finance: 'Финансы', debts: 'Долги', tasks: 'Задачи', warehouse: 'Склад', purchases: 'Закупки', staff: 'Сотрудники',
  clients: 'Клиенты', invoices: 'Счета', database: 'База данных', reports: 'Отчёт', handbook: 'Справочник', settings: 'Настройки',
  branch_finance: 'Финансы филиала',
};

// ── Роль «Филиал» (branch) — кабинет с жёстким белым списком экранов ──
// В отличие от остальных ролей (default = разрешено), филиал видит ТОЛЬКО эти
// экраны: свои выездные заявки/сертификаты/извещения (скоуп по branchId) и свои
// финансы (скоуп по разделу). Всё остальное закрыто — и в меню, и на API-гейте.
export const BRANCH_ROLE = 'branch';
export const BRANCH_SCREENS = ['orders_field', 'poverka_field', 'branch_finance'] as const;

// ── Pure helpers (no DB) — unit-testable ──────────────────────

// Migrate an old role key to the new set. Nobody is lost:
//   warehouse → master, buyer → manager, field → master; known roles kept;
//   anything unexpected falls back to manager.
export function migrateRole(old: string): Role {
  switch (old) {
    case 'admin': case 'director': case 'accountant': case 'manager': case 'master': case 'branch':
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
  // Экран кабинета филиала — только для роли 'branch' (даже Админу не показываем
  // в меню: у головного офиса нет филиального раздела).
  if (screenKey === 'branch_finance') return role === BRANCH_ROLE;
  if (role === 'admin') return true;
  // Филиал — жёсткий белый список: ничего, кроме BRANCH_SCREENS (матрица «Доступы»
  // может только СУЗИТЬ, но не расширить этот набор).
  if (role === BRANCH_ROLE) {
    if (!(BRANCH_SCREENS as readonly string[]).includes(screenKey)) return false;
    const rec = perms.find(p => p.role === role && p.screenKey === screenKey);
    return rec ? rec.allowed : true;
  }
  const rec = perms.find(p => p.role === role && p.screenKey === screenKey);
  return rec ? rec.allowed : true;
}

// Screens a role may see (menu = this list; a URL not in it is denied).
export function visibleScreenKeys(role: string, perms: PermRow[], keys: readonly string[] = SCREEN_KEYS): string[] {
  return keys.filter(k => isScreenAllowed(role, k, perms));
}

// ── Видимость категорий расходов по ролям (та же таблица role_permissions) ──
// Ключ права категории = `expcat:<id>`. Управляется в «Настройки → Доступы».
export const CATEGORY_PERM_PREFIX = 'expcat:';
export const categoryPermKey = (catId: string) => `${CATEGORY_PERM_PREFIX}${catId}`;
export const isCategoryPermKey = (k: string) => k.startsWith(CATEGORY_PERM_PREFIX);
// Роли, которым исторически были видны «скрытые от менеджеров» категории
// (legacy managerHidden). Админ обрабатывается отдельно (всегда всё видит).
export const CATEGORY_FULL_ROLES = ['admin', 'accountant', 'director'];

// Видна ли роли категория расходов. Приоритет: явное право (галочка в карте) →
// иначе legacy-флаг managerHidden (скрыто от всех, кроме admin/accountant/director)
// → иначе видна. Так старое поведение сохраняется, пока админ не переопределит.
export function isCategoryVisible(role: string, catId: string, managerHidden: boolean, perms: PermRow[]): boolean {
  if (role === 'admin') return true;
  const rec = perms.find(p => p.role === role && p.screenKey === categoryPermKey(catId));
  if (rec) return rec.allowed;
  if (managerHidden) return CATEGORY_FULL_ROLES.includes(role);
  return true;
}

// Landing screen per role after login. If it is denied by the matrix, fall back
// to the first screen the role is allowed to see.
export const START_SCREEN_BY_ROLE: Record<string, string> = {
  admin: 'dashboard',
  director: 'dashboard',
  manager: 'orders_field',
  master: 'orders_field',
  accountant: 'sales',
  branch: 'orders_field',   // филиал приземляется на свои Заявки
};

export function startScreenKey(role: string, perms: PermRow[], keys: readonly string[] = SCREEN_KEYS): string {
  const preferred = START_SCREEN_BY_ROLE[role] ?? 'dashboard';
  if (isScreenAllowed(role, preferred, perms)) return preferred;
  const visible = visibleScreenKeys(role, perms, keys);
  return visible[0] ?? 'dashboard';
}

// ── Zod schema ────────────────────────────────────────────────
export const permissionUpsertSchema = z.object({
  role: z.string().min(1),          // системный или кастомный ключ роли
  // ключ экрана (SCREEN_KEYS) ИЛИ категории расходов (`expcat:<id>`)
  screenKey: z.string().min(1).max(60).refine(
    k => (SCREEN_KEYS as readonly string[]).includes(k) || (isCategoryPermKey(k) && k.length > CATEGORY_PERM_PREFIX.length),
    { message: 'Некорректный ключ доступа' }),
  allowed: z.boolean(),
});

export type PermissionUpsert = z.infer<typeof permissionUpsertSchema>;

// ── Roles (создание пользовательских ролей в «Доступах») ──────
// Латинский ключ роли генерируется из названия (для users.role / матрицы).
const TRANSLIT: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
  н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',
  ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
};
export function roleKeyFromLabel(label: string): string {
  const base = String(label || '').toLowerCase().split('').map(c => TRANSLIT[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  return base || 'role';
}
export const roleCreateSchema = z.object({ label: z.string().trim().min(2, 'Название минимум 2 символа').max(60) });
export const roleUpdateSchema = z.object({ label: z.string().trim().min(2, 'Название минимум 2 символа').max(60) });
export type RoleCreate = z.infer<typeof roleCreateSchema>;
