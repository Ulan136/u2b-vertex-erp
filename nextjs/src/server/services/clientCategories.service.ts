import { clientCategoriesRepo } from '@/server/repositories/clientCategories.repo';
import { clientsRepo } from '@/server/repositories/clients.repo';
import { categoryCreateSchema, categoryUpdateSchema } from '@/server/dto/clients.dto';
import { badRequest, notFound, conflict } from '@/server/lib/errors';

export const clientCategoriesService = {
  list: () => clientCategoriesRepo.list(),

  async create(input: unknown) {
    const data = categoryCreateSchema.parse(input);
    const dup = await clientCategoriesRepo.findByName(data.name);
    if (dup) throw conflict('Категория с таким названием уже есть');
    return clientCategoriesRepo.create(data);
  },

  async update(id: string, input: unknown) {
    if (!id) throw badRequest('id обязателен');
    const data = categoryUpdateSchema.parse(input);
    const existing = await clientCategoriesRepo.findById(id);
    if (!existing) throw notFound('Категория не найдена');
    const dup = await clientCategoriesRepo.findByName(data.name);
    if (dup && dup.id !== id) throw conflict('Категория с таким названием уже есть');
    const row = await clientCategoriesRepo.update(id, data);
    if (!row) throw notFound('Категория не найдена');
    return row;
  },

  // Delete a category → its clients fall back to "без категории" (category_id → null).
  async remove(id: string) {
    if (!id) throw badRequest('id обязателен');
    await clientsRepo.clearCategory(id);
    await clientCategoriesRepo.remove(id);
    return { ok: true };
  },
};
