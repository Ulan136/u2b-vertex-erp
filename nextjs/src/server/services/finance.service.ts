import { financeRepo } from '@/server/repositories/finance.repo';
import {
  financeOperationSchema, accountCreateSchema, accountUpdateSchema, balanceDeltas,
} from '@/server/dto/finance.dto';

export const financeService = {
  overview: () => financeRepo.overview(),

  // Создать операцию и сдвинуть балансы задействованных счетов.
  async createOperation(input: unknown, actorId?: string | null) {
    const data = financeOperationSchema.parse(input);
    const { toAccountId, ...op } = data;
    const row = await financeRepo.createOperation({
      ...op,
      amount: String(Number(data.amount) || 0),
      createdBy: actorId ?? null,
    });
    for (const { id, delta } of balanceDeltas(data.opType, data.amount, data.accountId, toAccountId)) {
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
