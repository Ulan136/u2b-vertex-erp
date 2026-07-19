import { NextRequest } from 'next/server';
import { withApi, optionsHandler } from '@/server/lib/http';
import { orgService } from '@/server/services/org.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/org — реквизиты организации + печать/подпись/логотип (base64)
export const GET = withApi(async () => orgService.get());
export const PATCH = withApi(async (req: NextRequest) => orgService.update(await req.json()));
