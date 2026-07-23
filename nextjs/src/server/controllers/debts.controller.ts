import { NextRequest } from 'next/server';
import { withApi, created, optionsHandler } from '@/server/lib/http';
import { debtsService } from '@/server/services/debts.service';
import { formatDate } from '@/lib/format';

export const OPTIONS = optionsHandler;

// collection: /api/v2/debts?type=&status=&accountId=&q=
export const GET = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  return debtsService.list({
    type: sp.get('type'),
    status: sp.get('status'),
    accountId: sp.get('accountId'),
    q: sp.get('q'),
  });
});
export const POST = withApi(async (req: NextRequest, ctx) => created(await debtsService.create(await req.json(), ctx.user?.id ?? null)));

// journal: /api/v2/debts/payments?from=&to=&q=  — все оплаты подряд
export const PAYMENTS_JOURNAL = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  return debtsService.paymentsJournal({ from: sp.get('from'), to: sp.get('to'), q: sp.get('q') });
});
// journal export: /api/v2/debts/payments/export?from=&to=&q= — Excel
export const PAYMENTS_EXPORT = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const rows = await debtsService.paymentsJournal({ from: sp.get('from'), to: sp.get('to'), q: sp.get('q') });
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Оплаты по долгам');
  ws.columns = [
    { header: 'Дата', key: 'd', width: 12 }, { header: 'Контрагент', key: 'c', width: 26 },
    { header: 'Тип', key: 't', width: 12 }, { header: 'Сумма долга', key: 'da', width: 14 },
    { header: 'Платёж', key: 'a', width: 14 }, { header: 'Счёт', key: 'ac', width: 14 },
    { header: 'Остаток после', key: 'r', width: 14 }, { header: 'Автор', key: 'au', width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const p of rows) ws.addRow({ d: formatDate(p.payDate), c: p.counterparty, t: p.debtType === 'credit' ? 'Мы должны' : 'Нам должны', da: p.debtAmount, a: p.amount, ac: p.accountName || '', r: p.remainingAfter, au: p.author || '' });
  const buf = await wb.xlsx.writeBuffer();
  const { NextResponse } = await import('next/server');
  const { CORS_HEADERS } = await import('@/server/lib/cors');
  return new NextResponse(Buffer.from(buf), { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': "attachment; filename=\"debt-payments.xlsx\"" } });
});

// item: /api/v2/debts/[id]
export const PATCH = withApi(async (req: NextRequest, ctx) => debtsService.update(ctx.params!.id, await req.json()));
export const DELETE = withApi(async (req: NextRequest, ctx) => debtsService.remove(ctx.params!.id, ctx.user?.id ?? null));

// payments collection: /api/v2/debts/[id]/payments  (ctx.params.id = debtId)
export const LIST_PAYMENTS = withApi(async (req: NextRequest, ctx) => debtsService.listPayments(ctx.params!.id));
export const ADD_PAYMENT = withApi(async (req: NextRequest, ctx) => created(await debtsService.addPayment(ctx.params!.id, await req.json(), ctx.user?.id ?? null)));

// payment item: /api/v2/debt-payments/[id]  (ctx.params.id = paymentId)
export const REMOVE_PAYMENT = withApi(async (req: NextRequest, ctx) => debtsService.removePayment(ctx.params!.id, ctx.user?.id ?? null));
