import { z } from 'zod';

export const docxColumnSchema = z.object({
  header: z.string().default(''),
  width: z.number().optional(),                       // относительная ширина (%/произвольная — нормализуется)
  align: z.enum(['left', 'center', 'right']).optional(),
});

const cell = z.union([z.string(), z.number(), z.null()]);

export const docxSpecSchema = z.object({
  titleLines: z.array(z.string()).default([]),        // центрированные строки шапки
  subtitle: z.string().nullish(),                     // мета справа (источник/дата/кол-во)
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  columns: z.array(docxColumnSchema).min(1, 'Нужна хотя бы одна колонка'),
  rows: z.array(z.array(cell)).default([]),
  totalRow: z.array(cell).nullish(),                  // строка «Итого»
  signatures: z.array(z.string()).default([]),
  filename: z.string().default('Документ.docx'),
});

export type DocxSpec = z.infer<typeof docxSpecSchema>;

// Ширины колонок → проценты, суммирующиеся к 100 (пустые заполняются средним).
// Чистая функция — чтобы таблица не разъезжалась при любой сумме входных ширин.
export function columnWidthsPct(columns: Array<{ width?: number }>): number[] {
  const n = columns.length || 1;
  const provided = columns.map(c => (typeof c.width === 'number' && c.width > 0 ? c.width : 0));
  const nonZero = provided.filter(w => w > 0);
  const avg = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 100 / n;
  const filled = provided.map(w => (w > 0 ? w : avg));
  const sum = filled.reduce((a, b) => a + b, 0) || 1;
  return filled.map(w => (w * 100) / sum);
}
