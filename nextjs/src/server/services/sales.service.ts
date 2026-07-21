import { db } from '@/db';
import { salesRepo } from '@/server/repositories/sales.repo';
import { productsService } from '@/server/services/products.service';
import { financeService } from '@/server/services/finance.service';
import { saleCreateSchema } from '@/server/dto/sales.dto';
import { badRequest } from '@/server/lib/errors';

const money = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

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
        invoiceType: data.invoiceType || null,
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
            opDate: data.saleDate || undefined,
            comment: data.clientName || undefined,
          },
          actor?.id || null, tx,
        );
      }

      return sale;
    });
  },
};
