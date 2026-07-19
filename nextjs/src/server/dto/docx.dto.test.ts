import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnWidthsPct, docxSpecSchema } from './docx.dto';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

test('columnWidthsPct: заданные ширины масштабируются к 100', () => {
  const w = columnWidthsPct([{ width: 4 }, { width: 14 }, { width: 19 }, { width: 63 }]);
  assert.ok(Math.abs(sum(w) - 100) < 1e-6, 'сумма = 100');
  assert.ok(w[1] > w[0] && w[3] > w[2], 'пропорции сохранены');
});

test('columnWidthsPct: без ширин — равные доли', () => {
  const w = columnWidthsPct([{}, {}, {}, {}]);
  assert.ok(Math.abs(sum(w) - 100) < 1e-6);
  w.forEach(x => assert.ok(Math.abs(x - 25) < 1e-6));
});

test('columnWidthsPct: смешанные — пустые заполняются средним, сумма 100', () => {
  const w = columnWidthsPct([{ width: 10 }, {}, { width: 30 }]);
  assert.ok(Math.abs(sum(w) - 100) < 1e-6);
});

test('docxSpecSchema: дефолты и обязательность колонок', () => {
  const s = docxSpecSchema.parse({ columns: [{ header: '№' }] });
  assert.equal(s.orientation, 'portrait');
  assert.deepEqual(s.titleLines, []);
  assert.equal(s.filename, 'Документ.docx');
  assert.throws(() => docxSpecSchema.parse({ columns: [] }));
});
