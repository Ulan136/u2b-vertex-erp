import { docxSpecSchema } from '@/server/dto/docx.dto';

// Единый генератор Excel-таблиц из того же spec, что и /api/v2/docx (шапка +
// подзаголовок + таблица с границами + опц. строка «Итого»). Возвращает .xlsx.
export async function buildXlsx(input: unknown): Promise<{ buffer: Buffer; filename: string }> {
  const spec = docxSpecSchema.parse(input);
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Лист1', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: spec.orientation === 'landscape' ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0, footer: 0 },
    },
  });
  const nCols = spec.columns.length;
  ws.columns = spec.columns.map(c => ({ width: c.width && c.width > 0 ? c.width : 12 }));
  const lastCol = ws.getColumn(nCols).letter;
  const thin = { style: 'thin' as const, color: { argb: 'FF000000' } };
  const border = { top: thin, bottom: thin, left: thin, right: thin };
  const alignOf = (a?: string) => (a === 'center' || a === 'right' ? a : 'left') as 'left' | 'center' | 'right';
  let r = 1;

  for (const line of spec.titleLines) {
    ws.mergeCells(`A${r}:${lastCol}${r}`);
    const c = ws.getCell(`A${r}`); c.value = line; c.font = { bold: true, size: 13 }; c.alignment = { horizontal: 'center' };
    r++;
  }
  if (spec.subtitle) {
    ws.mergeCells(`A${r}:${lastCol}${r}`);
    const c = ws.getCell(`A${r}`); c.value = spec.subtitle; c.font = { size: 10, color: { argb: 'FF555555' } }; c.alignment = { horizontal: 'center' };
    r++;
  }
  r++;   // пустая строка-разделитель

  const head = ws.getRow(r);
  spec.columns.forEach((col, i) => {
    const c = head.getCell(i + 1);
    c.value = col.header; c.font = { bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };
    c.border = border;
  });
  r++;

  for (const row of spec.rows) {
    const xr = ws.getRow(r);
    for (let i = 0; i < nCols; i++) {
      const c = xr.getCell(i + 1);
      c.value = row[i] == null ? '' : row[i];
      c.alignment = { horizontal: alignOf(spec.columns[i]?.align), vertical: 'middle' };
      c.border = border;
    }
    r++;
  }
  if (spec.totalRow) {
    const xr = ws.getRow(r);
    spec.totalRow.forEach((v, i) => { const c = xr.getCell(i + 1); c.value = v == null ? '' : v; c.font = { bold: true }; c.border = border; });
    r++;
  }

  const buf = await wb.xlsx.writeBuffer();
  const filename = spec.filename.replace(/\.docx$/i, '.xlsx');
  return { buffer: Buffer.from(buf), filename: /\.xlsx$/i.test(filename) ? filename : filename + '.xlsx' };
}
