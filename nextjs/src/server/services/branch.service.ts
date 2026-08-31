import { financeRepo } from '@/server/repositories/finance.repo';
import { branchesRepo } from '@/server/repositories/branches.repo';
import { usersRepo } from '@/server/repositories/users.repo';
import { scopeFinance, numberAccounts } from '@/server/dto/finance.dto';
import { branchFinanceSection } from '@/server/lib/branchScope';
import { BRANCH_ROLE } from '@/server/dto/permissions.dto';
import { forbidden } from '@/server/lib/errors';

// Кабинет филиала: строго свой финансовый раздел. Доступен только роли 'branch'
// (и admin — для проверки). Раздел выводится из филиала пользователя.
async function resolveSection(viewer: { id: string; role?: string | null }): Promise<{ section: string; branchId: string }> {
  if (viewer.role !== BRANCH_ROLE && viewer.role !== 'admin') throw forbidden('Кабинет филиала доступен только роли «Филиал»');
  const branchId = await usersRepo.branchOf(viewer.id);
  if (!branchId) throw forbidden('Пользователь не привязан к филиалу');
  const branch = await branchesRepo.get(branchId);
  const section = branchFinanceSection(branch);
  if (!section) throw forbidden('У вашего филиала нет финансового раздела');
  return { section, branchId };
}

export const branchService = {
  // Финансы филиала: только счета его раздела + движения по ним (расходы,
  // приходы, переводы). Компанейские разделы не отдаются.
  async finance(viewer: { id: string; role?: string | null }, from?: string | null, to?: string | null) {
    const { section, branchId } = await resolveSection(viewer);
    const { accounts, operations } = await financeRepo.overview(from, to);
    const scoped = scopeFinance(accounts, operations, { section, from, to });
    return {
      section, branchId,
      accounts: scoped.visAccts,
      operations: scoped.movs,
      accountNo: numberAccounts(scoped.visAccts),   // № счёта внутри раздела
      total: scoped.total, income: scoped.income, expense: scoped.expense,
    };
  },
};
