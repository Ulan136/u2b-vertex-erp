import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceDeltas, accountCreateSchema, financeOperationSchema } from './finance.dto';

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
