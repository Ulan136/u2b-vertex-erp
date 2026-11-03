// Привязка финансовой операции к филиалу.
//
// Отдельной колонки филиала у finance_operations НЕТ. Единственный надёжный
// признак — РАЗДЕЛ счёта, с которого прошла операция: разделы №1 Поверка,
// №2 Продажа и №3 Прочие операции принадлежат головному офису (Тараз),
// №4 — филиалу Астана, №5 — филиалу Алматы.
//
// Правило живёт здесь одно на всех, чтобы «Расходы» и «Аналитика» не считали
// филиал по-разному и суммы сходились с «Все расходы» до тенге.

export const BRANCHES = [
  { key: 'head', icon: '🏢', label: 'Тараз (главный)' },
  { key: 'branch', icon: '🏙️', label: 'Астана' },
  { key: 'branch_almaty', icon: '🏙️', label: 'Алматы' },
] as const;

export type BranchKey = (typeof BRANCHES)[number]['key'];

/** Филиал по разделу счёта. Всё, что не №4/№5, относим к головному офису. */
export function branchOfSection(section?: string | null): BranchKey {
  return section === 'branch' || section === 'branch_almaty' ? section : 'head';
}

/** Человекочитаемое имя филиала (с иконкой — для заголовков и таблиц). */
export function branchLabel(key: string, withIcon = false): string {
  const b = BRANCHES.find(x => x.key === key);
  if (!b) return key;
  return withIcon ? `${b.icon} ${b.label}` : b.label;
}
