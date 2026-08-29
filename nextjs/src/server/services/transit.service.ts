import { randomUUID } from 'crypto';
import { db } from '@/db';
import { debtsRepo } from '@/server/repositories/debts.repo';
import { transitCreateSchema } from '@/server/dto/transit.dto';
import { computeStatus, round2 } from '@/server/dto/debts.dto';

const money = (n: number) => round2(n).toFixed(2);

// Перекупка (транзит) = два связанных долга, БЕЗ движения склада:
//   • кредиторка (type=credit): мы должны поставщику себестоимость C;
//   • дебиторка (type=debit): заказчик должен нам цену продажи P.
// Погашения этих долгов идут обычным механизмом Долгов (Приход/Расход в финледжере),
// поэтому маржа P−C всплывает сама, когда обе стороны рассчитаются. Схему БД не меняем —
// связка пары хранится тегом «#<short>» в комментарии обоих долгов.
export const transitService = {
  async create(input: unknown, actorId?: string | null) {
    const d = transitCreateSchema.parse(input);
    const group = randomUUID();
    const short = group.slice(0, 8);
    const cost = round2(d.cost), price = round2(d.price);
    const item = d.itemText?.trim();
    const tag = `🔀 Перекупка · #${short}`;
    const extra = (who: string) => `${tag} · ${who}${item ? ' · ' + item : ''}${d.comment ? ' · ' + d.comment : ''}`;

    return db.transaction(async (tx) => {
      // Мы должны поставщику (себестоимость)
      const credit = await debtsRepo.create({
        type: 'credit', counterpartyClientId: null, counterpartyName: d.supplierName,
        amount: money(cost), paidAmount: '0.00', accountId: null, categoryId: null,
        dueDate: d.date ?? null, comment: extra(`заказчик: ${d.customerName}`),
        status: computeStatus(cost, 0), createdBy: actorId ?? null,
      }, tx);
      // Заказчик должен нам (цена продажи)
      const debit = await debtsRepo.create({
        type: 'debit', counterpartyClientId: d.customerClientId ?? null, counterpartyName: d.customerName,
        amount: money(price), paidAmount: '0.00', accountId: null, categoryId: null,
        dueDate: d.date ?? null, comment: extra(`поставщик: ${d.supplierName}`),
        status: computeStatus(price, 0), createdBy: actorId ?? null,
      }, tx);
      return { group, credit, debit, margin: round2(price - cost) };
    });
  },
};
