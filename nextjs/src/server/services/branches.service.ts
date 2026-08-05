import { db } from '@/db';
import { branchesRepo } from '@/server/repositories/branches.repo';
import { branchCreateSchema, branchUpdateSchema } from '@/server/dto/branches.dto';
import { badRequest, notFound } from '@/server/lib/errors';

export const branchesService = {
  list: (all?: boolean) => all ? branchesRepo.listAll() : branchesRepo.listActive(),

  async create(input: unknown) {
    const d = branchCreateSchema.parse(input);
    return db.transaction(async (tx) => {
      const row = await branchesRepo.create({ name: d.name, city: d.city || null, address: d.address || null, invoiceType: d.invoiceType, isHead: !!d.isHead, isActive: true }, tx);
      if (d.isHead) await branchesRepo.clearHeadExcept(row.id, tx);   // ровно один головной
      return row;
    });
  },

  async update(id: string, input: unknown) {
    const existing = await branchesRepo.get(id);
    if (!existing) throw notFound('Филиал не найден');
    const d = branchUpdateSchema.parse(input);
    // Нельзя оставить систему без головного (снять флаг у единственного головного).
    if (d.isHead === false && existing.isHead && (await branchesRepo.headCount(id)) === 0) {
      throw badRequest('Сначала назначьте другой головной филиал');
    }
    const patch: Record<string, unknown> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.city !== undefined) patch.city = d.city || null;
    if (d.address !== undefined) patch.address = d.address || null;
    if (d.invoiceType !== undefined) patch.invoiceType = d.invoiceType;
    if (d.isHead !== undefined) patch.isHead = d.isHead;
    if (d.isActive !== undefined) patch.isActive = d.isActive;
    return db.transaction(async (tx) => {
      const row = await branchesRepo.update(id, patch, tx);
      if (d.isHead === true) await branchesRepo.clearHeadExcept(id, tx);   // назначили головным → снять у прочих
      return row;
    });
  },

  async remove(id: string) {
    const existing = await branchesRepo.get(id);
    if (!existing) throw notFound('Филиал не найден');
    if (existing.isHead) throw badRequest('Головной филиал нельзя удалить. Сначала назначьте головным другой.');
    const u = await branchesRepo.usersCount(id);
    if (u > 0) throw badRequest(`В филиале есть сотрудники (${u}). Сначала переведите их в другой филиал.`);
    const o = await branchesRepo.ordersCount(id);
    if (o > 0) throw badRequest(`К филиалу привязаны заявки (${o}). Удалить нельзя.`);
    await branchesRepo.remove(id);
    return { ok: true };
  },
};
