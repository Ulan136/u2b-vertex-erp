import { financeRepo } from '@/server/repositories/finance.repo';
import {
  financeOperationSchema, accountCreateSchema, accountUpdateSchema, balanceDeltas,
} from '@/server/dto/finance.dto';

export const financeService = {
  overview: () => financeRepo.overview(),

  // Создать операцию и сдвинуть балансы задействованных счетов.
  // Собираем только заданные поля — undefined для uuid/date колонок ломает вставку.
  async createOperation(input: unknown, actorId?: string | null) {
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
  },

  removeOperation: (id: string) => financeRepo.removeOperation(id),

  async createAccount(input: unknown) {
    const d = accountCreateSchema.parse(input);
    return financeRepo.createAccount({
      name: d.name,
      category: d.category,
      icon: d.icon || '💳',
      balance: String(Number(d.balance) || 0),
    });
  },

  async updateAccount(id: string, input: unknown) {
    const d = accountUpdateSchema.parse(input);
    const patch: Record<string, unknown> = {};
    if (d.name !== undefined) patch.name = d.name;
    if (d.icon !== undefined) patch.icon = d.icon;
    if (d.balance !== undefined) patch.balance = String(Number(d.balance) || 0);
    return financeRepo.updateAccount(id, patch);
  },
};
