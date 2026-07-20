import { salesRepo } from '@/server/repositories/sales.repo';
import { productsService } from '@/server/services/products.service';
import { financeService } from '@/server/services/finance.service';
import { saleCreateSchema, nextSaleNo } from '@/server/dto/sales.dto';

const money = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

export const salesService = {
  list: () => salesRepo.list(),

  // Продажа: пишем в БД, списываем остаток со склада, и при «Оплачено» —
  // приход в финансы на выбранный счёт (раздел «Продажа»). Сквозняк как у
  // расходов/зарплаты.
  async create(input: unknown, actor?: { id: string; name?: string } | null) {
    const data = saleCreateSchema.parse(input);
    const qty = Math.abs(Number(data.qty) || 0);
    const price = Number(data.price) || 0;
    const total = money(qty * price);
    const paid = data.payStatus === 'Оплачено';

    const existing = await salesRepo.list();
    const saleNo = data.saleNo || nextSaleNo(existing.map(s => s.saleNo));

    const sale = await salesRepo.create({
      saleNo,
      saleDate: data.saleDate || undefined,
      clientName: data.clientName || '',
      productId: data.productId || null,
      productName: data.productName || null,
      skuCode: data.skuCode || null,
      qty,
      price: money(price),
      totalSum: total,
      payStatus: data.payStatus || 'В ожидании',
      invoiceType: data.invoiceType || null,
      comment: data.comment || null,
      createdBy: actor?.id || null,
    });

    // списание остатка со склада (двигает products.current_stock)
    if (data.productId && qty > 0) {
      await productsService.createMovement(
        { productId: data.productId, moveType: 'OUT', qty, price, comment: `Продажа ${saleNo}: ${data.clientName || ''}` },
        actor,
      );
    }

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
        actor?.id || null,
      );
    }

    return sale;
  },
};
