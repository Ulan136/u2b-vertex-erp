// Кто видит деньги в цифрах.
//
// Правило компании: ОСТАТКИ НА СЧЕТАХ показываются только Админу. Остальным при
// выборе счёта видно название, а достаточность средств — цветом (зелёный хватает,
// красный нет), без сумм. Правило было реализовано только на экране долгов и
// разъехалось — поэтому живёт здесь одно на всех.
//
// Расходы ФИЛИАЛОВ — отдельная история: их не должны видеть менеджеры головного
// офиса (Тараз). Доступ к разбивке по филиалам ограничен ролями, которым и так
// открыта вся финансовая картина.

/** Остатки на счетах в цифрах — только Админу. */
export const canSeeBalances = (role?: string | null): boolean => role === 'admin';

/** Кому видна разбивка расходов по филиалам (те же роли, что видят скрытые категории). */
const BRANCH_SPEND_ROLES = ['admin', 'accountant', 'director'];
export const canSeeBranchSpend = (role?: string | null): boolean =>
  BRANCH_SPEND_ROLES.includes(role || '');

/** Подпись счёта в выпадающем списке: с остатком — только Админу. */
export function accountLabel(
  a: { icon?: string | null; name: string; balance?: string | number | null },
  role: string | null | undefined,
  fmt: (n: number) => string,
): string {
  const head = `${a.icon ? a.icon + ' ' : ''}${a.name}`;
  return canSeeBalances(role) ? `${head} · ${fmt(Number(a.balance) || 0)}` : head;
}

/** Хватает ли на счёте указанной суммы (для подсветки без раскрытия цифр). */
export function fundsOk(balance: string | number | null | undefined, amount: number): boolean {
  return (Number(balance) || 0) >= amount;
}
