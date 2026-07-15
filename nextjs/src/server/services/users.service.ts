import { usersRepo } from '@/server/repositories/users.repo';

export const usersService = {
  list: () => usersRepo.listActive(),
};
