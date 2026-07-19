import { NextRequest, NextResponse } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { documentsService } from '@/server/services/documents.service';
import { buildInvoiceExcel, buildInvoiceWord } from '@/server/lib/doc-invoice';
import {
  buildNakladnayaExcel, buildNakladnayaWord, buildAktExcel, buildAktWord, buildKpExcel, buildKpWord,
} from '@/server/lib/doc-forms';
import { CORS_HEADERS } from '@/server/lib/cors';
import { badRequest } from '@/server/lib/errors';

type Gen = (doc: never, org: never) => Promise<Buffer>;
const GENERATORS: Record<string, { excel: Gen; word: Gen }> = {
  invoice: { excel: buildInvoiceExcel as Gen, word: buildInvoiceWord as Gen },
  nakladnaya: { excel: buildNakladnayaExcel as Gen, word: buildNakladnayaWord as Gen },
  akt: { excel: buildAktExcel as Gen, word: buildAktWord as Gen },
  kp: { excel: buildKpExcel as Gen, word: buildKpWord as Gen },
};
import type { DocType } from '@/server/dto/documents.dto';

export const OPTIONS = optionsHandler;

// GET /api/v2/documents        → список
// GET /api/v2/documents?next=invoice → следующий номер
export const GET = withApi(async (req: NextRequest) => {
  const next = new URL(req.url).searchParams.get('next');
  if (next) return { number: await documentsService.nextNumber(next as DocType) };
  return documentsService.list();
});
export const POST = withApi(async (req: NextRequest, ctx) => created(await documentsService.create(await req.json(), ctx.user?.id)));
export const GET_ONE = withApi(async (_req: NextRequest, ctx) => {
  const d = await documentsService.get(ctx.params!.id);
  if (!d) throw badRequest('Документ не найден');
  return d;
});
export const DELETE = withApi(async (_req: NextRequest, ctx) => documentsService.remove(ctx.params!.id));

// GET /api/v2/documents/[id]/file?fmt=excel|word → готовый файл
export const FILE = withApi(async (req: NextRequest, ctx) => {
  const fmt = new URL(req.url).searchParams.get('fmt') || 'excel';
  const { doc, org } = await documentsService.withOrg(ctx.params!.id);
  const gen = GENERATORS[doc.type];
  if (!gen) throw badRequest('Неизвестный тип документа');
  const isWord = fmt === 'word';
  const buffer = isWord ? await gen.word(doc as never, (org || {}) as never) : await gen.excel(doc as never, (org || {}) as never);
  const ext = isWord ? 'docx' : 'xlsx';
  const ctype = isWord
    ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const fname = `${doc.docNo || 'Счет'}.${ext}`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': ctype,
      'Content-Disposition': `attachment; filename="document.${ext}"; filename*=UTF-8''${encodeURIComponent(fname)}`,
    },
  });
});
