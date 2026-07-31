import { z } from 'zod';
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
  role: z.string().min(1),   // ключ роли (системной или кастомной)
  branchId: z.string().uuid().nullish(),   // филиал сотрудника
  email: z.string().trim().optional(),   // логин: email ИЛИ телефон
  password: z.string().min(4, 'Пароль минимум 4 символа'), // login
})
  // Логин — email или телефон; хотя бы одно обязательно.
  .refine(d => (!!d.email && d.email.length > 0) || !!normalizePhone(d.phone),
    { message: 'Укажите email или телефон (это логин)', path: ['email'] })
  // Если email задан — он должен быть корректным.
  .refine(d => !d.email || d.email.length === 0 || z.string().email().safeParse(d.email).success,
    { message: 'Некорректный email', path: ['email'] });

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().nullish(),
  position: z.string().nullish(),
  role: z.string().min(1).optional(),
  branchId: z.string().uuid().nullish(),   // филиал сотрудника
  email: z.string().trim().email().optional(),
  password: z.string().min(4).optional(),   // only rehashed when provided
  isActive: z.boolean().optional(),
  actingUserId: z.string().uuid().nullish(), // for the self-deactivation guard
});

export type UserCreate = z.infer<typeof userCreateSchema>;
export type UserUpdate = z.infer<typeof userUpdateSchema>;
