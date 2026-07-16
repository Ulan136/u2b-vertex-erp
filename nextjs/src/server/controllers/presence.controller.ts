import { withApi, optionsHandler } from '@/server/lib/http';
import { presenceService } from '@/server/services/presence.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/presence → { onlineCount, users: [{id,name,role,lastSeenAt,online}] }
export const GET = withApi(async () => presenceService.list());
