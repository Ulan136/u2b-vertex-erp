// Единое ОТОБРАЖЕНИЕ финопераций во всех списках (Финансы, дашборд, кабинет,
// История). Только показ — поля в БД (op_type, reverses, reversed_at, name) не
// меняем. Иконка выбирается по ТИПУ операции, а не по знаку суммы.

export type OpLike = {
  opType?: string | null; amount?: string | number | null; name?: string | null;
  source?: string | null; reverses?: string | null; reversedAt?: string | null;
};

export const isReversal = (o: OpLike) => !!o.reverses;      // сама отмена (сторно)
export const isReversed = (o: OpLike) => !!o.reversedAt;    // исходная, которую отменили

// Иконка по смыслу операции (эмодзи из общего набора интерфейса).
export function opIcon(o: OpLike): string {
  if (isReversal(o)) return '↩️';                                  // отмена
  const text = `${o.name || ''} ${o.source || ''}`;
  if (o.opType === 'Перевод' || /перевод/i.test(text)) return '🔄'; // перевод
  if (o.source === 'Долг' || /погашение долга/i.test(text)) return '🏦'; // погашение долга
  if (o.source === 'Зарплата' || /зарплат|оклад|аванс/i.test(text)) return '👤'; // зарплата
  if (/корректировк|ревизи/i.test(text)) return '⚖️';              // корректировка/ревизия
  return o.opType === 'Приход' ? '📈' : '📉';                       // приход / расход
}

// Знак суммы по направлению денег (приход +, расход −). Перевод — без знака.
export function opSign(o: OpLike): string {
  if (o.opType === 'Перевод') return '';
  return o.opType === 'Приход' ? '+' : '−';
}

// Цвет суммы: приход зелёный, расход красный; отмена/отменённое — нейтральный
// серый (чтобы «+»-сумма отмены расхода НЕ читалась как доход).
export function opAmountColor(o: OpLike): string {
  if (isReversal(o) || isReversed(o)) return '#94a3b8';
  if (o.opType === 'Перевод') return '#6b7280';
  return o.opType === 'Приход' ? '#16a34a' : '#dc2626';
}

// Отображаемое название: «Сторно: …» → «Отмена: …» (в БД остаётся как есть).
export function opName(o: OpLike): string {
  return String(o.name || o.opType || '').replace(/Сторно/gi, 'Отмена');
}
