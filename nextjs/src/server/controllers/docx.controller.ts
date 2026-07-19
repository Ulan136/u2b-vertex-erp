import { NextRequest, NextResponse } from 'next/server';
import { withApi, optionsHandler } from '@/server/lib/http';
import { buildDocx } from '@/server/lib/docx';
import { CORS_HEADERS } from '@/server/lib/cors';

export const OPTIONS = optionsHandler;

// POST /api/v2/docx — { titleLines, subtitle, orientation, columns, rows, totalRow, signatures, filename }
// Возвращает готовый .docx. Форматирует данные, которые клиент уже видит на экране.
export const POST = withApi(async (req: NextRequest) => {
  const { buffer, filename } = await buildDocx(await req.json());
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_');   // ASCII-фолбэк для старых клиентов
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});
