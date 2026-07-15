import { withApi, optionsHandler } from '@/server/lib/http';
import { usersService } from '@/server/services/users.service';

export const OPTIONS = optionsHandler;

// collection: /api/v2/users — read-only list of active users
export const GET = withApi(async () => usersService.list());
