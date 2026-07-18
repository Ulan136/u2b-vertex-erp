import { withApi, optionsHandler } from '@/server/lib/http';
import { branchesService } from '@/server/services/branches.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/branches → [{ id, name, city, isHead }] (для селектов «Филиал»)
export const GET = withApi(async () => branchesService.list());
