import { db, type Executor } from '@/db';
import { products, stockMovements } from '@/db/schema';
import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';

type MovementInsert = typeof stockMovements.$inferInsert;

export const productsRepo = {
  listActive: () =>
    db.select().from(products).where(eq(products.isActive, true)).orderBy(asc(products.skuCode)),

  async findById(id: string, exec: Executor = db) {
    const [row] = await exec.select().from(products).where(eq(products.id, id)).limit(1);
    return row ?? null;
  },

  async findBySku(sku: string, exec: Executor = db) {
    const [row] = await exec.select().from(products).where(eq(products.skuCode, sku)).limit(1);
    return row ?? null;
  },

  // Завести новый товар (из закупа, когда SKU нет в базе).
  async createProduct(data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec.insert(products).values(data as unknown as typeof products.$inferInsert).returning();
    return row;
  },

  async findMovement(id: string, exec: Executor = db) {
    const [row] = await exec.select().from(stockMovements).where(eq(stockMovements.id, id)).limit(1);
    return row ?? null;
  },

  markMovementReversed: (id: string, exec: Executor = db) =>
    exec.update(stockMovements).set({ reversedAt: new Date() }).where(eq(stockMovements.id, id)),

  updateMovement: (id: string, data: Record<string, unknown>, exec: Executor = db) =>
    exec.update(stockMovements).set(data as Partial<MovementInsert>).where(eq(stockMovements.id, id)),

  // Все приходы одного мультипозиционного закупа (для отмены/удаления всей группой).
  movementsByPurchaseGroup: (group: string, exec: Executor = db) =>
    exec.select().from(stockMovements).where(eq(stockMovements.purchaseGroup, group)),

  async createMovement(data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec.insert(stockMovements).values(data as unknown as MovementInsert).returning();
    return row;
  },

  // Цена ПОСЛЕДНЕГО действующего прихода товара (по дате закупа move_date, при равной
  // дате — по времени внесения). Источник себестоимости products.cost_price.
  // Отменённые (reversed_at) и приходы без цены (price = 0) игнорируются.
  // Возвращает null, если действующих приходов с ценой нет.
  async latestInPrice(productId: string, exec: Executor = db): Promise<number | null> {
    const [row] = await exec.select({ price: stockMovements.price }).from(stockMovements)
      .where(and(
        eq(stockMovements.productId, productId),
        eq(stockMovements.moveType, 'IN'),
        isNull(stockMovements.reversedAt),
        sql`${stockMovements.price} > 0`,
      ))
      .orderBy(desc(stockMovements.moveDate), desc(stockMovements.createdAt))
      .limit(1);
    return row ? Number(row.price) : null;
  },

  // Расходник клейма по маркеру (СЛ/ПЛ): активный товар-расходник, в названии
  // которого есть «(СЛ)»/«(ПЛ)». Используется автосписанием при поверке.
  async findConsumableByMarker(marker: string, exec: Executor = db) {
    const [row] = await exec.select().from(products)
      .where(and(eq(products.isConsumable, true), eq(products.isActive, true),
        sql`${products.name} ilike ${'%(' + marker + ')%'}`))
      .limit(1);
    return row ?? null;
  },

  // Движения склада, привязанные к сертификату (для возврата при удалении поверки).
  movementsByCert: (certId: string, exec: Executor = db) =>
    exec.select().from(stockMovements).where(eq(stockMovements.certId, certId)),

  deleteMovement: (id: string, exec: Executor = db) =>
    exec.delete(stockMovements).where(eq(stockMovements.id, id)),

  // Сдвиг остатка (delta может быть отрицательным). Остаток = products.current_stock,
  // ведётся движениями (как баланс счёта в финансах).
  adjustStock: (id: string, delta: number, exec: Executor = db) =>
    exec.update(products)
      .set({ currentStock: sql`${products.currentStock} + ${delta}`, updatedAt: new Date() })
      .where(eq(products.id, id)),

  // Правка карточки товара (наименование/мин/цены/тип воды/группа).
  async update(id: string, data: Record<string, unknown>, exec: Executor = db) {
    const [row] = await exec.update(products).set({ ...(data as Partial<typeof products.$inferInsert>), updatedAt: new Date() }).where(eq(products.id, id)).returning();
    return row ?? null;
  },

  listMovements: (limit = 60, type?: string | null, from?: string | null, to?: string | null) => {
    const conds = [];
    if (type) conds.push(eq(stockMovements.moveType, type as typeof stockMovements.$inferSelect.moveType));
    if (from) conds.push(gte(stockMovements.moveDate, from));
    if (to) conds.push(lte(stockMovements.moveDate, to));
    return db.select().from(stockMovements)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.moveDate)).limit(limit);
  },

  // Сводка движений по SKU за период (ТОЛЬКО чтение): Приход = Σ IN, Расход = Σ OUT,
  // ревизии отдельно. Ничего не пишет — для колонок Приход/Расход на экране остатков.
  movementsSummary: (from?: string | null, to?: string | null) => {
    const conds = [];
    if (from) conds.push(gte(stockMovements.moveDate, from));
    if (to) conds.push(lte(stockMovements.moveDate, to));
    return db.select({
      skuCode : stockMovements.skuCode,
      inQty   : sql<number>`coalesce(sum(case when ${stockMovements.moveType} = 'IN'   then ${stockMovements.qty} else 0 end), 0)`,
      outQty  : sql<number>`coalesce(sum(case when ${stockMovements.moveType} = 'OUT'  then ${stockMovements.qty} else 0 end), 0)`,
      revPlus : sql<number>`coalesce(sum(case when ${stockMovements.moveType} = 'REV+' then ${stockMovements.qty} else 0 end), 0)`,
      revMinus: sql<number>`coalesce(sum(case when ${stockMovements.moveType} = 'REV-' then ${stockMovements.qty} else 0 end), 0)`,
    }).from(stockMovements).where(conds.length ? and(...conds) : undefined).groupBy(stockMovements.skuCode);
  },
};
