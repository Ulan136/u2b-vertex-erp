import { db, type Executor } from '@/db';
import { productsRepo } from '@/server/repositories/products.repo';
import { stockMovementSchema, productUpdateSchema, STOCK_SIGN, canApplyStock } from '@/server/dto/products.dto';
import { badRequest, notFound } from '@/server/lib/errors';

export { STOCK_SIGN };
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
  if (!canApplyStock(current, data.moveType, qty)) {
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
  // Приход обновляет себестоимость товара (последняя цена закупки).
  if (data.moveType === 'IN' && price > 0) {
    await productsRepo.update(product.id, { costPrice: money(price) }, exec);
  }
  return movement;
}

export const productsService = {
  list: () => productsRepo.listActive(),
  movements: (limit?: number, type?: string | null, from?: string | null, to?: string | null) =>
    productsRepo.listMovements(limit, type, from, to),

  // Сводка Приход/Расход по SKU за период (только чтение) — числа приведены к number.
  async movementsSummary(from?: string | null, to?: string | null) {
    const rows = await productsRepo.movementsSummary(from, to);
    return rows.map(r => ({
      skuCode: r.skuCode,
      inQty: Number(r.inQty) || 0,
      outQty: Number(r.outQty) || 0,
      revPlus: Number(r.revPlus) || 0,
      revMinus: Number(r.revMinus) || 0,
    }));
  },

  // Правка карточки товара (наименование/мин.остаток/цены/тип воды/группа).
  async update(id: string, input: unknown) {
    const d = productUpdateSchema.parse(input);
    const patch: Record<string, unknown> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.fullName !== undefined) patch.fullName = d.fullName || null;
    if (d.minStock !== undefined) patch.minStock = d.minStock;
    if (d.price !== undefined) patch.price = money(Number(d.price) || 0);
    if (d.priceDiscount !== undefined) patch.priceDiscount = money(Number(d.priceDiscount) || 0);
    if (d.costPrice !== undefined) patch.costPrice = money(Number(d.costPrice) || 0);
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

  // Автосписание клейма-расходника при создании ПОВЕРКИ: OUT 1 шт. выбранного
  // клейма (СЛ→лейбл, ПЛ→пломбо). Backorder разрешён — поверка НЕ падает из-за
  // нуля на складе, остаток просто уходит вниз (на складе это подсветится ⚠).
  // Если расходник не заведён — молча пропускаем. Вызывается внутри tx поверки.
  async consumeSeal(marker: string, cert: { id: string; serialNo?: string | null }, actor: { id: string; name?: string } | null | undefined, exec: Executor) {
    const product = await productsRepo.findConsumableByMarker(marker, exec);
    if (!product) return null;
    const price = Number(product.costPrice ?? product.price ?? 0);
    const mv = await productsRepo.createMovement({
      productId: product.id, skuCode: product.skuCode, productName: product.name,
      moveType: 'OUT', qty: 1, price: money(price), totalSum: money(price),
      certId: cert.id,
      comment: `Поверка${cert.serialNo ? ' №' + cert.serialNo : ''} — клеймо ${marker}`,
      author: actor?.name ?? null, createdBy: actor?.id ?? null,
    }, exec);
    await productsRepo.adjustStock(product.id, -1, exec);
    return mv;
  },

  // Возврат расходников при удалении поверки: откатываем влияние каждого движения
  // на остаток и удаляем строку (иначе FK cert_id не даст удалить сертификат).
  async releaseCertConsumables(certId: string, exec: Executor) {
    const mvs = await productsRepo.movementsByCert(certId, exec);
    for (const m of mvs) {
      const sign = STOCK_SIGN[m.moveType] ?? 0;
      if (sign) await productsRepo.adjustStock(m.productId, -sign * Number(m.qty), exec);
      await productsRepo.deleteMovement(m.id, exec);
    }
  },
};
