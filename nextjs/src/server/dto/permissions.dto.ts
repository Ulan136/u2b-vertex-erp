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

// ── Zod schema ────────────────────────────────────────────────
export const permissionUpsertSchema = z.object({
  role: z.enum(ROLES),
  screenKey: z.enum(SCREEN_KEYS),
  allowed: z.boolean(),
});

export type PermissionUpsert = z.infer<typeof permissionUpsertSchema>;
