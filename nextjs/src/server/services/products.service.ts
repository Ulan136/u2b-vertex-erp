import { db, type Executor } from '@/db';
import { productsRepo } from '@/server/repositories/products.repo';
import { stockMovementSchema, productUpdateSchema } from '@/server/dto/products.dto';
import { badRequest, notFound } from '@/server/lib/errors';

// Знак движения для остатка: приход/ревизия+ увеличивают, расход/ревизия− уменьшают.
export const STOCK_SIGN: Record<string, number> = { 'IN': 1, 'REV+': 1, 'OUT': -1, 'REV-': -1 };
const money = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

// Провести движение склада + сдвинуть остаток товара — атомарно (движение и
// остаток фиксируются вместе). Запрет ухода остатка в минус.
async function doMovement(input: unknown, actor: { id: string; name?: string } | null | undefined, exec: Executor) {
  const data = stockMovementSchema.parse(input);
  const product = await productsRepo.findById(String(data.productId), exec);
  if (!product) throw notFound('Товар не найден');
  const qty = Math.abs(Number(data.qty) || 0);
  if (qty <= 0) throw badRequest('Количество должно быть больше 0');
  const sign = STOCK_SIGN[data.moveType] ?? 0;
  if (!sign) throw badRequest('Неизвестный тип движения');
  const price = Number(data.price ?? product.price ?? 0);

  // Запрет отрицательного остатка: списание не может увести current_stock ниже 0.
  const current = Number(product.currentStock) || 0;
  if (sign < 0 && current - qty < 0) {
    throw badRequest(`Недостаточно товара на складе «${product.name}»: остаток ${current}, требуется ${qty}`);
  }

  const movement = await productsRepo.createMovement({
    productId: product.id,
    skuCode: product.skuCode,
    productName: product.name,
    moveType: data.moveType,
    qty,
    price: money(price),
    totalSum: money(qty * price),
    supplier: data.supplier ?? null,
    docNo: data.docNo ?? null,
    comment: data.comment ?? null,
    author: data.author ?? actor?.name ?? null,
    moveDate: data.moveDate ?? undefined,
    createdBy: actor?.id ?? null,
  }, exec);
  await productsRepo.adjustStock(product.id, sign * qty, exec);
  return movement;
}

export const productsService = {
  list: () => productsRepo.listActive(),
  movements: (limit?: number, type?: string | null) => productsRepo.listMovements(limit, type),

  // Правка карточки товара (наименование/мин.остаток/цены/тип воды/группа).
  async update(id: string, input: unknown) {
    const d = productUpdateSchema.parse(input);
    const patch: Record<string, unknown> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.fullName !== undefined) patch.fullName = d.fullName || null;
    if (d.minStock !== undefined) patch.minStock = d.minStock;
    if (d.price !== undefined) patch.price = money(Number(d.price) || 0);
    if (d.priceDiscount !== undefined) patch.priceDiscount = money(Number(d.priceDiscount) || 0);
    if (d.waterType !== undefined) patch.waterType = d.waterType || null;
    if (d.groupId !== undefined) patch.groupId = d.groupId || null;
    const row = await productsRepo.update(id, patch);
    if (!row) throw notFound('Товар не найден');
    return row;
  },

  // exec передаётся, когда движение — часть внешней транзакции (напр. продажи);
  // иначе открываем свою, чтобы движение и остаток всегда были согласованы.
  async createMovement(input: unknown, actor?: { id: string; name?: string } | null, exec?: Executor) {
    return exec ? doMovement(input, actor, exec) : db.transaction((tx) => doMovement(input, actor, tx));
  },
};
