import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSalaryStatus, canSeeSalary, overpayInfo, monthKey, nextMonth, buildSalaryFinanceOp,
} from './employees.dto';

// ── месяцы ────────────────────────────────────────────────────
test('monthKey / nextMonth', () => {
  assert.equal(monthKey('2026-07-18'), '2026-07');
  assert.equal(monthKey(null), '');
  assert.equal(nextMonth('2026-07'), '2026-08');
  assert.equal(nextMonth('2026-12'), '2027-01');
});

// ── статус зарплаты за месяц ──────────────────────────────────
test('computeSalaryStatus: ничего не выплачено → остаток = оклад', () => {
  const s = computeSalaryStatus([], 200000, '2026-07');
  assert.equal(s.paidThisMonth, 0);
  assert.equal(s.remaining, 200000);
  assert.equal(s.advanceIn, 0);
  assert.equal(s.advanceOut, 0);
});

test('computeSalaryStatus: частичная выплата в текущем месяце', () => {
  const s = computeSalaryStatus([{ payDate: '2026-07-05', amount: 120000 }], 200000, '2026-07');
  assert.equal(s.paidThisMonth, 120000);
  assert.equal(s.remaining, 80000);
  assert.equal(s.advanceOut, 0);
});

test('computeSalaryStatus: выплаты только прошлых месяцев не считаются текущим', () => {
  const s = computeSalaryStatus([{ payDate: '2026-06-30', amount: 200000 }], 200000, '2026-07');
  assert.equal(s.paidThisMonth, 0);        // ровно оклад в июне → аванса нет
  assert.equal(s.remaining, 200000);
  assert.equal(s.advanceIn, 0);
});

// ── ПЕРЕПЛАТА и ПЕРЕНОС на следующий месяц ────────────────────
test('computeSalaryStatus: переплата июня переносится авансом в июль', () => {
  // оклад 200k, в июне выплатили 250k → 50k излишек = аванс июля
  const july = computeSalaryStatus([{ payDate: '2026-06-15', amount: 250000 }], 200000, '2026-07');
  assert.equal(july.advanceIn, 50000);      // «Выплачено» июля стартует с 50k
  assert.equal(july.paidThisMonth, 50000);
  assert.equal(july.remaining, 150000);

  // тот же набор, но смотрим июнь: переплата 50k → advanceOut
  const june = computeSalaryStatus([{ payDate: '2026-06-15', amount: 250000 }], 200000, '2026-06');
  assert.equal(june.paidThisMonth, 250000);
  assert.equal(june.remaining, 0);
  assert.equal(june.advanceOut, 50000);
});

test('computeSalaryStatus: аванс + выплата в текущем месяце суммируются', () => {
  const s = computeSalaryStatus(
    [{ payDate: '2026-06-15', amount: 250000 }, { payDate: '2026-07-02', amount: 100000 }],
    200000, '2026-07',
  );
  assert.equal(s.advanceIn, 50000);
  assert.equal(s.paidThisMonth, 150000);    // 50k аванс + 100k
  assert.equal(s.remaining, 50000);
});

test('computeSalaryStatus: аванс не накапливается отрицательным (недоплата не в минус)', () => {
  // в июне недоплатили (100k из 200k) → в июль аванс НЕ переносится
  const s = computeSalaryStatus([{ payDate: '2026-06-10', amount: 100000 }], 200000, '2026-07');
  assert.equal(s.advanceIn, 0);
  assert.equal(s.remaining, 200000);
});

// ── контроль переплаты в форме ────────────────────────────────
test('overpayInfo: превышение оклада фиксирует излишек', () => {
  const r = overpayInfo(180000, 200000, 50000);   // 180k уже + 50k = 230k при окладе 200k
  assert.equal(r.after, 230000);
  assert.equal(r.excess, 30000);
  assert.equal(r.exceeds, true);
});

test('overpayInfo: в пределах оклада — без превышения', () => {
  const r = overpayInfo(100000, 200000, 50000);
  assert.equal(r.excess, 0);
  assert.equal(r.exceeds, false);
  assert.equal(r.alreadyPaidFull, false);
});

test('overpayInfo: оклад уже выплачен полностью', () => {
  const r = overpayInfo(200000, 200000, 10000);
  assert.equal(r.alreadyPaidFull, true);
  assert.equal(r.exceeds, true);
  assert.equal(r.excess, 10000);
});

// ── ПРИВАТНОСТЬ зарплаты (Директор/Админ) ─────────────────────
test('canSeeSalary: зарплата обычного сотрудника видна всем', () => {
  assert.equal(canSeeSalary('viewer-1', 'emp-9', 'master'), true);
  assert.equal(canSeeSalary('viewer-1', 'emp-9', 'accountant'), true);
  assert.equal(canSeeSalary('viewer-1', 'emp-9', 'manager'), true);
});

test('canSeeSalary: зарплата Директора скрыта от других, видна ему самому', () => {
  assert.equal(canSeeSalary('accountant-1', 'dir-1', 'director'), false); // бухгалтер НЕ видит
  assert.equal(canSeeSalary('other-1', 'dir-1', 'director'), false);
  assert.equal(canSeeSalary('dir-1', 'dir-1', 'director'), true);          // сам себя видит
});

test('canSeeSalary: зарплата Админа скрыта от других, видна ему самому', () => {
  assert.equal(canSeeSalary('accountant-1', 'adm-1', 'admin'), false);
  assert.equal(canSeeSalary('adm-1', 'adm-1', 'admin'), true);
});

// ── финансовая операция выплаты ───────────────────────────────
test('buildSalaryFinanceOp: расход с источником «Зарплата»', () => {
  const op = buildSalaryFinanceOp({ name: 'Иванов И.' }, { accountId: 'acc-1', amount: 150000, payDate: '2026-07-10', kind: 'salary' });
  assert.equal(op.opType, 'Расход');
  assert.equal(op.source, 'Зарплата');
  assert.equal(op.amount, 150000);
  assert.equal(op.accountId, 'acc-1');
  assert.equal(op.opDate, '2026-07-10');
  assert.match(op.name, /Иванов/);
});

test('buildSalaryFinanceOp: аванс помечается в названии', () => {
  const op = buildSalaryFinanceOp({ name: 'Пётр П.' }, { accountId: 'acc-1', amount: 50000, kind: 'advance' });
  assert.match(op.name, /аванс/);
});
