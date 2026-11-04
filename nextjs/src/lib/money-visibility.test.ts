import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSeeBalances, canSeeBranchSpend, accountLabel, fundsOk } from './money-visibility';

const fmt = (n: number) => n.toLocaleString('ru-RU') + ' ₸';
const kaspi = { icon: '💳', name: 'Каспи', balance: '150000' };

test('canSeeBalances: остатки в цифрах — только Админу', () => {
  assert.equal(canSeeBalances('admin'), true);
  for (const r of ['manager', 'accountant', 'director', 'master', 'branch', '', null]) {
    assert.equal(canSeeBalances(r), false, `${r} не должен видеть остатки`);
  }
});

test('accountLabel: Админ видит сумму, остальные — только название', () => {
  // Ожидание собираем тем же fmt: toLocaleString разделяет разряды НЕРАЗРЫВНЫМ
  // пробелом, и литерал с обычным пробелом тут не совпадёт.
  assert.equal(accountLabel(kaspi, 'admin', fmt), `💳 Каспи · ${fmt(150000)}`);
  assert.equal(accountLabel(kaspi, 'manager', fmt), '💳 Каспи');
  assert.equal(accountLabel(kaspi, 'director', fmt), '💳 Каспи');
});

test('accountLabel: в подписи для неадмина нет ни одной цифры остатка', () => {
  const label = accountLabel(kaspi, 'manager', fmt);
  assert.equal(/\d/.test(label), false, 'сумма не должна просочиться в подпись');
});

// Менеджер головного офиса (Тараз) не должен видеть, сколько тратят филиалы.
test('canSeeBranchSpend: расходы филиалов — Админу, Бухгалтеру и Директору', () => {
  for (const r of ['admin', 'accountant', 'director']) assert.equal(canSeeBranchSpend(r), true, r);
  for (const r of ['manager', 'master', 'branch', '', null]) assert.equal(canSeeBranchSpend(r), false, `${r} не должен видеть расходы филиалов`);
});

test('fundsOk: подсветка достаточности не раскрывает сумму', () => {
  assert.equal(fundsOk('150000', 100000), true);
  assert.equal(fundsOk('150000', 200000), false);
  assert.equal(fundsOk(null, 1), false);
});
