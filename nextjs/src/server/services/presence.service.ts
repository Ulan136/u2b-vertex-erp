import { usersRepo } from '@/server/repositories/users.repo';
import { isOnline } from '@/server/dto/presence.dto';

export const presenceService = {
  // Throttled presence touch on authorized requests (≤ 1 write/min per user).
  touch: (userId: string) => usersRepo.touchLastSeen(userId).catch(() => {}),

  async list() {
    const now = Date.now();
    const rows = await usersRepo.online();
    const users = rows.map(u => ({ ...u, online: isOnline(u.lastSeenAt, now) }));
    return { onlineCount: users.filter(u => u.online).length, users };
  },
};
