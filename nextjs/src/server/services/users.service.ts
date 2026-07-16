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
    if (await usersRepo.findByEmail(data.email)) throw conflict('Пользователь с таким email уже есть');
    return usersRepo.create({
      name: data.name,
      phone: normalizePhone(data.phone),
      position: data.position ?? null,
      role: data.role,
      email: data.email,
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
};
