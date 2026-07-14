import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { ordersService } from '@/server/services/orders.service';

export const OPTIONS = optionsHandler;

// collection: /api/v2/orders
export const GET = withApi(async () => ordersService.list());
export const POST = withApi(async (req: NextRequest) => created(await ordersService.create(await req.json())));

// item: /api/v2/orders/[id]
export const PATCH = withApi(async (req: NextRequest, ctx) => ordersService.update(ctx.params!.id, await req.json()));
export const DELETE = withApi(async (req: NextRequest, ctx) => ordersService.remove(ctx.params!.id));

// static: /api/v2/orders/external-url
export const EXTERNAL_URL = withApi(async () => ordersService.externalUrl());
