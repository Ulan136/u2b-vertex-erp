import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceDeltas, accountCreateSchema, financeOperationSchema, scopeFinance, movementAmount, inPeriod, FINANCE_SECTIONS, FINANCE_SECTION_META, sectionNo, sectionTitle, numberAccounts } from './finance.dto';

// ── нумерация и порядок разделов (категорий) ─────────────────
test('FINANCE_SECTIONS: порядок №1 Поверка · №2 Продажа · №3 Филиалы · №4 Прочие', () => {
  assert.deepEqual([...FINANCE_SECTIONS], ['poverka', 'sale', 'branch', 'other']);
  assert.deepEqual(FINANCE_SECTION_META.map(s => s.no), [1, 2, 3, 4]);
});
test('sectionNo / sectionTitle', () => {
  assert.equal(sectionNo('poverka'), 1);
  assert.equal(sectionNo('branch'), 3);
  assert.equal(sectionNo('other'), 4);
  assert.equal(sectionTitle('poverka'), '№1 Поверка');
  assert.equal(sectionTitle('branch'), '№3 Филиалы');
  assert.equal(sectionTitle('other'), '№4 Прочие операции');
  assert.equal(sectionTitle('other', false), 'Прочие операции');
  assert.equal(sectionNo('unknown'), 4);   // фолбэк на «Прочие»
});
test('numberAccounts: нумерует счета внутри раздела по sort_order', () => {
  const accs = [
    { id: 'p-nal', section: 'poverka', sortOrder: 2, name: 'Наличка' },
    { id: 'p-kaspi', section: 'poverka', sortOrder: 0, name: 'Каспи' },
    { id: 'p-bck', section: 'poverka', sortOrder: 1, name: 'БЦК' },
    { id: 's-kaspi', section: 'sale', sortOrder: 10, name: 'Каспи' },
  ];
  const n = numberAccounts(accs);
  assert.equal(n['p-kaspi'], 1);   // №1 Каспи
  assert.equal(n['p-bck'], 2);     // №2 БЦК
  assert.equal(n['p-nal'], 3);     // №3 Наличка
  assert.equal(n['s-kaspi'], 1);   // нумерация отдельная в каждом разделе
});

test('balanceDeltas: приход +сумма на счёт', () => {
  assert.deepEqual(balanceDeltas('Приход', '5000', 'a'), [{ id: 'a', delta: 5000 }]);
});
test('balanceDeltas: расход −сумма со счёта', () => {
  assert.deepEqual(balanceDeltas('Расход', 3000, 'a'), [{ id: 'a', delta: -3000 }]);
});
test('balanceDeltas: перевод — минус с источника, плюс на получателя', () => {
  assert.deepEqual(balanceDeltas('Перевод', 1000, 'a', 'b'), [{ id: 'a', delta: -1000 }, { id: 'b', delta: 1000 }]);
});
test('balanceDeltas: перевод без получателя — только списание', () => {
  assert.deepEqual(balanceDeltas('Перевод', 1000, 'a', null), [{ id: 'a', delta: -1000 }]);
});
test('balanceDeltas: неизвестный тип → ничего не меняет', () => {
  assert.deepEqual(balanceDeltas('???', 1000, 'a'), []);
});

test('accountCreateSchema: имя обязательно, дефолты применяются', () => {
  const a = accountCreateSchema.parse({ name: 'Каспи' });
  assert.equal(a.category, 'other');
  assert.equal(a.balance, 0);
  assert.throws(() => accountCreateSchema.parse({ name: '' }));
});
test('financeOperationSchema: принимает toAccountId для перевода', () => {
  const op = financeOperationSchema.parse({ name: 'Перевод', accountId: 'a', opType: 'Перевод', amount: 1000, toAccountId: 'b' });
  assert.equal(op.toAccountId, 'b');
});
test('accountCreateSchema: секция обязательна с дефолтом other', () => {
  assert.equal(accountCreateSchema.parse({ name: 'Каспи' }).section, 'other');
  assert.equal(accountCreateSchema.parse({ name: 'Каспи', section: 'poverka' }).section, 'poverka');
});

// ── знак движения + период ──────────────────────────────────
test('movementAmount: приход +, расход/перевод −', () => {
  assert.equal(movementAmount('Приход', 5000), 5000);
  assert.equal(movementAmount('Расход', 5000), -5000);
  assert.equal(movementAmount('Перевод', 5000), -5000);
});
test('inPeriod: границы включительно', () => {
  assert.equal(inPeriod('2026-07-10', '2026-07-01', '2026-07-18'), true);
  assert.equal(inPeriod('2026-06-30', '2026-07-01', '2026-07-18'), false);
  assert.equal(inPeriod('2026-07-18', '2026-07-01', '2026-07-18'), true);
  assert.equal(inPeriod('2026-07-10', null, null), true);
});

// ── скоуп по разделу и периоду + пересчёт сводки ────────────
const ACC = [
  { id: 'p1', section: 'poverka', balance: '12000' },
  { id: 'p2', section: 'poverka', balance: '104000' },
  { id: 's1', section: 'sale',    balance: '186000' },
  { id: 'b1', section: 'branch',  balance: '58000' },
];
const OPS = [
  { accountId: 'p1', opType: 'Приход', amount: '3500',  opDate: '2026-07-17' },
  { accountId: 'p1', opType: 'Расход', amount: '6000',  opDate: '2026-07-10' },
  { accountId: 's1', opType: 'Приход', amount: '90000', opDate: '2026-07-16' },
  { accountId: 'b1', opType: 'Перевод',amount: '40000', opDate: '2026-07-06' },
  { accountId: 'p2', opType: 'Приход', amount: '3500',  opDate: '2026-05-01' }, // вне периода
];
const RANGE = { from: '2026-06-01', to: '2026-07-18' };

test('scopeFinance: раздел «all» — все счета, сводка по периоду', () => {
  const r = scopeFinance(ACC, OPS, { section: 'all', ...RANGE });
  assert.equal(r.total, 360000);                 // 12000+104000+186000+58000
  assert.equal(r.movs.length, 4);                // майская операция вне периода — отброшена
  assert.equal(r.income, 93500);                 // 3500 + 90000
  assert.equal(r.expense, 46000);                // 6000 + 40000 (перевод считается расходом)
});
test('scopeFinance: фильтр по разделу «poverka»', () => {
  const r = scopeFinance(ACC, OPS, { section: 'poverka', ...RANGE });
  assert.deepEqual(r.visAccts.map(a => a.id).sort(), ['p1', 'p2']);
  assert.equal(r.total, 116000);                 // 12000 + 104000
  assert.equal(r.movs.length, 2);                // только по счетам поверки в периоде
  assert.equal(r.income, 3500);
  assert.equal(r.expense, 6000);
});
test('scopeFinance: период отсекает старые движения', () => {
  const r = scopeFinance(ACC, OPS, { section: 'all', from: '2026-07-01', to: '2026-07-18' });
  assert.equal(r.movs.length, 4);                // майская уже была вне даже широкого периода
  const narrow = scopeFinance(ACC, OPS, { section: 'all', from: '2026-07-15', to: '2026-07-18' });
  assert.equal(narrow.movs.length, 2);           // только 17.07 и 16.07
});
