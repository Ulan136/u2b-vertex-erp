import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStatus, remainingOf, round2, financeOpTypeForDebt, buildPaymentFinanceOp,
  debtCreateSchema,
} from './debts.dto';

const ACC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACC2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// ── status derivation ────────────────────────────────────────
test('computeStatus: paid 0 → open', () => {
  assert.equal(computeStatus(100, 0), 'open');
});
test('computeStatus: 0 < paid < amount → partial', () => {
  assert.equal(computeStatus(100, 50), 'partial');
  assert.equal(computeStatus(100, 99.99), 'partial');
});
test('computeStatus: paid >= amount → closed', () => {
  assert.equal(computeStatus(100, 100), 'closed');
  assert.equal(computeStatus(100, 150), 'closed');
});
test('computeStatus: zero-amount debt with no payment is open', () => {
  assert.equal(computeStatus(0, 0), 'open');
});

// ── status recomputation after a payment / after a rollback ──
test('status recompute: partial payment then rollback returns to open', () => {
  const amount = 100;
  let paid = 0;
  // pay 40 → partial
  paid += 40;
  assert.equal(computeStatus(amount, paid), 'partial');
  // pay remaining 60 → closed
  paid += 60;
  assert.equal(computeStatus(amount, paid), 'closed');
  // delete the 60 payment (rollback) → partial
  paid -= 60;
  assert.equal(computeStatus(amount, paid), 'partial');
  // delete the 40 payment (rollback) → open
  paid -= 40;
  assert.equal(computeStatus(amount, paid), 'open');
});

test('remainingOf: remaining never goes negative', () => {
  assert.equal(remainingOf(100, 40), 60);
  assert.equal(remainingOf(100, 100), 0);
  assert.equal(remainingOf(100, 130), 0);
});

// ── payment → finance operation (Приход / Расход) ────────────
test('financeOpTypeForDebt: debit → Приход, credit → Расход', () => {
  assert.equal(financeOpTypeForDebt('debit'), 'Приход');
  assert.equal(financeOpTypeForDebt('credit'), 'Расход');
});

test('buildPaymentFinanceOp: debit payment creates a Приход op on the account', () => {
  const op = buildPaymentFinanceOp({ type: 'debit', accountId: null }, { amount: 500, accountId: ACC }, 'ТОО Ромашка');
  assert.ok(op);
  assert.equal(op.opType, 'Приход');
  assert.equal(op.accountId, ACC);
  assert.equal(op.amount, 500);
  assert.equal(op.source, 'Долг');
  assert.match(op.name, /Ромашка/);
});

test('buildPaymentFinanceOp: credit payment creates a Расход op', () => {
  const op = buildPaymentFinanceOp({ type: 'credit', accountId: null }, { amount: 250, accountId: ACC }, 'Поставщик');
  assert.ok(op);
  assert.equal(op.opType, 'Расход');
});

test('buildPaymentFinanceOp: falls back to the debt account when payment has none', () => {
  const op = buildPaymentFinanceOp({ type: 'debit', accountId: ACC2 }, { amount: 100, accountId: null }, 'X');
  assert.ok(op);
  assert.equal(op.accountId, ACC2);
});

test('buildPaymentFinanceOp: no account anywhere → null (payment still recorded, no ledger op)', () => {
  const op = buildPaymentFinanceOp({ type: 'debit', accountId: null }, { amount: 100, accountId: null }, 'X');
  assert.equal(op, null);
});

// ── create validation: counterparty required ─────────────────
test('debtCreateSchema: rejects when neither client nor name is given', () => {
  assert.throws(() => debtCreateSchema.parse({ type: 'debit', amount: 100 }));
});
test('debtCreateSchema: accepts free-text counterparty', () => {
  const d = debtCreateSchema.parse({ type: 'credit', counterpartyName: 'ИП Иванов', amount: 100 });
  assert.equal(d.counterpartyName, 'ИП Иванов');
});
test('debtCreateSchema: accepts client-based counterparty', () => {
  const d = debtCreateSchema.parse({ type: 'debit', counterpartyClientId: ACC, amount: 100 });
  assert.equal(d.counterpartyClientId, ACC);
});
test('debtCreateSchema: rejects non-positive amount', () => {
  assert.throws(() => debtCreateSchema.parse({ type: 'debit', counterpartyName: 'X', amount: 0 }));
});

// ── стартовое «уже погашено» + учёт кредита ──────────────────
test('стартовое погашено: долг 500 000 / погашено 100 000 → остаток 400 000, статус partial', () => {
  assert.equal(computeStatus(500000, 100000), 'partial');
  assert.equal(remainingOf(500000, 100000), 400000);
});

test('погашение 50 000 после старта 100 000 → остаток 350 000', () => {
  const paid = round2(100000 + 50000);
  assert.equal(paid, 150000);
  assert.equal(remainingOf(500000, paid), 350000);
});

test('debtCreateSchema: стартовое погашено не больше суммы', () => {
  assert.doesNotThrow(() => debtCreateSchema.parse({ type: 'credit', counterpartyName: 'X', amount: 500000, paidAmount: 100000 }));
  assert.throws(() => debtCreateSchema.parse({ type: 'credit', counterpartyName: 'X', amount: 100000, paidAmount: 200000 }));
});
