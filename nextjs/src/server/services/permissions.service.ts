import { permissionsRepo } from '@/server/repositories/permissions.repo';
import { permissionUpsertSchema } from '@/server/dto/permissions.dto';
import { badRequest } from '@/server/lib/errors';

export const permissionsService = {
  list: () => permissionsRepo.list(),

  async upsert(input: unknown) {
    const data = permissionUpsertSchema.parse(input);
    // Админ always has full access — its permissions are never stored/changed.
    if (data.role === 'admin') throw badRequest('Роль «Админ» всегда имеет полный доступ');
    return permissionsRepo.upsert(data.role, data.screenKey, data.allowed);
  },
};
