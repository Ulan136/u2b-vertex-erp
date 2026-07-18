import { z } from 'zod';
import { ROLES } from '@/server/dto/permissions.dto';
import { normalizePhone } from '@/server/dto/clients.dto';
import { badRequest } from '@/server/lib/errors';

// Users normalize phone the same way clients do (+7XXXXXXXXXX).
export { normalizePhone };

// ── Deactivation guard (pure, unit-testable) ──────────────────
// Blocks two dangerous cases:
//   - deactivating yourself,
//   - deactivating the last active admin (would lock everyone out of admin).
export function assertCanDeactivate(opts: {
  targetId: string;
  targetRole: string;
  targetActive: boolean;
  activeAdminCount: number;      // active admins currently in the system (incl. target if active)
  actingUserId?: string | null;  // who performs the action (self-protection)
}): void {
  if (opts.actingUserId && opts.actingUserId === opts.targetId) {
    throw badRequest('Нельзя деактивировать самого себя');
  }
  if (opts.targetRole === 'admin' && opts.targetActive && opts.activeAdminCount <= 1) {
    throw badRequest('Нельзя деактивировать последнего активного администратора');
  }
}

// ── Zod schemas ───────────────────────────────────────────────
export const userCreateSchema = z.object({
  name: z.string().trim().min(1, 'ФИО обязательно'),
  phone: z.string().nullish(),
  position: z.string().nullish(),
  role: z.enum(ROLES),
  branchId: z.string().uuid().nullish(),   // филиал сотрудника
  email: z.string().trim().email('Некорректный email'),   // login
  password: z.string().min(4, 'Пароль минимум 4 символа'), // login
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().nullish(),
  position: z.string().nullish(),
  role: z.enum(ROLES).optional(),
  branchId: z.string().uuid().nullish(),   // филиал сотрудника
  email: z.string().trim().email().optional(),
  password: z.string().min(4).optional(),   // only rehashed when provided
  isActive: z.boolean().optional(),
  actingUserId: z.string().uuid().nullish(), // for the self-deactivation guard
});

export type UserCreate = z.infer<typeof userCreateSchema>;
export type UserUpdate = z.infer<typeof userUpdateSchema>;
