import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountInWordsKzt, intToWords, nextDocNumber, computeItems } from './documents.dto';

// ── сумма прописью ────────────────────────────────────────────
test('amountInWordsKzt: образец из счёта — 95000', () => {
  assert.equal(amountInWordsKzt(95000), 'Девяносто пять тысяч тенге 00 тиын');
});
test('amountInWordsKzt: образец из акта — 80000', () => {
  assert.equal(amountInWordsKzt(80000), 'Восемьдесят тысяч тенге 00 тиын');
});
test('amountInWordsKzt: тиыны (копейки)', () => {
  assert.equal(amountInWordsKzt(1234.56), 'Одна тысяча двести тридцать четыре тенге 56 тиын');
  assert.equal(amountInWordsKzt(0.05), 'Ноль тенге 05 тиын');
});
test('amountInWordsKzt: род и склонения', () => {
  assert.equal(amountInWordsKzt(1), 'Один тенге 00 тиын');            // тенге — муж. род
  assert.equal(amountInWordsKzt(2), 'Два тенге 00 тиын');
  assert.equal(amountInWordsKzt(21), 'Двадцать один тенге 00 тиын');
  assert.equal(amountInWordsKzt(2000), 'Две тысячи тенге 00 тиын');   // тысяча — жен. род
  assert.equal(amountInWordsKzt(1000), 'Одна тысяча тенге 00 тиын');
  assert.equal(amountInWordsKzt(111), 'Сто одиннадцать тенге 00 тиын');
});
test('amountInWordsKzt: миллионы', () => {
  assert.equal(amountInWordsKzt(2500000), 'Два миллиона пятьсот тысяч тенге 00 тиын');
  assert.equal(amountInWordsKzt(1000000), 'Один миллион тенге 00 тиын');
});
test('intToWords: ноль', () => {
  assert.equal(intToWords(0), 'ноль');
});

// ── автонумерация ─────────────────────────────────────────────
test('nextDocNumber: продолжает с номера образца', () => {
  assert.equal(nextDocNumber('invoice', []), 37);       // образец счёта №36 → следующий 37
  assert.equal(nextDocNumber('akt', []), 13);           // образец акта №12 → 13
  assert.equal(nextDocNumber('invoice', [37, 38, 40]), 41);
  assert.equal(nextDocNumber('akt', [13, 14]), 15);
});
test('nextDocNumber: не опускается ниже seed', () => {
  assert.equal(nextDocNumber('invoice', [5]), 37);      // старьё не тянет вниз
});

// ── позиции/итог ──────────────────────────────────────────────
test('computeItems: суммы строк и итог', () => {
  const { rows, total } = computeItems([{ qty: 2, price: 1000 }, { qty: 3, price: 500 }]);
  assert.equal(rows[0].sum, 2000);
  assert.equal(rows[1].sum, 1500);
  assert.equal(total, 3500);
});
