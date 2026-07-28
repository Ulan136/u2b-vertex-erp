import { debtCategoriesRepo } from '@/server/repositories/debtCategories.repo';
import { badRequest, notFound } from '@/server/lib/errors';

// Плоские категории долгов; ведёт пользователь сам (без базовых/предзаполнения).
async function list() {
  const all = await debtCategoriesRepo.listAll();
  return all.map(c => ({ id: c.id, name: c.name, icon: c.icon || '📁' }));
}
async function create(input: unknown) {
  const data = (input ?? {}) as { name?: string; icon?: string };
  const name = String(data.name || '').trim();
  if (!name) throw badRequest('Название обязательно');
  const all = await debtCategoriesRepo.listAll();
  if (all.some(c => c.name.toLowerCase() === name.toLowerCase())) throw badRequest('Уже существует');
  return debtCategoriesRepo.create({ name, icon: data.icon || '📁', sortOrder: all.length });
}
async function update(id: string, input: unknown) {
  const data = (input ?? {}) as { name?: string; icon?: string };
  const row = await debtCategoriesRepo.findById(id);
  if (!row) throw notFound('Категория не найдена');
  const patch: Record<string, unknown> = {};
  if (data.icon !== undefined) patch.icon = String(data.icon).slice(0, 8) || '📁';
  if (data.name !== undefined) { const n = String(data.name).trim(); if (!n) throw badRequest('Название обязательно'); patch.name = n; }
  return debtCategoriesRepo.update(id, patch);
}
async function remove(id: string) {
  const row = await debtCategoriesRepo.findById(id);
  if (!row) throw notFound('Категория не найдена');
  await debtCategoriesRepo.remove(id);
  return { ok: true };
}
export const debtCategoriesService = { list, create, update, remove };
