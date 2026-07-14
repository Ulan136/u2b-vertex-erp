import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { productsService } from '@/server/services/products.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/products — active catalog
export const GET = withApi(async () => productsService.list());
// POST /api/v2/products — record a stock movement
export const POST = withApi(async (req: NextRequest) => created(await productsService.createMovement(await req.json())));
