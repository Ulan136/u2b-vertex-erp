import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodRange, withinPeriod, mergeEmployeeRows, buildDynamics } from './reports.dto';

test('periodRange: пресеты считаются от переданной «сегодня»', () => {
  const now = '2026-07-22';
  assert.deepEqual(periodRange({ preset: 'today' }, now), { from: '2026-07-22', to: '2026-07-22' });
  assert.deepEqual(periodRange({ preset: '7d' }, now), { from: '2026-07-16', to: '2026-07-22' });
  assert.deepEqual(periodRange({ preset: 'month' }, now), { from: '2026-07-01', to: '2026-07-22' });
  assert.deepEqual(periodRange({ preset: 'quarter' }, now), { from: '2026-07-01', to: '2026-07-22' });   // Q3 → июль
  assert.deepEqual(periodRange({ preset: 'quarter' }, '2026-05-10'), { from: '2026-04-01', to: '2026-05-10' }); // Q2 → апрель
  assert.deepEqual(periodRange({ preset: 'custom', from: '2026-01-01', to: '2026-03-31' }, now), { from: '2026-01-01', to: '2026-03-31' });
});

test('withinPeriod: границы включительно', () => {
  assert.ok(withinPeriod('2026-07-10', '2026-07-01', '2026-07-31'));
  assert.ok(withinPeriod('2026-07-01T09:00:00Z', '2026-07-01', '2026-07-31'));   // с временем
  assert.ok(!withinPeriod('2026-06-30', '2026-07-01', '2026-07-31'));
  assert.ok(!withinPeriod(null, '2026-07-01', '2026-07-31'));
});

test('mergeEmployeeRows: агрегаты сводятся, нули заполняются, сортировка по действиям', () => {
  const users = [{ id: 'u1', name: 'Аскар', role: 'manager' }, { id: 'u2', name: 'Бота', role: 'accountant' }, { id: 'u3', name: 'Вика', role: 'master' }];
  const rows = mergeEmployeeRows(users, {
    sales: { u1: { count: 3, sum: 150000 }, u2: { count: 1, sum: 20000 } },
    certs: { u3: 12 },
    certSrc: { u3: { 'САМИ': 8, 'ВДК': 4 } },
    orders: { u3: 5 },
    tasks: { u1: 2 },
    expenses: { u2: 30000 },
    actions: { u1: 40, u2: 10, u3: 25 },
  });
  assert.equal(rows[0].userId, 'u1');           // больше всего действий (40)
  assert.equal(rows[0].salesCount, 3); assert.equal(rows[0].salesSum, 150000); assert.equal(rows[0].tasksDone, 2);
  assert.equal(rows[1].userId, 'u3');           // 25 действий
  assert.equal(rows[1].certCount, 12); assert.deepEqual(rows[1].certBySource, { 'САМИ': 8, 'ВДК': 4 }); assert.equal(rows[1].ordersClosed, 5);
  assert.equal(rows[2].userId, 'u2');
  assert.equal(rows[2].expenseSum, 30000);
  // отсутствующие метрики — нули
  assert.equal(rows[0].certCount, 0); assert.equal(rows[0].expenseSum, 0);
});

test('buildDynamics: продажи и сертификаты сливаются по дням, отсортированы', () => {
  const dyn = buildDynamics(
    [{ day: '2026-07-20', sum: 50000 }, { day: '2026-07-22', sum: 30000 }],
    [{ day: '2026-07-22', count: 4 }, { day: '2026-07-21', count: 2 }],
  );
  assert.deepEqual(dyn, [
    { day: '2026-07-20', salesSum: 50000, certCount: 0 },
    { day: '2026-07-21', salesSum: 0, certCount: 2 },
    { day: '2026-07-22', salesSum: 30000, certCount: 4 },
  ]);
});
