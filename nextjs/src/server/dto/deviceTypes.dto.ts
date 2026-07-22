// Нормализация типов приборов (без БД — тестируемая).
// Отображаемое имя: трим + схлопнуть множественные пробелы (регистр/скрипт сохраняются).
export function normDisplay(s: unknown): string {
  return String(s ?? '').trim().replace(/\s+/g, ' ');
}

// Ключ сравнения: нижний регистр + кириллические к/в/с → латинские k/b/c
// (кириллическая К = латинская K и т.д.), регистр и вариант написания не важны.
export function normKey(s: unknown): string {
  return normDisplay(s).toLowerCase().replace(/с/g, 'c').replace(/в/g, 'b').replace(/к/g, 'k');
}

export function sameDeviceType(a: unknown, b: unknown): boolean {
  return normKey(a) === normKey(b) && normKey(a) !== '';
}

// Разрешение значения в тип: СПЕРВА по алиасу, ПОТОМ по имени (правило импорта/подсказок).
export function resolveDeviceType(
  value: unknown,
  types: { id: string; norm: string }[],
  aliases: { norm: string; deviceTypeId: string }[],
): string | null {
  const key = normKey(value);
  if (!key) return null;
  const a = aliases.find(x => x.norm === key);
  if (a) return a.deviceTypeId;
  const t = types.find(x => x.norm === key);
  return t ? t.id : null;
}

// САМООБУЧЕНИЕ (инкремент): совпало → bump счётчика; нет → создать новый тип.
export function touchAction(
  value: unknown,
  types: { id: string; norm: string }[],
  aliases: { norm: string; deviceTypeId: string }[],
): { action: 'bump'; id: string } | { action: 'create'; name: string } | null {
  const name = normDisplay(value);
  if (!normKey(name)) return null;
  const id = resolveDeviceType(name, types, aliases);
  return id ? { action: 'bump', id } : { action: 'create', name };
}

// MERGE: какие написания meterType переносить на приёмник (по нормализованному совпадению).
export function deviceTypeMoveNames(fromNorms: string[], meterTypes: (string | null | undefined)[]): string[] {
  const set = new Set(fromNorms);
  const out = new Set<string>();
  for (const m of meterTypes) if (m && set.has(normKey(m))) out.add(m);
  return Array.from(out);
}
