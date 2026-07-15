import { financeRepo } from '@/server/repositories/finance.repo';
import { financeOperationSchema } from '@/server/dto/finance.dto';

export const financeService = {
  overview: () => financeRepo.overview(),

  async createOperation(input: unknown) {
    const data = financeOperationSchema.parse(input);
    return financeRepo.createOperation(data);
  },

  removeOperation: (id: string) => financeRepo.removeOperation(id),
};
