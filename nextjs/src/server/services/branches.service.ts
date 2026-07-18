import { branchesRepo } from '@/server/repositories/branches.repo';

export const branchesService = {
  list: () => branchesRepo.listActive(),
};
