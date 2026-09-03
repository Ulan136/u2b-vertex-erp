import { z } from 'zod';
import { financeRepo } from '@/server/repositories/finance.repo';
import { financeService } from '@/server/services/finance.service';
import { branchesRepo } from '@/server/repositories/branches.repo';
import { usersRepo } from '@/server/repositories/users.repo';
import { scopeFinance, numberAccounts } from '@/server/dto/finance.dto';
import { branchFinanceSection } from '@/server/lib/branchScope';
import { BRANCH_ROLE } from '@/server/dto/permissions.dto';
import { badRequest, forbidden } from '@/server/lib/errors';

// Куда филиал может переводить деньги: свой раздел (между своими счетами) +
// головной офис (раздел poverka — «вернуть головному»). Больше никуда.
const HEAD_TRANSFER_SECTIONS = ['poverka'];

// Раздел филиала по ключу (для админского просмотра конкретного филиала).
const SECTION_BY_KEY: Record<string, string> = { astana: 'branch', almaty: 'branch_almaty', branch: 'branch', branch_almaty: 'branch_almaty' };

// Кабинет филиала: строго свой раздел.
//   - роль 'branch' → ВСЕГДА свой филиал (параметр игнорируется — безопасность);
//   - admin → может смотреть указанный филиал (?branch=astana|almaty), т.к. у
//     головного офиса своего филиального раздела нет.
async function resolveSection(viewer: { id: string; role?: string | null }, requested?: string | null): Promise<{ section: string; branchId: string | null }> {
  if (viewer.role === BRANCH_ROLE) {
    const branchId = await usersRepo.branchOf(viewer.id);
    if (!branchId) throw forbidden('Пользователь не привязан к филиалу');
    const section = branchFinanceSection(await branchesRepo.get(branchId));
    if (!section) throw forbidden('У вашего филиала нет финансового раздела');
    return { section, branchId };
  }
  if (viewer.role === 'admin') {
    const section = requested ? SECTION_BY_KEY[requested] : null;
    if (!section) throw badRequest('Укажите филиал (?branch=astana|almaty)');
    return { section, branchId: null };
  }
  throw forbidden('Кабинет филиала доступен только роли «Филиал»');
}

// Проверка: счёт принадлежит разделу филиала (иначе тратить/переводить нельзя).
async function ownAccount(accountId: string, section: string) {
  const acc = await financeRepo.findAccount(accountId);
  if (!acc || (acc.section || '') !== section) throw forbidden('Счёт не принадлежит вашему филиалу');
  return acc;
}

const expenseSchema = z.object({
  accountId: z.string().uuid('Выберите счёт'),
  amount: z.coerce.number().positive('Сумма должна быть больше 0'),
  name: z.string().trim().min(1, 'Укажите назначение расхода'),
  subCategory: z.string().trim().nullish(),
  date: z.string().nullish(),
  comment: z.string().nullish(),
});
const transferSchema = z.object({
  fromAccountId: z.string().uuid('Выберите счёт-источник'),
  toAccountId: z.string().uuid('Выберите счёт-получатель'),
  amount: z.coerce.number().positive('Сумма должна быть больше 0'),
  name: z.string().trim().nullish(),
  date: z.string().nullish(),
});

export const branchService = {
  // Финансы филиала: только счета его раздела + движения по ним (расходы,
  // приходы, переводы). Компанейские разделы не отдаются. transferTargets —
  // куда можно перевести (свои счета + головной), без остатков.
  async finance(viewer: { id: string; role?: string | null }, from?: string | null, to?: string | null, requested?: string | null) {
    const { section, branchId } = await resolveSection(viewer, requested);
    const { accounts, operations } = await financeRepo.overview(from, to);
    const scoped = scopeFinance(accounts, operations, { section, from, to });
    // Входящие переводы: перевод, где счёт-ПОЛУЧАТЕЛЬ (toAccountId) — наш, а
    // источник чужой (головной). Строка живёт на счёте-источнике, поэтому в
    // scoped.movs её нет — добавляем как «+» на наш счёт-получатель.
    const sectionIds = new Set(scoped.visAccts.map(a => a.id));
    const acctName = new Map(accounts.map(a => [a.id, a.name]));
    const incoming = operations
      .filter(o => o.opType === 'Перевод' && o.toAccountId && sectionIds.has(o.toAccountId as string) && !sectionIds.has(o.accountId) && !o.reversedAt && !o.reverses)
      .map(o => ({ ...o, accountId: o.toAccountId as string, accountName: acctName.get(o.toAccountId as string) ?? null, incoming: true }));
    const incomingSum = incoming.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    const transferTargets = accounts
      .filter(a => (a.section || '') === section || HEAD_TRANSFER_SECTIONS.includes(a.section || ''))
      .map(a => ({ id: a.id, name: a.name, icon: a.icon ?? null, own: (a.section || '') === section }));
    return {
      section, branchId,
      accounts: scoped.visAccts,
      operations: [...scoped.movs, ...incoming],
      accountNo: numberAccounts(scoped.visAccts),   // № счёта внутри раздела
      total: scoped.total, income: scoped.income + incomingSum, expense: scoped.expense,
      transferTargets,
    };
  },

  // Расход филиала — только со своего счёта. Обычный Расход в финледжере.
  async createExpense(viewer: { id: string; role?: string | null }, input: unknown, actorId?: string | null, requested?: string | null) {
    const { section } = await resolveSection(viewer, requested);
    const d = expenseSchema.parse(input);
    const acc = await ownAccount(d.accountId, section);
    return financeService.createOperation({
      opType: 'Расход', accountId: d.accountId, amount: d.amount, name: d.name,
      source: 'Расходы', expenseCat: d.subCategory || 'Филиал', subCategory: d.subCategory || null,
      opDate: d.date || null, comment: d.comment || null, accountName: acc.name,
    }, actorId);
  },

  // Перевод — строго со своего счёта; получатель = свой счёт или головной.
  async createTransfer(viewer: { id: string; role?: string | null }, input: unknown, actorId?: string | null, requested?: string | null) {
    const { section } = await resolveSection(viewer, requested);
    const d = transferSchema.parse(input);
    if (d.fromAccountId === d.toAccountId) throw badRequest('Счёт-источник и получатель должны отличаться');
    const from = await ownAccount(d.fromAccountId, section);
    const to = await financeRepo.findAccount(d.toAccountId);
    if (!to) throw badRequest('Счёт получателя не найден');
    if ((to.section || '') !== section && !HEAD_TRANSFER_SECTIONS.includes(to.section || '')) {
      throw forbidden('Перевод возможен только на свои счета или головному офису');
    }
    return financeService.createOperation({
      opType: 'Перевод', accountId: d.fromAccountId, toAccountId: d.toAccountId, amount: d.amount,
      name: 'Перевод: ' + (d.name?.trim() || `${from.name} → ${to.name}`), opDate: d.date || null,
    }, actorId);
  },
};
