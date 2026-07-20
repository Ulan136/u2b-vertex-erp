import { productsRepo } from '@/server/repositories/products.repo';
import { stockMovementSchema } from '@/server/dto/products.dto';
import { badRequest, notFound } from '@/server/lib/errors';

// Знак движения для остатка: приход/ревизия+ увеличивают, расход/ревизия− уменьшают.
export const STOCK_SIGN: Record<string, number> = { 'IN': 1, 'REV+': 1, 'OUT': -1, 'REV-': -1 };
const money = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

export const productsService = {
  list: () => productsRepo.listActive(),
  movements: (limit?: number) => productsRepo.listMovements(limit),

  // Провести движение склада + сдвинуть остаток товара.
  async createMovement(input: unknown, actor?: { id: string; name?: string } | null) {
    const data = stockMovementSchema.parse(input);
    const product = await productsRepo.findById(String(data.productId));
    if (!product) throw notFound('Товар не найден');
    const qty = Math.abs(Number(data.qty) || 0);
    if (qty <= 0) throw badRequest('Количество должно быть больше 0');
    const sign = STOCK_SIGN[data.moveType] ?? 0;
    if (!sign) throw badRequest('Неизвестный тип движения');
    const price = Number(data.price ?? product.price ?? 0);

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
    });
    await productsRepo.adjustStock(product.id, sign * qty);
    return movement;
  },
};
