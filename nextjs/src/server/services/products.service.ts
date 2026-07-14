import { productsRepo } from '@/server/repositories/products.repo';
import { stockMovementSchema } from '@/server/dto/products.dto';

export const productsService = {
  list: () => productsRepo.listActive(),

  async createMovement(input: unknown) {
    const data = stockMovementSchema.parse(input);
    return productsRepo.createMovement(data);
  },
};
