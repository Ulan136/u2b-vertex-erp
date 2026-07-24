import { db } from '@/db';
import { debtsRepo, type DebtListFilter } from '@/server/repositories/debts.repo';
import { financeService } from '@/server/services/finance.service';
import {
  debtCreateSchema, debtUpdateSchema, debtPaymentSchema,
  computeStatus, remainingOf, round2, buildPaymentFinanceOp,
} from '@/server/dto/debts.dto';
import { badRequest, notFound } from '@/server/lib/errors';

const num = (v: unknown) => Number(v ?? 0);
const money = (n: number) => round2(n).toFixed(2);

function counterpartyLabel(debt: { counterpartyName?: string | null; clientName?: string | null }): string {
  return debt.clientName || debt.counterpartyName || 'контрагент';
}

export const debtsService = {
  list: (filter: DebtListFilter) => debtsRepo.list(filter),

  async create(input: unknown, actorId?: string | null) {
    const data = debtCreateSchema.parse(input);
    const initialPaid = round2(data.paidAmount ?? 0);
    // Долг + (если внесено «уже погашено») запись «Начальное сальдо» БЕЗ финоперации.
    return db.transaction(async (tx) => {
      const debt = await debtsRepo.create({
        type: data.type,
        counterpartyClientId: data.counterpartyClientId ?? null,
        counterpartyName: data.counterpartyName ?? null,
        amount: money(data.amount),
        paidAmount: money(initialPaid),
        accountId: data.accountId ?? null,
        dueDate: data.dueDate ?? null,
        comment: data.comment ?? null,
        status: computeStatus(data.amount, initialPaid),
        createdBy: actorId ?? null,
      }, tx);
      if (initialPaid > 0) {
        await debtsRepo.createPayment({
          debtId: debt.id, amount: money(initialPaid), accountId: null, financeOpId: null,
          payDate: data.dueDate ?? null, comment: 'Начальное сальдо (оплата до внесения в систему)', createdBy: actorId ?? null,
        }, tx);
      }
      return debt;
    });
  },

  // Журнал всех оплат по долгам: остаток долга ПОСЛЕ каждого платежа считается
  // накопительно (по хронологии в рамках долга), свежие сверху.
  async paymentsJournal(filter: { from?: string | null; to?: string | null; q?: string | null }) {
    const rows = await debtsRepo.paymentsJournal(filter);
    // накопительный остаток по каждому долгу (в порядке возрастания даты создания)
    const asc = [...rows].sort((a, b) => new Date(a.createdAt as unknown as string).getTime() - new Date(b.createdAt as unknown as string).getTime());
    const cum: Record<string, number> = {};
    const afterById: Record<string, number> = {};
    for (const p of asc) {
      cum[p.debtId] = round2((cum[p.debtId] ?? 0) + num(p.amount));
      afterById[p.id] = remainingOf(num(p.debtAmount), cum[p.debtId]);
    }
    return rows.map(p => ({
      id: p.id, payDate: p.payDate, amount: num(p.amount), accountName: p.accountName,
      author: p.authorName, comment: p.comment,
      counterparty: p.clientName || p.counterpartyName || '—',
      debtType: p.debtType, debtAmount: num(p.debtAmount), remainingAfter: afterById[p.id],
    }));
  },

  async update(id: string, input: unknown) {
    if (!id) throw badRequest('id обязателен');
    const data = debtUpdateSchema.parse(input);
    const existing = await debtsRepo.findById(id);
    if (!existing) throw notFound('Долг не найден');

    const patch: Record<string, unknown> = {};
    if (data.type !== undefined) patch.type = data.type;
    if (data.counterpartyClientId !== undefined) patch.counterpartyClientId = data.counterpartyClientId ?? null;
    if (data.counterpartyName !== undefined) patch.counterpartyName = data.counterpartyName ?? null;
    if (data.accountId !== undefined) patch.accountId = data.accountId ?? null;
    if (data.dueDate !== undefined) patch.dueDate = data.dueDate ?? null;
    if (data.comment !== undefined) patch.comment = data.comment ?? null;
    // amount change → keep paid, recompute status
    if (data.amount !== undefined) {
      patch.amount = money(data.amount);
      patch.status = computeStatus(data.amount, num(existing.paidAmount));
    }
    const row = await debtsRepo.update(id, patch);
    if (!row) throw notFound('Долг не найден');
    return row;
  },

  // Удаление долга сторнирует финоперации всех его погашений (обратной операцией,
  // не молчаливым DELETE), затем удаляет долг (погашения удалит cascade). Всё в
  // одной транзакции.
  async remove(id: string, actorId?: string | null) {
    if (!id) throw badRequest('id обязателен');
    return db.transaction(async (tx) => {
      const payments = await debtsRepo.listPayments(id, tx);
      for (const p of payments) {
        if (p.financeOpId) await financeService.reverseOperation(p.financeOpId, actorId, tx);
      }
      await debtsRepo.remove(id, tx);
      return { ok: true };
    });
  },

  listPayments: (debtId: string) => debtsRepo.listPayments(debtId),

  // Record a payment: create the matching finance operation (Приход for debit,
  // Расход for credit) when an account is available, then advance paid_amount
  // and recompute status.
  async addPayment(debtId: string, input: unknown, actorId?: string | null) {
    if (!debtId) throw badRequest('debtId обязателен');
    const data = debtPaymentSchema.parse(input);
    const debt = await debtsRepo.findById(debtId);
    if (!debt) throw notFound('Долг не найден');

    const amount = num(debt.amount);
    const paid = num(debt.paidAmount);
    const remaining = remainingOf(amount, paid);
    if (data.amount > remaining) {
      throw badRequest(`Сумма погашения больше остатка (${remaining})`);
    }

    // Финоперация + запись погашения + пересчёт долга — в одной транзакции.
    const opSpec = buildPaymentFinanceOp(debt, data, counterpartyLabel(debt));
    return db.transaction(async (tx) => {
      let financeOpId: string | null = null;
      if (opSpec) {
        const op = await financeService.createOperation({
          opDate: opSpec.opDate,
          name: opSpec.name,
          accountId: opSpec.accountId,
          opType: opSpec.opType,
          amount: money(opSpec.amount),
          source: opSpec.source,
          comment: opSpec.comment,
        }, actorId, tx);
        financeOpId = op?.id ?? null;
      }

      const payment = await debtsRepo.createPayment({
        debtId,
        amount: money(data.amount),
        accountId: data.accountId ?? debt.accountId ?? null,
        financeOpId,
        payDate: data.payDate ?? null,
        comment: data.comment ?? null,
        createdBy: actorId ?? null,
      }, tx);

      const newPaid = round2(paid + data.amount);
      const updated = await debtsRepo.update(debtId, {
        paidAmount: money(newPaid),
        status: computeStatus(amount, newPaid),
      }, tx);

      return { debt: updated, payment };
    });
  },

  // Удаление погашения: сторнируем его финоперацию, затем уменьшаем paid_amount
  // и пересчитываем статус — в одной транзакции.
  async removePayment(paymentId: string, actorId?: string | null) {
    if (!paymentId) throw badRequest('paymentId обязателен');
    const payment = await debtsRepo.findPayment(paymentId);
    if (!payment) throw notFound('Погашение не найдено');

    return db.transaction(async (tx) => {
      if (payment.financeOpId) await financeService.reverseOperation(payment.financeOpId, actorId, tx);
      await debtsRepo.removePayment(paymentId, tx);

      const debt = await debtsRepo.findById(payment.debtId, tx);
      if (debt) {
        const amount = num(debt.amount);
        const newPaid = Math.max(0, round2(num(debt.paidAmount) - num(payment.amount)));
        const updated = await debtsRepo.update(payment.debtId, {
          paidAmount: money(newPaid),
          status: computeStatus(amount, newPaid),
        }, tx);
        return { debt: updated };
      }
      return { ok: true };
    });
  },
};
