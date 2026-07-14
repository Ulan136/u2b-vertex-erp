import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { salesService } from '@/server/services/sales.service';

export const OPTIONS = optionsHandler;

export const GET = withApi(async () => salesService.list());
export const POST = withApi(async (req: NextRequest) => created(await salesService.create(await req.json())));
