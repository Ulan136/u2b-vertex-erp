import { db, type Executor } from '@/db';
import { salesRepo } from '@/server/repositories/sales.repo';
import { financeRepo } from '@/server/repositories/finance.repo';
import { productsService } from '@/server/services/products.service';
import { financeService } from '@/server/services/finance.service';
import { saleMutateSchema, salePaymentSchema, normalizeItems, aggregateItems, paymentsTotal, payStatusFor, financePostable, type SaleItem, type SalePaymentInput } from '@/server/dto/sales.dto';
import { badRequest, notFound } from '@/server/lib/errors';
import { z } from 'zod';

const m2 = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
// invoice_type — enum БД; произвольное имя счёта туда класть нельзя (иначе 500).
const INVOICE_TYPES = ['Каспи', 'БЦК', 'Наличка', 'Каспи Голд'];
const invType = (v: unknown) => (INVOICE_TYPES.includes(String(v)) ? String(v) : null);
const legacyPay = (status: string) => (status === 'Оплачено' ? 'Оплачено' : 'В ожидании');

type Actor = { id: string; name?: string } | null | undefined;
type SaleRow = { id: string; saleNo?: string | null; productId?: string | null; productName?: string | null; skuCode?: string | null; qty?: number | null; price?: string | number | null; totalSum?: string | number | null; items?: SaleItem[] | null; payStatus?: string | null; clientName?: string | null; clientType?: string | null; saleDate?: string | null; comment?: string | null; invoiceType?: string | null; cancelledAt?: Date | string | null };
type PayInput = { accountId: string; amount: number };

function itemsOf(row: SaleRow): SaleItem[] {
  const it = row.items;
  if (Array.isArray(it) && it.length) return it;
  if (row.productId && Number(row.qty) > 0) {
    return [{ productId: row.productId, productName: row.productName ?? null, skuCode: row.skuCode ?? null, qty: Number(row.qty), price: Number(row.price) || 0, sum: Number(row.totalSum) || 0 }];
  }
  return [];
}

// Нормализовать оплаты: явные payments[], иначе legacy (accountId + «Оплачено» → одна полная оплата).
function normalizePayments(data: { payments?: SalePaymentInput[]; accountId?: string | null; payStatus?: string }, total: number): PayInput[] {
  if (Array.isArray(data.payments)) {
    return data.payments.map(p => ({ accountId: String(p.accountId), amount: Math.round((Number(p.amount) || 0) * 100) / 100 })).filter(p => p.accountId && p.amount > 0);
  }
  if (data.accountId && financePostable(data.payStatus)) return [{ accountId: String(data.accountId), amount: total }];
  return [];
}

// Провести оплаты: каждая строка → приход в финансы (раздел «Продажа») + запись sale_payments.
// Возвращает имена счетов (для legacy invoice_type). Всё в переданной транзакции.
async function postPayments(sale: { id: string; saleNo?: string | null; productName?: string | null; clientName?: string | null; saleDate?: string | null }, payments: PayInput[], actor: Actor, tx: Executor): Promise<string[]> {
  const names: string[] = [];
  for (const p of payments) {
    const acc = await financeRepo.findAccount(p.accountId, tx);
    if (!acc) throw badRequest('Счёт оплаты не найден');
    const op = await financeService.createOperation(
      { opType: 'Приход', accountId: p.accountId, amount: m2(p.amount), name: `Продажа ${sale.saleNo ?? ''}${sale.productName ? ': ' + sale.productName : ''}`.slice(0, 200), source: 'Продажа', saleId: sale.id, accountName: acc.name, opDate: sale.saleDate || undefined, comment: sale.clientName || undefined },
      actor?.id || null, tx,
    );
    await salesRepo.addPayment({ saleId: sale.id, accountId: p.accountId, accountName: acc.name, amount: m2(p.amount), financeOpId: op.id }, tx);
    names.push(acc.name);
  }
  return names;
}

export const salesService = {
  // Список с оплатами: paidSum, вычисляемый статус (Оплачено/Частично/Ожидает), список оплат.
  async list() {
    const [rows, pays] = await Promise.all([salesRepo.list(), salesRepo.allPayments()]);
    const bySale: Record<string, typeof pays> = {};
    for (const p of pays) (bySale[p.saleId] ||= []).push(p);
    return rows.map(s => {
      const ps = bySale[s.id] || [];
      const paidSum = paymentsTotal(ps);
      return {
        ...s,
        paidSum,
        payStatus: payStatusFor(Number(s.totalSum) || 0, paidSum),
        payments: ps.map(p => ({ accountId: p.accountId, accountName: p.accountName, amount: Number(p.amount) })),
      };
    });
  },

  // Создание продажи: списание склада по каждой позиции + приход в финансы по КАЖДОЙ
  // строке оплаты (свой счёт) — всё в одной транзакции. Товар обязателен, минус запрещён.
  async create(input: unknown, actor?: Actor) {
    const data = saleMutateSchema.parse(input);
    const items = normalizeItems(data);
    if (!items.length) throw badRequest('Добавьте хотя бы одну позицию со складом');
    const agg = aggregateItems(items);
    const payments = normalizePayments(data, agg.total);
    const paid = paymentsTotal(payments);
    if (paid - agg.total > 0.005) throw badRequest('Сумма оплат больше итога продажи');

    return db.transaction(async (tx) => {
      const saleNo = data.saleNo || await salesRepo.nextSaleNo(tx);
      const status = payStatusFor(agg.total, paid);
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
        payStatus: legacyPay(status),
        comment: data.comment || null,
        createdBy: actor?.id || null,
      }, tx);

      for (const it of items) {
        await productsService.createMovement(
          { productId: it.productId, moveType: 'OUT', qty: it.qty, price: it.price, comment: `Продажа ${saleNo}: ${data.clientName || ''}` },
          actor, tx,
        );
      }
      const names = await postPayments({ id: sale.id, saleNo, productName: agg.productName, clientName: data.clientName, saleDate: data.saleDate }, payments, actor, tx);
      if (names[0] && invType(names[0])) await salesRepo.update(sale.id, { invoiceType: invType(names[0]) }, tx);
      return sale;
    });
  },

  // Правка продажи (клиент/позиции/комментарий). Оплаты правятся отдельно —
  // «Дооплата»/«Отмена». Склад реконсилируется, статус пересчитывается по оплатам.
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

      if (itemsProvided) {
        for (const it of itemsOf(old)) {
          await productsService.createMovement({ productId: it.productId, moveType: 'IN', qty: it.qty, price: it.price, comment: `Правка ${old.saleNo}: возврат` }, actor, tx);
        }
        for (const it of items) {
          await productsService.createMovement({ productId: it.productId, moveType: 'OUT', qty: it.qty, price: it.price, comment: `Правка ${old.saleNo}: списание` }, actor, tx);
        }
      }

      const existingPaid = paymentsTotal(await salesRepo.paymentsBySale(id, tx));
      const status = payStatusFor(agg.total, existingPaid);
      const patch: Record<string, unknown> = {
        clientName: data.clientName ?? old.clientName ?? '',
        clientType: data.clientType ?? old.clientType ?? 'retail',
        comment: data.comment ?? old.comment ?? null,
        payStatus: legacyPay(status),
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

  // Дооплата: добавить строки оплат → новые приходы в финансах, статус пересчитывается.
  async addPayments(id: string, input: unknown, actor?: Actor) {
    if (!id) throw badRequest('id обязателен');
    const raw = (input as { payments?: unknown })?.payments ?? input;
    const parsed = z.array(salePaymentSchema).min(1).parse(raw);
    return db.transaction(async (tx) => {
      const sale = await salesRepo.findById(id, tx) as SaleRow | null;
      if (!sale) throw notFound('Продажа не найдена');
      if (sale.cancelledAt) throw badRequest('Продажа отменена');
      const add = parsed.map(p => ({ accountId: String(p.accountId), amount: Math.round((Number(p.amount) || 0) * 100) / 100 })).filter(p => p.accountId && p.amount > 0);
      if (!add.length) throw badRequest('Добавьте счёт и сумму');
      const already = paymentsTotal(await salesRepo.paymentsBySale(id, tx));
      const total = Number(sale.totalSum) || 0;
      if (already + paymentsTotal(add) - total > 0.005) throw badRequest(`Больше остатка нельзя: осталось ${m2(total - already)}`);
      await postPayments({ id: sale.id, saleNo: sale.saleNo, productName: sale.productName, clientName: sale.clientName, saleDate: sale.saleDate }, add, actor, tx);
      const status = payStatusFor(total, already + paymentsTotal(add));
      await salesRepo.update(id, { payStatus: legacyPay(status) }, tx);
      return { ok: true };
    });
  },

  // Отмена продажи (не удаление): сторно ВСЕХ приходов её оплат по своим счетам +
  // возврат остатка по каждой позиции. Идемпотентно.
  async cancel(id: string, actor?: Actor) {
    if (!id) throw badRequest('id обязателен');
    return db.transaction(async (tx) => {
      const sale = await salesRepo.findById(id, tx) as SaleRow | null;
      if (!sale) throw notFound('Продажа не найдена');
      if (sale.cancelledAt) throw badRequest('Продажа уже отменена');

      const pays = await salesRepo.paymentsBySale(id, tx);
      const reversed = new Set<string>();
      for (const p of pays) if (p.financeOpId) { await financeService.reverseOperation(p.financeOpId, actor?.id ?? null, tx); reversed.add(p.financeOpId); }
      // подстраховка для старых продаж без строк оплат: сторнируем прямые приходы
      const ops = await financeRepo.findBySale(id, tx);
      for (const op of ops) if (!op.reversedAt && !op.reverses && !reversed.has(op.id)) await financeService.reverseOperation(op.id, actor?.id ?? null, tx);

      for (const it of itemsOf(sale)) {
        await productsService.createMovement({ productId: it.productId, moveType: 'IN', qty: it.qty, price: it.price, comment: `Возврат: отмена продажи ${sale.saleNo ?? ''}` }, actor, tx);
      }
      await salesRepo.markCancelled(id, actor?.id ?? null, tx);
      return { ok: true };
    });
  },
};
