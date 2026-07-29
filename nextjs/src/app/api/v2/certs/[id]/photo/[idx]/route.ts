import { NextRequest } from 'next/server';
import { db } from '@/db';
import { certificates } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Фото поверки по ссылке: /api/v2/certs/{id}/photo/{idx}. Единый источник —
// сертификат (без дублей на заявке); списки отдают только photoCount, а <img>
// тянет конкретное фото сюда. Доступ гейтит middleware (только вошедшие).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: { id: string; idx: string } }) {
  if (!UUID.test(params.id)) return new Response('Not found', { status: 404 });
  const [cert] = await db.select({ photos: certificates.photos }).from(certificates)
    .where(eq(certificates.id, params.id)).limit(1);
  const photos = (cert?.photos as string[] | null) || [];
  const dataUrl = photos[Number(params.idx)];
  const m = dataUrl ? /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl) : null;
  if (!m) return new Response('Not found', { status: 404 });
  const buf = Buffer.from(m[2], 'base64');
  return new Response(buf, { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=3600' } });
}
