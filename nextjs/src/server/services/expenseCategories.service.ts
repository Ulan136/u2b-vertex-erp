import { expenseCategoriesRepo } from '@/server/repositories/expenseCategories.repo';
import { badRequest, notFound } from '@/server/lib/errors';

// Базовая категория «Зарплата» (с особой логикой выплат) всегда присутствует и не удаляется.
const BASE = { name: 'Зарплата', icon: '👤', subs: ['Основная з/п', 'Премии', 'Командировочные'] };

async function ensureBase() {
  const all = await expenseCategoriesRepo.listAll();
  const hasSalary = all.some(c => !c.parentId && c.name === BASE.name);
  if (!hasSalary) {
    const parent = await expenseCategoriesRepo.create({ name: BASE.name, icon: BASE.icon, sortOrder: 0 });
    let i = 1;
    for (const s of BASE.subs) await expenseCategoriesRepo.create({ name: s, parentId: parent!.id, sortOrder: i++ });
  }
}

// Дерево категорий: [{ id, name, icon, base, subs:[{id,name}] }] — «Зарплата» первой.
async function tree() {
  await ensureBase();
  const all = await expenseCategoriesRepo.listAll();
  const parents = all.filter(c => !c.parentId);
  const childrenByParent: Record<string, typeof all> = {};
  all.filter(c => c.parentId).forEach(c => { (childrenByParent[c.parentId!] ||= []).push(c); });
  parents.sort((a, b) =>
    (a.name === BASE.name ? -1 : b.name === BASE.name ? 1 : 0) ||
    (Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)) ||
    a.name.localeCompare(b.name));
  return parents.map(p => ({
    id: p.id, name: p.name, icon: p.icon || '📦', color: p.color,
    base: p.name === BASE.name,
    subs: (childrenByParent[p.id] || []).map(c => ({ id: c.id, name: c.name })),
  }));
}

async function create(input: unknown) {
  const data = (input ?? {}) as { name?: string; icon?: string; parentId?: string | null };
  const name = String(data.name || '').trim();
  if (!name) throw badRequest('Название обязательно');
  const parentId = data.parentId || null;
  const all = await expenseCategoriesRepo.listAll();
  if (parentId && !all.some(c => c.id === parentId)) throw notFound('Родительская категория не найдена');
  if (all.some(c => (c.parentId || null) === parentId && c.name.toLowerCase() === name.toLowerCase())) {
    throw badRequest('Уже существует');
  }
  return expenseCategoriesRepo.create({ name, parentId, icon: data.icon || '📦' });
}

async function remove(id: string) {
  const row = await expenseCategoriesRepo.findById(id);
  if (!row) throw notFound('Категория не найдена');
  if (!row.parentId && row.name === BASE.name) throw badRequest('Базовую категорию «Зарплата» удалить нельзя');
  await expenseCategoriesRepo.removeChildren(id);   // снести подкатегории
  await expenseCategoriesRepo.remove(id);
  return { ok: true };
}

export const expenseCategoriesService = { tree, create, remove };
