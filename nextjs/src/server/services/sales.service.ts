import { db } from '@/db';
import { salesRepo } from '@/server/repositories/sales.repo';
import { financeRepo } from '@/server/repositories/finance.repo';
import { productsService } from '@/server/services/products.service';
import { financeService } from '@/server/services/finance.service';
import { saleCreateSchema } from '@/server/dto/sales.dto';
import { badRequest, notFound } from '@/server/lib/errors';

const money = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
// invoice_type — enum БД; произвольное имя счёта туда класть нельзя (иначе 500).
const INVOICE_TYPES = ['Каспи', 'БЦК', 'Наличка', 'Каспи Голд'];
const invType = (v: unknown) => (INVOICE_TYPES.includes(String(v)) ? String(v) : null);

export const salesService = {
  list: () => salesRepo.list(),

  // Продажа целиком — в ОДНОЙ транзакции: запись продажи + списание склада +
  // (при «Оплачено») приход в финансы. Любой сбой откатывает всё — не бывает
  // «товар списан, а денег нет». Товар обязателен; уход склада в минус запрещён.
  async create(input: unknown, actor?: { id: string; name?: string } | null) {
    const data = saleCreateSchema.parse(input);
    if (!data.productId) throw badRequest('Выберите товар со склада');
    const qty = Math.abs(Number(data.qty) || 0);
    if (qty <= 0) throw badRequest('Количество должно быть больше 0');
    const price = Number(data.price) || 0;
    const total = money(qty * price);
    const paid = data.payStatus === 'Оплачено';
    if (paid && !data.accountId) throw badRequest('Для оплаченной продажи выберите счёт зачисления');

    return db.transaction(async (tx) => {
      const saleNo = data.saleNo || await salesRepo.nextSaleNo(tx);

      const sale = await salesRepo.create({
        saleNo,
        saleDate: data.saleDate || undefined,
        clientName: data.clientName || '',
        productId: data.productId,
        productName: data.productName || null,
        skuCode: data.skuCode || null,
        qty,
        price: money(price),
        totalSum: total,
        payStatus: data.payStatus || 'В ожидании',
        invoiceType: invType(data.invoiceType),
        comment: data.comment || null,
        createdBy: actor?.id || null,
      }, tx);

      // списание остатка со склада (двигает products.current_stock; запрет минуса)
      await productsService.createMovement(
        { productId: data.productId, moveType: 'OUT', qty, price, comment: `Продажа ${saleNo}: ${data.clientName || ''}` },
        actor, tx,
      );

      // приход в финансы при оплате
      if (paid && data.accountId) {
        await financeService.createOperation(
          {
            opType: 'Приход',
            accountId: data.accountId,
            amount: total,
            name: `Продажа ${saleNo}${data.productName ? ': ' + data.productName : ''}`,
            source: 'Продажа',
            saleId: sale.id,                       // связь приход→продажа (трассируемость)
            opDate: data.saleDate || undefined,
            comment: data.clientName || undefined,
          },
          actor?.id || null, tx,
        );
      }

      return sale;
    });
  },

  // Отмена продажи (не удаление): сторно прихода + возврат остатка на склад —
  // всё в ОДНОЙ транзакции. Продажа помечается «Отменена» (cancelledAt/By) —
  // остаётся в журнале со следом. Идемпотентно: повторная отмена запрещена.
  async cancel(id: string, actor?: { id: string; name?: string } | null) {
    if (!id) throw badRequest('id обязателен');
    return db.transaction(async (tx) => {
      const sale = await salesRepo.findById(id, tx);
      if (!sale) throw notFound('Продажа не найдена');
      if (sale.cancelledAt) throw badRequest('Продажа уже отменена');

      // сторнируем приход(ы), привязанные к продаже (если была оплачена)
      const ops = await financeRepo.findBySale(sale.id, tx);
      for (const op of ops) {
        if (!op.reversedAt && !op.reverses) await financeService.reverseOperation(op.id, actor?.id ?? null, tx);
      }

      // возвращаем остаток на склад (движение IN — виден в журнале как «Возврат»)
      const qty = Math.abs(Number(sale.qty) || 0);
      if (sale.productId && qty > 0) {
        await productsService.createMovement(
          { productId: sale.productId, moveType: 'IN', qty, price: Number(sale.price) || 0, comment: `Возврат: отмена продажи ${sale.saleNo ?? ''}` },
          actor, tx,
        );
      }

      await salesRepo.markCancelled(id, actor?.id ?? null, tx);
      return { ok: true };
    });
  },
};
