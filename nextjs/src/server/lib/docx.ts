import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign, PageOrientation, TableLayoutType,
} from 'docx';
import { docxSpecSchema, columnWidthsPct } from '@/server/dto/docx.dto';

// Единый генератор официальных документов (реестр/накладная/извещение):
// шапка (центр) + мета (справа) + таблица с границами + строка «Итого» + подписи.
// Times New Roman, книжная/альбомная ориентация. Возвращает готовый .docx.
const FONT = 'Times New Roman';
const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const;

function edge() { return { style: BorderStyle.SINGLE, size: 4, color: '000000' }; }
function cellBorders() { const b = edge(); return { top: b, bottom: b, left: b, right: b }; }

function mkCell(
  text: string | number | null,
  align: (typeof AlignmentType)[keyof typeof AlignmentType],
  opts: { widthPct?: number; fill?: string; bold?: boolean } = {},
) {
  return new TableCell({
    borders: cellBorders(),
    verticalAlign: VerticalAlign.CENTER,
    width: opts.widthPct != null ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { fill: opts.fill } : undefined,
    margins: { top: 40, bottom: 40, left: 60, right: 60 },
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text: String(text == null ? '' : text), font: FONT, size: 16, bold: !!opts.bold })],
    })],
  });
}

export async function buildDocx(input: unknown): Promise<{ buffer: Buffer; filename: string }> {
  const spec = docxSpecSchema.parse(input);
  const widths = columnWidthsPct(spec.columns);
  const orientation = spec.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT;

  const titleParas = spec.titleLines.map((line, i) => new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: i === spec.titleLines.length - 1 ? 120 : 0 },
    children: [new TextRun({ text: line, bold: true, font: FONT, size: i === 0 ? 30 : 22 })],
  }));

  const subtitleParas = spec.subtitle ? [new Paragraph({
    alignment: AlignmentType.RIGHT, spacing: { after: 120 },
    children: [new TextRun({ text: spec.subtitle, font: FONT, size: 18, color: '444444' })],
  })] : [];

  const headerRow = new TableRow({
    tableHeader: true,
    children: spec.columns.map((c, i) => mkCell(c.header, AlignmentType.CENTER, { widthPct: widths[i], fill: 'EEEEEE', bold: true })),
  });
  const bodyRows = spec.rows.map(row => new TableRow({
    children: spec.columns.map((c, i) => mkCell(row[i] ?? '', ALIGN[c.align || 'center'], { widthPct: widths[i] })),
  }));
  const rows = [headerRow, ...bodyRows];
  if (spec.totalRow && spec.totalRow.length) {
    rows.push(new TableRow({
      children: spec.columns.map((c, i) => mkCell(spec.totalRow![i] ?? '', ALIGN[c.align || 'center'], { widthPct: widths[i], bold: true })),
    }));
  }

  const table = new Table({ layout: TableLayoutType.FIXED, width: { size: 100, type: WidthType.PERCENTAGE }, rows });

  const signParas = spec.signatures.map(s => new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 400 },
    children: [new TextRun({ text: s, bold: true, font: FONT, size: 20 })],
  }));

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 16 } } } },
    sections: [{
      properties: { page: { size: { orientation }, margin: { top: 567, right: 567, bottom: 567, left: 567 } } },
      children: [...titleParas, ...subtitleParas, table, ...signParas],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer, filename: spec.filename };
}
