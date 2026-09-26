import { NextRequest } from 'next/server';
import { withApi, optionsHandler } from '@/server/lib/http';
import { usersRepo } from '@/server/repositories/users.repo';
import { branchesRepo } from '@/server/repositories/branches.repo';
import { branchFinanceSection } from '@/server/lib/branchScope';

export const OPTIONS = optionsHandler;

// GET /api/v2/me — the signed-in user (id, name, role, email) + свой порядковый № клейма +
// financeSection: раздел финансов пользователя (кабинет мастера показывает счета этого
// раздела для приёма оплаты). Филиал Астана → 'branch', Алматы → 'branch_almaty',
// головной/без филиала → 'poverka'. Так доход мастера филиала идёт на счёт филиала.
export const GET = withApi(async (_req, ctx) => {
  if (!ctx.user) return null;
  const stampSeqNext = await usersRepo.stampSeqOf(ctx.user.id);
  const branchId = await usersRepo.branchOf(ctx.user.id);
  const financeSection = (branchId ? branchFinanceSection(await branchesRepo.get(branchId)) : null) || 'poverka';
  return { ...ctx.user, stampSeqNext, financeSection };
});

// POST /api/v2/me/stamp-seq — задать СВОЙ порядковый № клейма (партию). {next:число|пусто}.
export const SET_STAMP_SEQ = withApi(async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => ({}));
  const n = Math.floor(Number((body as { next?: unknown }).next));
  const val = n > 0 ? n : null;
  await usersRepo.update(ctx.user!.id, { stampSeqNext: val });
  return { ok: true, stampSeqNext: val };
});
