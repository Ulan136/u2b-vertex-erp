import { auditRepo } from '@/server/repositories/audit.repo';
import { auditListPlan } from '@/server/dto/audit.dto';

type Viewer = { id: string; role: string };
type ListOpts = { scope?: string | null; entityType?: string | null; entityId?: string | null; q?: string | null; limit?: number; offset?: number };

export const auditService = {
  // Ленты: mine (свои), all (все — только привилегированным), logins (входы — Админу).
  // История конкретного документа (entityType+entityId) — любому вошедшему.
  async list(viewer: Viewer, opts: ListOpts) {
    if (opts.entityType && opts.entityId) {
      return auditRepo.list({ entityType: opts.entityType, entityId: opts.entityId, limit: opts.limit, offset: opts.offset });
    }
    const plan = auditListPlan(viewer.role, opts.scope || 'mine');
    if (plan.denied) return { items: [], hasMore: false };
    return auditRepo.list({
      userId: plan.mineOnly ? viewer.id : null,
      onlyLogins: plan.onlyLogins,
      excludeLogins: !plan.onlyLogins,
      q: opts.q, limit: opts.limit, offset: opts.offset,
    });
  },
};
