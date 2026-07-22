import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItems, aggregateItems, financePostable, saleOutMovements, saleReturnMovements, paymentsTotal, payStatusFor, remainingToPay } from './sales.dto';
import { stockAfter, canApplyStock, STOCK_SIGN } from './products.dto';
import { balanceDeltas } from './finance.dto';

// Мини-симуляция учёта из ТЕХ ЖЕ производственных хелперов, что и в сервисах:
// склад двигается через stockAfter/STOCK_SIGN, финансы — через balanceDeltas,
// приход создаётся только при financePostable(payStatus).
function applyMove(stock: Record<string, number>, productId: string, moveType: string, qty: number) {
  if (!canApplyStock(stock[productId] ?? 0, moveType, qty)) throw new Error('OVERDRAFT');
  stock[productId] = stockAfter(stock[productId] ?? 0, moveType, qty);
}
function applyFinance(bal: Record<string, number>, opType: string, amount: number, accountId: string) {
  for (const { id, delta } of balanceDeltas(opType, amount, accountId)) bal[id] = (bal[id] ?? 0) + delta;
}
function postSale(stock: Record<string, number>, bal: Record<string, number>, sale: { items: Parameters<typeof normalizeItems>[0]['items']; payStatus: string; accountId: string }) {
  const items = normalizeItems({ items: sale.items });
  const agg = aggregateItems(items);
  for (const mv of saleOutMovements(items)) applyMove(stock, mv.productId, mv.moveType, mv.qty);   // OUT независимо от оплаты
  if (financePostable(sale.payStatus)) applyFinance(bal, 'Приход', agg.total, sale.accountId);      // приход только оплаченной
  return { items, total: agg.total };
}
function cancelSale(stock: Record<string, number>, bal: Record<string, number>, items: ReturnType<typeof normalizeItems>, total: number, wasPaid: boolean, accountId: string) {
  for (const mv of saleReturnMovements(items)) applyMove(stock, mv.productId, mv.moveType, mv.qty); // возврат IN
  if (wasPaid) applyFinance(bal, 'Расход', total, accountId);                                        // сторно прихода
}

const X = 'prod-X', Y = 'prod-Y', ACC = 'acc-1';
const itemX = (q: number, p = 10000) => [{ productId: X, qty: q, price: p }];
const itemY = (q: number, p = 6000) => [{ productId: Y, qty: q, price: p }];

test('знак движения и запрет овердрафта (чистые функции)', () => {
  assert.equal(STOCK_SIGN.OUT, -1); assert.equal(STOCK_SIGN.IN, 1);
  assert.equal(stockAfter(100, 'OUT', 2), 98);
  assert.equal(stockAfter(98, 'IN', 2), 100);
  assert.ok(canApplyStock(100, 'OUT', 100));
  assert.ok(!canApplyStock(100, 'OUT', 150));   // нельзя списать больше остатка
});

test('а) продажа 2×X «Оплачено» → остаток 100→98, приход в финансы на сумму', () => {
  const stock = { [X]: 100 }, bal = { [ACC]: 0 };
  const { total } = postSale(stock, bal, { items: itemX(2), payStatus: 'Оплачено', accountId: ACC });
  assert.equal(stock[X], 98);
  assert.equal(total, 20000);
  assert.equal(bal[ACC], 20000);   // приход появился
});

test('б) продажа 3×Y «В ожидании» → остаток 100→97, финансов нет; перевод в «Оплачено» → приход появился', () => {
  const stock = { [Y]: 100 }, bal = { [ACC]: 0 };
  const items = normalizeItems({ items: itemY(3) });
  const agg = aggregateItems(items);
  // проведение без оплаты
  for (const mv of saleOutMovements(items)) applyMove(stock, mv.productId, mv.moveType, mv.qty);
  assert.equal(stock[Y], 97);
  assert.ok(!financePostable('В ожидании'));
  assert.equal(bal[ACC], 0);       // финансов пусто
  // перевод в «Оплачено» — приход появляется, склад не двигается повторно
  if (financePostable('Оплачено')) applyFinance(bal, 'Приход', agg.total, ACC);
  assert.equal(bal[ACC], 18000);
  assert.equal(stock[Y], 97);      // остаток не изменился при переключении оплаты
});

test('в) отмена оплаченной продажи (а) → остаток 98→100, сторно финансов (баланс к нулю)', () => {
  const stock = { [X]: 100 }, bal = { [ACC]: 0 };
  const { items, total } = postSale(stock, bal, { items: itemX(2), payStatus: 'Оплачено', accountId: ACC });
  assert.equal(stock[X], 98); assert.equal(bal[ACC], 20000);
  cancelSale(stock, bal, items, total, true, ACC);
  assert.equal(stock[X], 100);     // возврат
  assert.equal(bal[ACC], 0);       // сторно: приход + сторно = 0
});

test('г) попытка продать 150×X (> остатка) → отказ, ничего не изменилось', () => {
  const stock = { [X]: 100 }, bal = { [ACC]: 0 };
  assert.throws(() => postSale(stock, bal, { items: itemX(150), payStatus: 'Оплачено', accountId: ACC }), /OVERDRAFT/);
  assert.equal(stock[X], 100);     // остаток не тронут
  assert.equal(bal[ACC], 0);       // финансов нет
});

test('д) продажа с 2 разными товарами в одной продаже → оба остатка списаны', () => {
  const stock = { [X]: 100, [Y]: 100 }, bal = { [ACC]: 0 };
  const items = [{ productId: X, qty: 2, price: 10000 }, { productId: Y, qty: 3, price: 6000 }];
  const { total } = postSale(stock, bal, { items, payStatus: 'Оплачено', accountId: ACC });
  assert.equal(stock[X], 98);
  assert.equal(stock[Y], 97);
  assert.equal(total, 2 * 10000 + 3 * 6000);   // 38000
  assert.equal(bal[ACC], 38000);
  assert.equal(saleOutMovements(normalizeItems({ items })).length, 2);   // два списания
});

// ── Смешанная оплата ─────────────────────────────────────────
const KASPI = 'acc-kaspi', CASH = 'acc-cash';
// Провести смешанную оплату: каждая строка → свой приход на свой счёт.
function postPayments(bal: Record<string, number>, payments: Array<{ accountId: string; amount: number }>) {
  for (const p of payments) applyFinance(bal, 'Приход', p.amount, p.accountId);
}

test('статус оплаты: полная → Оплачено, часть → Частично, ноль → Ожидает', () => {
  assert.equal(payStatusFor(53000, 53000), 'Оплачено');
  assert.equal(payStatusFor(53000, 40000), 'Частично');
  assert.equal(payStatusFor(53000, 0), 'Ожидает');
  assert.equal(paymentsTotal([{ amount: 30000 }, { amount: 10000 }]), 40000);
  assert.equal(remainingToPay(53000, 40000), 13000);
});

test('смешанная оплата 2 счетами → 2 прихода на свои счета, статус Оплачено', () => {
  const bal = { [KASPI]: 0, [CASH]: 0 };
  const total = 53000;
  const payments = [{ accountId: KASPI, amount: 45000 }, { accountId: CASH, amount: 8000 }];
  postPayments(bal, payments);
  assert.equal(bal[KASPI], 45000);          // приход на Каспи
  assert.equal(bal[CASH], 8000);            // приход на Наличку
  assert.equal(paymentsTotal(payments), total);
  assert.equal(payStatusFor(total, paymentsTotal(payments)), 'Оплачено');
});

test('частичная оплата → «Частично», дооплата закрывает в «Оплачено»', () => {
  const bal = { [KASPI]: 0, [CASH]: 0 };
  const total = 53000;
  const first = [{ accountId: KASPI, amount: 40000 }];
  postPayments(bal, first);
  assert.equal(payStatusFor(total, paymentsTotal(first)), 'Частично');
  assert.equal(remainingToPay(total, paymentsTotal(first)), 13000);
  // дооплата остатка второй строкой
  const topup = [{ accountId: CASH, amount: 13000 }];
  postPayments(bal, topup);
  const paid = paymentsTotal([...first, ...topup]);
  assert.equal(paid, total);
  assert.equal(payStatusFor(total, paid), 'Оплачено');
  assert.equal(bal[KASPI], 40000); assert.equal(bal[CASH], 13000);
});

test('отмена продажи со смешанной оплатой → сторно ВСЕХ оплат по своим счетам', () => {
  const bal = { [KASPI]: 0, [CASH]: 0 };
  const payments = [{ accountId: KASPI, amount: 45000 }, { accountId: CASH, amount: 8000 }];
  postPayments(bal, payments);
  // сторно каждой оплаты обратной операцией на её счёт
  for (const p of payments) applyFinance(bal, 'Расход', p.amount, p.accountId);
  assert.equal(bal[KASPI], 0); assert.equal(bal[CASH], 0);   // все счета вернулись к нулю
});
