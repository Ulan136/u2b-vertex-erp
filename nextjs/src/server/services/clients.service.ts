import { clientsRepo, type ClientListFilter } from '@/server/repositories/clients.repo';
import { clientCategoriesRepo } from '@/server/repositories/clientCategories.repo';
import { clientCreateSchema, clientUpdateSchema, normalizePhone } from '@/server/dto/clients.dto';
import { badRequest, notFound } from '@/server/lib/errors';

// If a category is given, it must exist (organization-wide, no branch scoping).
async function checkCategory(categoryId: string | null | undefined) {
  if (categoryId == null) return;
  const cat = await clientCategoriesRepo.findById(categoryId);
  if (!cat) throw badRequest('Категория не найдена');
}

export const clientsService = {
  list(filter: ClientListFilter) {
    return clientsRepo.list(filter);
  },

  async create(input: unknown) {
    const data = clientCreateSchema.parse(input);
    await checkCategory(data.categoryId);
    return clientsRepo.create({
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

    if (data.categoryId !== undefined) await checkCategory(data.categoryId);

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
