import { withApi, optionsHandler } from '@/server/lib/http';
import { branchesService } from '@/server/services/branches.service';

export const OPTIONS = optionsHandler;

// collection: /api/v2/branches — read-only list of active branches
export const GET = withApi(async () => branchesService.list());
