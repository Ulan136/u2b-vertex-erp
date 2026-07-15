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

  async create(input: unknown) {
    const data = debtCreateSchema.parse(input);
    return debtsRepo.create({
      type: data.type,
      counterpartyClientId: data.counterpartyClientId ?? null,
      counterpartyName: data.counterpartyName ?? null,
      amount: money(data.amount),
      paidAmount: '0',
      accountId: data.accountId ?? null,
      dueDate: data.dueDate ?? null,
      comment: data.comment ?? null,
      status: computeStatus(data.amount, 0),
    });
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

  // Deleting a debt rolls back the ledger operations of all its payments,
  // then removes the debt (payments cascade in the DB).
  async remove(id: string) {
    if (!id) throw badRequest('id обязателен');
    const payments = await debtsRepo.listPayments(id);
    for (const p of payments) {
      if (p.financeOpId) await financeService.removeOperation(p.financeOpId);
    }
    await debtsRepo.remove(id);
    return { ok: true };
  },

  listPayments: (debtId: string) => debtsRepo.listPayments(debtId),

  // Record a payment: create the matching finance operation (Приход for debit,
  // Расход for credit) when an account is available, then advance paid_amount
  // and recompute status.
  async addPayment(debtId: string, input: unknown) {
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

    // reuse the finance ledger — do not invent a parallel accounting
    const opSpec = buildPaymentFinanceOp(debt, data, counterpartyLabel(debt));
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
      });
      financeOpId = op?.id ?? null;
    }

    const payment = await debtsRepo.createPayment({
      debtId,
      amount: money(data.amount),
      accountId: data.accountId ?? debt.accountId ?? null,
      financeOpId,
      payDate: data.payDate ?? null,
      comment: data.comment ?? null,
    });

    const newPaid = round2(paid + data.amount);
    const updated = await debtsRepo.update(debtId, {
      paidAmount: money(newPaid),
      status: computeStatus(amount, newPaid),
    });

    return { debt: updated, payment };
  },

  // Delete a payment: roll back its finance operation, then subtract from
  // paid_amount and recompute status.
  async removePayment(paymentId: string) {
    if (!paymentId) throw badRequest('paymentId обязателен');
    const payment = await debtsRepo.findPayment(paymentId);
    if (!payment) throw notFound('Погашение не найдено');

    if (payment.financeOpId) await financeService.removeOperation(payment.financeOpId);
    await debtsRepo.removePayment(paymentId);

    const debt = await debtsRepo.findById(payment.debtId);
    if (debt) {
      const amount = num(debt.amount);
      const newPaid = Math.max(0, round2(num(debt.paidAmount) - num(payment.amount)));
      const updated = await debtsRepo.update(payment.debtId, {
        paidAmount: money(newPaid),
        status: computeStatus(amount, newPaid),
      });
      return { debt: updated };
    }
    return { ok: true };
  },
};
