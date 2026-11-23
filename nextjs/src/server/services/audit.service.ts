import { auditRepo } from '@/server/repositories/audit.repo';
import { usersRepo } from '@/server/repositories/users.repo';
import { auditListPlan, AUDIT_ALL_ROLES, AUDIT_LOGIN_ROLES } from '@/server/dto/audit.dto';
import { BRANCH_ROLE } from '@/server/dto/permissions.dto';

type Viewer = { id: string; role: string };
type ListOpts = { scope?: string | null; entityType?: string | null; entityId?: string | null; q?: string | null; limit?: number; offset?: number };

export const auditService = {
  // Ленты: mine (свои), all (все — привилегированным; админу филиала — его филиал),
  // logins (входы — Админу). История документа (entityType+entityId) — любому вошедшему.
  // canAll/canLogins едут в ответе: панель 🕘 рисует вкладки по ним, а не по роли —
  // иначе «админ филиала» не отличить от обычного сотрудника филиала.
  async list(viewer: Viewer, opts: ListOpts) {
    if (opts.entityType && opts.entityId) {
      return auditRepo.list({ entityType: opts.entityType, entityId: opts.entityId, limit: opts.limit, offset: opts.offset });
    }
    const branchAdmin = viewer.role === BRANCH_ROLE && await usersRepo.branchAdminOf(viewer.id);
    const caps = {
      canAll: AUDIT_ALL_ROLES.includes(viewer.role) || branchAdmin,
      canLogins: AUDIT_LOGIN_ROLES.includes(viewer.role),
    };
    const plan = auditListPlan(viewer.role, opts.scope || 'mine', branchAdmin);
    if (plan.denied) return { items: [], hasMore: false, ...caps };

    // Лента филиала: действия всех его сотрудников. Если филиал почему-то не
    // определился — показываем только собственные действия, но не всю компанию.
    let userIds: string[] | null = null;
    if (plan.branchOnly) {
      const branchId = await usersRepo.branchOf(viewer.id);
      const ids = branchId ? await usersRepo.idsByBranch(branchId) : [];
      userIds = ids.length ? ids : [viewer.id];
    }

    const res = await auditRepo.list({
      userId: plan.mineOnly ? viewer.id : null,
      userIds,
      onlyLogins: plan.onlyLogins,
      excludeLogins: !plan.onlyLogins,
      q: opts.q, limit: opts.limit, offset: opts.offset,
    });
    return { ...res, ...caps };
  },
};
