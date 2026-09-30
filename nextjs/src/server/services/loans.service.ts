import { z } from 'zod';
import { db } from '@/db';
import { loansRepo } from '@/server/repositories/loans.repo';
import { financeService } from '@/server/services/finance.service';
import { financeRepo } from '@/server/repositories/finance.repo';
import { badRequest, notFound } from '@/server/lib/errors';

const m2 = (n: unknown) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

const giveSchema = z.object({
  debtorName: z.string().trim().min(1, 'Укажите имя должника'),
  amount: z.coerce.number().positive('Сумма должна быть больше 0'),
  accountId: z.string().uuid('Выберите счёт'),
  comment: z.string().nullish(),
});
const returnSchema = z.object({
  amount: z.coerce.number().positive('Сумма должна быть больше 0'),
  accountId: z.string().uuid('Выберите счёт'),
});

export const loansService = {
  list: () => loansRepo.list(),

  // Выдать долг: деньги уходят со счёта (Расход, source='Долг') + запись долга.
  async give(input: unknown, actor?: { id: string } | null) {
    const d = giveSchema.parse(input);
    return db.transaction(async (tx) => {
      const acc = await financeRepo.findAccount(d.accountId, tx);
      if (!acc) throw badRequest('Счёт не найден');
      const loan = await loansRepo.create({
        debtorName: d.debtorName, amount: m2(d.amount), accountId: d.accountId,
        comment: d.comment || null, createdBy: actor?.id ?? null,
      }, tx);
      await financeService.createOperation(
        { opType: 'Расход', accountId: d.accountId, amount: m2(d.amount), name: `Выдан долг: ${d.debtorName}`.slice(0, 200), source: 'Долг', accountName: acc.name, expenseGroupId: loan.id },
        actor?.id ?? null, tx,
      );
      return loan;
    });
  },

  // Возврат долга: деньги приходят на счёт (Приход, source='Долг') + returned += amount;
  // полностью погашен → closed_at.
  async returnLoan(id: string, input: unknown, actor?: { id: string } | null) {
    if (!id) throw badRequest('id обязателен');
    const d = returnSchema.parse(input);
    return db.transaction(async (tx) => {
      const loan = await loansRepo.findById(id, tx);
      if (!loan) throw notFound('Долг не найден');
      const outstanding = round2(Number(loan.amount) - Number(loan.returned));
      if (outstanding <= 0.005) throw badRequest('Долг уже возвращён полностью');
      const take = Math.min(round2(d.amount), outstanding);   // не больше остатка
      const acc = await financeRepo.findAccount(d.accountId, tx);
      if (!acc) throw badRequest('Счёт не найден');
      await financeService.createOperation(
        { opType: 'Приход', accountId: d.accountId, amount: m2(take), name: `Возврат долга: ${loan.debtorName}`.slice(0, 200), source: 'Долг', accountName: acc.name, expenseGroupId: id },
        actor?.id ?? null, tx,
      );
      const newReturned = round2(Number(loan.returned) + take);
      const closed = newReturned + 0.005 >= Number(loan.amount);
      await loansRepo.update(id, { returned: m2(newReturned), ...(closed ? { closedAt: new Date() } : {}) }, tx);
      return { ok: true, returned: m2(newReturned), remaining: m2(round2(Number(loan.amount) - newReturned)), closed };
    });
  },
};
