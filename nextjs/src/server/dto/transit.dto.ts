import { z } from 'zod';

// Транзитная сделка (перекупка): товар идёт от поставщика сразу заказчику, минуя
// склад. Порождает ДВА долга — кредиторка поставщику (себестоимость) и дебиторка
// заказчику (цена продажи). Маржа = price − cost, признаётся при полном расчёте.
export const transitCreateSchema = z.object({
  supplierName: z.string().trim().min(1, 'Укажите поставщика'),
  cost: z.coerce.number().positive('Себестоимость должна быть больше 0'),   // C — мы должны поставщику
  customerClientId: z.string().uuid().nullish(),
  customerName: z.string().trim().min(1, 'Укажите заказчика'),
  price: z.coerce.number().positive('Цена продажи должна быть больше 0'),   // P — заказчик должен нам
  itemText: z.string().trim().nullish(),   // описание товара, справочно
  date: z.string().nullish(),
  comment: z.string().nullish(),
});
export type TransitCreate = z.infer<typeof transitCreateSchema>;
