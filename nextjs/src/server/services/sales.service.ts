import { salesRepo } from '@/server/repositories/sales.repo';
import { saleCreateSchema } from '@/server/dto/sales.dto';

export const salesService = {
  list: () => salesRepo.list(),

  async create(input: unknown) {
    const data = saleCreateSchema.parse(input);
    const sale = await salesRepo.create(data);
    // Auto-deduct stock when the sale references a product.
    if (data.productId && data.qty) {
      await salesRepo.createMovement({
        productId: data.productId,
        skuCode: data.skuCode,
        productName: data.productName,
        moveType: 'OUT',
        qty: -Math.abs(data.qty),
        price: data.price,
        totalSum: data.totalSum,
        comment: 'Sale: ' + (data.clientName ?? ''),
        author: 'Система',
      });
    }
    return sale;
  },
};
