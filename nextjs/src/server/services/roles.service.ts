import { rolesRepo } from '@/server/repositories/roles.repo';
import { roleCreateSchema, roleUpdateSchema, roleKeyFromLabel } from '@/server/dto/permissions.dto';
import { badRequest, notFound } from '@/server/lib/errors';

export const rolesService = {
  list: () => rolesRepo.list(),

  async create(input: unknown) {
    const { label } = roleCreateSchema.parse(input);
    // Уникальный латинский ключ из названия (на ключе завязаны users.role и права).
    const base = roleKeyFromLabel(label);
    let key = base, n = 1;
    while (await rolesRepo.get(key)) key = `${base}_${++n}`;
    return rolesRepo.create({ key, label });
  },

  async update(key: string, input: unknown) {
    if (!(await rolesRepo.get(key))) throw notFound('Роль не найдена');
    const { label } = roleUpdateSchema.parse(input);
    return rolesRepo.updateLabel(key, label);   // ключ не меняем — на нём висят сотрудники и права
  },

  async remove(key: string) {
    const existing = await rolesRepo.get(key);
    if (!existing) throw notFound('Роль не найдена');
    if (existing.isSystem) throw badRequest('Системную роль нельзя удалить');
    const cnt = await rolesRepo.usersCount(key);
    if (cnt > 0) throw badRequest(`Роль назначена сотрудникам (${cnt}). Сначала смените им роль.`);
    await rolesRepo.remove(key);
    return { ok: true };
  },
};
