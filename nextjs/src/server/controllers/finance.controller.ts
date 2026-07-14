import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { financeService } from '@/server/services/finance.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/finance — { accounts, operations }
export const GET = withApi(async () => financeService.overview());
// POST /api/v2/finance — create a finance operation
export const POST = withApi(async (req: NextRequest) => created(await financeService.createOperation(await req.json())));
