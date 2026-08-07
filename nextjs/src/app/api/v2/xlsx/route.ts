import { NextRequest, NextResponse } from 'next/server';
import { withApi, optionsHandler } from '@/server/lib/http';
import { buildXlsx } from '@/server/lib/xlsx';
import { CORS_HEADERS } from '@/server/lib/cors';

export const OPTIONS = optionsHandler;

// POST /api/v2/xlsx — тот же spec, что и /api/v2/docx ({ titleLines, subtitle,
// orientation, columns, rows, totalRow, filename }) → готовый .xlsx.
export const POST = withApi(async (req: NextRequest) => {
  const { buffer, filename } = await buildXlsx(await req.json());
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_');
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});
