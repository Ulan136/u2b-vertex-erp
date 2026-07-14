import { clientsRepo, type ClientListFilter } from '@/server/repositories/clients.repo';
import { clientCategoriesRepo } from '@/server/repositories/clientCategories.repo';
import {
  clientCreateSchema, clientUpdateSchema,
  normalizePhone, assertCategoryInBranch,
} from '@/server/dto/clients.dto';
import { badRequest, notFound } from '@/server/lib/errors';

// Validate that categoryId (if given) exists and belongs to `branchId`.
async function checkCategory(branchId: string, categoryId: string | null | undefined) {
  if (categoryId == null) return;
  const cat = await clientCategoriesRepo.findById(categoryId);
  assertCategoryInBranch(cat, branchId, categoryId);
}

export const clientsService = {
  list(filter: { branchId?: string | null; categoryId?: string | null; q?: string | null }) {
    if (!filter.branchId) throw badRequest('branchId (филиал) обязателен');
    return clientsRepo.list(filter as ClientListFilter);
  },

  async create(input: unknown) {
    const data = clientCreateSchema.parse(input);
    await checkCategory(data.branchId, data.categoryId);
    return clientsRepo.create({
      branchId: data.branchId,
      name: data.name,
      phone: normalizePhone(data.phone),
      categoryId: data.categoryId ?? null,
    });
  },

  async update(id: string, input: unknown) {
    if (!id) throw badRequest('id обязателен');
    const data = clientUpdateSchema.parse(input);
    const existing = await clientsRepo.findById(id);
    if (!existing) throw notFound('Клиент не найден');

    // category is re-validated against the client's (immutable) branch
    if (data.categoryId !== undefined) await checkCategory(existing.branchId, data.categoryId);

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.phone !== undefined) patch.phone = normalizePhone(data.phone);
    if (data.categoryId !== undefined) patch.categoryId = data.categoryId ?? null;

    const row = await clientsRepo.update(id, patch);
    if (!row) throw notFound('Клиент не найден');
    return row;
  },

  async remove(id: string) {
    if (!id) throw badRequest('id обязателен');
    await clientsRepo.remove(id);
    return { ok: true };
  },
};
