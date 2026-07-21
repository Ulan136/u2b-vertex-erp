import { auditRepo } from '@/server/repositories/audit.repo';
import { resolveMutation, type AuditDraft } from '@/server/dto/audit.dto';

export type { AuditDraft };

type Actor = { id: string | null; name?: string | null };

// Централизованная запись мутации в журнал. Вызывается из withApi после успешного
// обработчика. Best-effort: сбой лога не должен ронять запрос пользователя.
export function recordMutation(opts: {
  method: string; path: string; params?: Record<string, string>;
  result: unknown; actor: Actor; ip?: string | null; draft?: AuditDraft;
}) {
  const r = resolveMutation(opts);
  if (!r) return;
  auditRepo.insert({
    userId: opts.actor.id, userName: opts.actor.name ?? null,
    action: r.action, entityType: r.entityType, entityId: r.entityId, entityLabel: r.entityLabel,
    details: r.details as never, ip: opts.ip ?? null,
  }).catch(() => { /* best-effort */ });
}

// Логирование входа в систему (вызывается из next-auth authorize).
export function logLogin(actor: Actor, ip?: string | null) {
  return auditRepo.insert({ userId: actor.id, userName: actor.name ?? null, action: 'login', ip: ip ?? null }).catch(() => { /* best-effort */ });
}
