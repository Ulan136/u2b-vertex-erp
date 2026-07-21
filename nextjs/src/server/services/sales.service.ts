import { db } from '@/db';
import { salesRepo } from '@/server/repositories/sales.repo';
import { financeRepo } from '@/server/repositories/finance.repo';
import { productsService } from '@/server/services/products.service';
import { financeService } from '@/server/services/finance.service';
import { saleMutateSchema, normalizeItems, aggregateItems, type SaleItem } from '@/server/dto/sales.dto';
import { badRequest, notFound } from '@/server/lib/errors';

const m2 = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
// invoice_type — enum БД; произвольное имя счёта туда класть нельзя (иначе 500).
const INVOICE_TYPES = ['Каспи', 'БЦК', 'Наличка', 'Каспи Голд'];
const invType = (v: unknown) => (INVOICE_TYPES.includes(String(v)) ? String(v) : null);

type Actor = { id: string; name?: string } | null | undefined;
type SaleRow = { id: string; saleNo?: string | null; productId?: string | null; productName?: string | null; skuCode?: string | null; qty?: number | null; price?: string | number | null; totalSum?: string | number | null; items?: SaleItem[] | null; payStatus?: string | null; clientName?: string | null; clientType?: string | null; saleDate?: string | null; comment?: string | null; invoiceType?: string | null; cancelledAt?: Date | string | null };

// Позиции продажи: из jsonb items, иначе синтез из одиночных полей (старые записи).
function itemsOf(row: SaleRow): SaleItem[] {
  const it = row.items;
  if (Array.isArray(it) && it.length) return it;
  if (row.productId && Number(row.qty) > 0) {
    return [{ productId: row.productId, productName: row.productName ?? null, skuCode: row.skuCode ?? null, qty: Number(row.qty), price: Number(row.price) || 0, sum: Number(row.totalSum) || 0 }];
  }
  return [];
}

export const salesService = {
  list: () => salesRepo.list(),

  // Продажа целиком в ОДНОЙ транзакции: запись + списание склада по каждой
  // позиции + (при «Оплачено») приход в финансы. Товар обязателен; минус запрещён.
  async create(input: unknown, actor?: Actor) {
    const data = saleMutateSchema.parse(input);
    const items = normalizeItems(data);
    if (!items.length) throw badRequest('Добавьте хотя бы одну позицию со складом');
    const agg = aggregateItems(items);
    const paid = data.payStatus === 'Оплачено';
    if (paid && !data.accountId) throw badRequest('Для оплаченной продажи выберите счёт зачисления');

    return db.transaction(async (tx) => {
      const saleNo = data.saleNo || await salesRepo.nextSaleNo(tx);
      const sale = await salesRepo.create({
        saleNo,
        saleDate: data.saleDate || undefined,
        clientName: data.clientName || '',
        clientType: data.clientType || 'retail',
        items,
        productId: agg.productId,
        productName: agg.productName,
        skuCode: agg.skuCode,
        qty: agg.qty,
        price: agg.price != null ? m2(agg.price) : null,
        totalSum: m2(agg.total),
        payStatus: data.payStatus || 'В ожидании',
        invoiceType: invType(data.invoiceType),
        comment: data.comment || null,
        createdBy: actor?.id || null,
      }, tx);

      for (const it of items) {
        await productsService.createMovement(
          { productId: it.productId, moveType: 'OUT', qty: it.qty, price: it.price, comment: `Продажа ${saleNo}: ${data.clientName || ''}` },
          actor, tx,
        );
      }
      if (paid && data.accountId) {
        await financeService.createOperation(
          { opType: 'Приход', accountId: data.accountId, amount: m2(agg.total), name: `Продажа ${saleNo}${agg.productName ? ': ' + agg.productName : ''}`, source: 'Продажа', saleId: sale.id, opDate: data.saleDate || undefined, comment: data.clientName || undefined },
          actor?.id || null, tx,
        );
      }
      return sale;
    });
  },

  // Правка продажи: реконсиляция склада (вернуть старые позиции, списать новые) +
  // реконсиляция финансов (сторно старого прихода, новый приход) — в одной tx.
  // Через этот же путь работает и инлайн-переключение оплаты.
  async update(id: string, input: unknown, actor?: Actor) {
    if (!id) throw badRequest('id обязателен');
    const data = saleMutateSchema.partial().parse(input);
    return db.transaction(async (tx) => {
      const old = await salesRepo.findById(id, tx) as SaleRow | null;
      if (!old) throw notFound('Продажа не найдена');
      if (old.cancelledAt) throw badRequest('Продажа отменена — правка недоступна');

      const itemsProvided = Array.isArray(data.items) && data.items.length > 0;
      const items = itemsProvided ? normalizeItems(data) : itemsOf(old);
      if (!items.length) throw badRequest('Нужна хотя бы одна позиция');
      const agg = aggregateItems(items);

      const oldPaid = old.payStatus === 'Оплачено';
      const newPay = data.payStatus ?? old.payStatus ?? 'В ожидании';
      const newPaid = newPay === 'Оплачено';

      const ops = await financeRepo.findBySale(id, tx);
      const liveOp = ops.find(o => !o.reversedAt && !o.reverses);
      const accountId = data.accountId ?? liveOp?.accountId ?? null;
      const financeChanged = newPaid !== oldPaid || itemsProvided || (!!data.accountId && data.accountId !== liveOp?.accountId);

      // 1) склад — только если позиции изменились
      if (itemsProvided) {
        for (const it of itemsOf(old)) {
          await productsService.createMovement({ productId: it.productId, moveType: 'IN', qty: it.qty, price: it.price, comment: `Правка ${old.saleNo}: возврат` }, actor, tx);
        }
        for (const it of items) {
          await productsService.createMovement({ productId: it.productId, moveType: 'OUT', qty: it.qty, price: it.price, comment: `Правка ${old.saleNo}: списание` }, actor, tx);
        }
      }

      // 2) финансы — сторно действующего прихода + создание нового
      if (oldPaid && liveOp && financeChanged) {
        await financeService.reverseOperation(liveOp.id, actor?.id ?? null, tx);
      }
      if (newPaid && financeChanged) {
        if (!accountId) throw badRequest('Для оплаченной продажи выберите счёт зачисления');
        await financeService.createOperation(
          { opType: 'Приход', accountId, amount: m2(agg.total), name: `Продажа ${old.saleNo}${agg.productName ? ': ' + agg.productName : ''}`, source: 'Продажа', saleId: id, opDate: (data.saleDate ?? old.saleDate) || undefined, comment: (data.clientName ?? old.clientName) || undefined },
          actor?.id ?? null, tx,
        );
      }

      // 3) строка продажи
      const patch: Record<string, unknown> = {
        clientName: data.clientName ?? old.clientName ?? '',
        clientType: data.clientType ?? old.clientType ?? 'retail',
        comment: data.comment ?? old.comment ?? null,
        payStatus: newPay,
        invoiceType: data.invoiceType !== undefined ? invType(data.invoiceType) : old.invoiceType,
        items,
        productId: agg.productId,
        productName: agg.productName,
        skuCode: agg.skuCode,
        qty: agg.qty,
        price: agg.price != null ? m2(agg.price) : null,
        totalSum: m2(agg.total),
      };
      if (data.saleDate) patch.saleDate = data.saleDate;
      return salesRepo.update(id, patch, tx);
    });
  },

  // Отмена продажи (не удаление): сторно прихода + возврат остатка по КАЖДОЙ
  // позиции. Продажа помечается «Отменена». Идемпотентно.
  async cancel(id: string, actor?: Actor) {
    if (!id) throw badRequest('id обязателен');
    return db.transaction(async (tx) => {
      const sale = await salesRepo.findById(id, tx) as SaleRow | null;
      if (!sale) throw notFound('Продажа не найдена');
      if (sale.cancelledAt) throw badRequest('Продажа уже отменена');

      const ops = await financeRepo.findBySale(id, tx);
      for (const op of ops) {
        if (!op.reversedAt && !op.reverses) await financeService.reverseOperation(op.id, actor?.id ?? null, tx);
      }
      for (const it of itemsOf(sale)) {
        await productsService.createMovement({ productId: it.productId, moveType: 'IN', qty: it.qty, price: it.price, comment: `Возврат: отмена продажи ${sale.saleNo ?? ''}` }, actor, tx);
      }
      await salesRepo.markCancelled(id, actor?.id ?? null, tx);
      return { ok: true };
    });
  },
};
