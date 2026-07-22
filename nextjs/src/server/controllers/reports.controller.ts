import { NextRequest, NextResponse } from 'next/server';
import { withApi, optionsHandler } from '@/server/lib/http';
import { CORS_HEADERS } from '@/server/lib/cors';
import { reportsService } from '@/server/services/reports.service';
import { ROLE_LABELS_RU, type Role } from '@/server/dto/permissions.dto';

export const OPTIONS = optionsHandler;

const roleRu = (r: string) => ROLE_LABELS_RU[r as Role] || r;

// GET /api/v2/reports/analytics?from=&to= — сводка работы сотрудников + динамика
export const ANALYTICS = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  return reportsService.analytics(sp.get('from'), sp.get('to'));
});

// GET /api/v2/reports/employee-activity?userId=&from=&to= — лента действий сотрудника
export const ACTIVITY = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  return reportsService.employeeActivity(sp.get('userId'), sp.get('from'), sp.get('to'));
});

// GET /api/v2/reports/export?from=&to= — Excel «Работа сотрудников за период» (для премий)
export const EXPORT = withApi(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const { from, to, employees } = await reportsService.analytics(sp.get('from'), sp.get('to'));

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Сотрудники');
  ws.columns = [
    { header: 'Сотрудник', key: 'name', width: 26 },
    { header: 'Роль', key: 'role', width: 14 },
    { header: 'Продажи, шт', key: 'salesCount', width: 12 },
    { header: 'Продажи, ₸', key: 'salesSum', width: 16 },
    { header: 'Сертификаты, шт', key: 'certCount', width: 15 },
    { header: 'Заявки (действия)', key: 'ordersClosed', width: 16 },
    { header: 'Задачи выполнено', key: 'tasksDone', width: 16 },
    { header: 'Расходы внесено, ₸', key: 'expenseSum', width: 18 },
    { header: 'Всего действий', key: 'totalActions', width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle' };
  for (const e of employees) {
    ws.addRow({ name: e.name, role: roleRu(e.role), salesCount: e.salesCount, salesSum: e.salesSum, certCount: e.certCount, ordersClosed: e.ordersClosed, tasksDone: e.tasksDone, expenseSum: e.expenseSum, totalActions: e.totalActions });
  }
  ws.getColumn('salesSum').numFmt = '# ##0';
  ws.getColumn('expenseSum').numFmt = '# ##0';
  ws.addRow({});
  ws.addRow({ name: `Период: ${from} — ${to}` });

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="employees-report.xlsx"; filename*=UTF-8''${encodeURIComponent(`Работа_сотрудников_${from}_${to}.xlsx`)}`,
    },
  });
});
