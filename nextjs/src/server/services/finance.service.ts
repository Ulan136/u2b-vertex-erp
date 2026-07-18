import { financeRepo } from '@/server/repositories/finance.repo';
import {
  financeOperationSchema, accountCreateSchema, accountUpdateSchema, balanceDeltas,
} from '@/server/dto/finance.dto';

// Создать операцию и сдвинуть балансы задействованных счетов.
// Собираем только заданные поля — undefined для uuid/date колонок ломает вставку.
async function createOperation(input: unknown, actorId?: string | null) {
  const data = financeOperationSchema.parse(input);
  const insert: Record<string, unknown> = {
    name: data.name,
    accountId: data.accountId,
    opType: data.opType,
    amount: String(Number(data.amount) || 0),
    createdBy: actorId ?? null,
  };
  if (data.opDate) insert.opDate = data.opDate;
  if (data.accountName) insert.accountName = data.accountName;
  if (data.source) insert.source = data.source;
  if (data.certId) insert.certId = data.certId;
  if (data.saleId) insert.saleId = data.saleId;
  if (data.comment) insert.comment = data.comment;

  const row = await financeRepo.createOperation(insert);
  for (const { id, delta } of balanceDeltas(data.opType, data.amount, data.accountId, data.toAccountId)) {
    await financeRepo.adjustBalance(id, delta);
  }
  return row;
}

// Счёт стартует с балансом 0; начальный остаток заводится ОПЕРАЦИЕЙ
// «Начальный остаток» (баланс всегда = сумма операций).
async function createAccount(input: unknown, actorId?: string | null) {
  const d = accountCreateSchema.parse(input);
  const acc = await financeRepo.createAccount({
    name: d.name, category: d.category, section: d.section, icon: d.icon || '💳', balance: '0',
  });
  const start = Number(d.balance) || 0;
  if (start > 0 && acc) {
    await createOperation(
      { opType: 'Приход', accountId: acc.id, amount: start, name: 'Начальный остаток', accountName: acc.name, source: 'Старт' },
      actorId,
    );
    (acc as { balance?: string }).balance = String(start.toFixed(2));
  }
  return acc;
}

async function updateAccount(id: string, input: unknown) {
  const d = accountUpdateSchema.parse(input);
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.section !== undefined) patch.section = d.section;
  if (d.icon !== undefined) patch.icon = d.icon;
  return financeRepo.updateAccount(id, patch);
}

export const financeService = {
  overview: (from?: string | null, to?: string | null) => financeRepo.overview(from, to),
  createOperation,
  removeOperation: (id: string) => financeRepo.removeOperation(id),
  createAccount,
  updateAccount,
};
