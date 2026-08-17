import bcrypt from 'bcryptjs';
import { usersRepo } from '@/server/repositories/users.repo';
import {
  userCreateSchema, userUpdateSchema, normalizePhone, assertCanDeactivate,
} from '@/server/dto/users.dto';
import { badRequest, notFound, conflict } from '@/server/lib/errors';

export const usersService = {
  // default: active users (assignee pickers). all=true → full management list.
  list: (all?: boolean) => (all ? usersRepo.listAll() : usersRepo.listActive()),

  async create(input: unknown) {
    const data = userCreateSchema.parse(input);
    const phone = normalizePhone(data.phone);
    // email в БД NOT NULL UNIQUE, но вход возможен и по телефону. Если почты нет —
    // генерим тех.заглушку из телефона (вход по телефону работает как обычно).
    const email = (data.email && data.email.trim())
      ? data.email.trim().toLowerCase()
      : (phone ? `${phone.replace(/\D/g, '')}@phone.local` : '');
    if (!email) throw conflict('Укажите email или телефон');
    if (await usersRepo.findByEmail(email)) throw conflict('Пользователь с таким email/телефоном уже есть');
    return usersRepo.create({
      name: data.name,
      phone,
      position: data.position ?? null,
      role: data.role,
      branchId: data.branchId ?? null,
      email,
      passwordHash: await bcrypt.hash(data.password, 10),
      isActive: true,
    });
  },

  async update(id: string, input: unknown, actingUserId?: string | null) {
    if (!id) throw badRequest('id обязателен');
    const data = userUpdateSchema.parse(input);
    const existing = await usersRepo.findById(id);
    if (!existing) throw notFound('Пользователь не найден');

    // Guard deactivation (self + last active admin). actingUserId is the
    // session user (trusted), falling back to the payload if provided.
    if (data.isActive === false) {
      assertCanDeactivate({
        targetId: id,
        targetRole: existing.role,
        targetActive: existing.isActive ?? false,
        activeAdminCount: await usersRepo.countActiveAdmins(),
        actingUserId: actingUserId ?? data.actingUserId ?? null,
      });
    }

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.phone !== undefined) patch.phone = normalizePhone(data.phone);
    if (data.position !== undefined) patch.position = data.position ?? null;
    if (data.role !== undefined) patch.role = data.role;              // role change applies immediately
    if (data.branchId !== undefined) patch.branchId = data.branchId ?? null;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    if (data.email !== undefined && data.email !== existing.email) {
      const dup = await usersRepo.findByEmail(data.email);
      if (dup && dup.id !== id) throw conflict('Пользователь с таким email уже есть');
      patch.email = data.email;
    }
    if (data.password) patch.passwordHash = await bcrypt.hash(data.password, 10);

    const row = await usersRepo.update(id, patch);
    if (!row) throw notFound('Пользователь не найден');
    return row;
  },

  // Сброс/установка пароля админом (экран «Управление паролями»). Пароль всегда
  // хэшируется (bcrypt) — текущий пароль нигде не хранится в открытом виде и не
  // возвращается. Жёсткая проверка role=admin выполняется в контроллере.
  async setPassword(id: string, input: unknown) {
    if (!id) throw badRequest('id обязателен');
    const password = String((input as { password?: unknown } | null)?.password ?? '');
    if (password.length < 4) throw badRequest('Пароль минимум 4 символа');
    const existing = await usersRepo.findById(id);
    if (!existing) throw notFound('Пользователь не найден');
    const row = await usersRepo.update(id, { passwordHash: await bcrypt.hash(password, 10) });
    if (!row) throw notFound('Пользователь не найден');
    return { ok: true, id: row.id, name: row.name };
  },
};
