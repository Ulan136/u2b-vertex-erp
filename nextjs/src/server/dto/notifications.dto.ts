// Pure notification-recipient helpers (no DB) — the core "адресаты" logic, unit-tested.

export type UserLite = { id: string; role: string | null; isActive: boolean | null; branchId?: string | null };

// Новая заявка → активные менеджеры + админы (видят всё). Плюс, если передан филиал
// заявки (opts), — мастер и пользователи-филиалы ИМЕННО ЭТОГО филиала (чтобы выездной
// мастер получил пуш о своей заявке). actorId исключается (не шлём самому создателю).
// Без opts поведение прежнее (только менеджеры+админы) — для совместимости.
export function orderRecipients(
  users: UserLite[],
  opts?: { branchId?: string | null; headBranchId?: string | null; actorId?: string | null },
): string[] {
  const base = users.filter(u => u.isActive === true && (u.role === 'manager' || u.role === 'admin')).map(u => u.id);
  if (!opts) return base;
  const orderBranch = opts.branchId ?? opts.headBranchId ?? null;
  const inBranch = (u: UserLite) => (u.branchId ?? opts.headBranchId ?? null) === orderBranch;
  const field = users
    .filter(u => u.isActive === true && (u.role === 'master' || u.role === 'branch') && inBranch(u))
    .map(u => u.id);
  return Array.from(new Set([...base, ...field])).filter(id => id !== opts.actorId);
}

// Task assigned → the assignee (unless they assigned it to themselves).
export function taskAssignedRecipients(assigneeId?: string | null, actorId?: string | null): string[] {
  if (!assigneeId || assigneeId === actorId) return [];
  return [assigneeId];
}

// Task moved to "done" → the task's creator (unless they closed it themselves).
export function taskDoneRecipients(createdBy?: string | null, actorId?: string | null): string[] {
  if (!createdBy || createdBy === actorId) return [];
  return [createdBy];
}

// New comment → participants (creator + assignee + prior commenters), minus the
// comment's author. Orders have no creator/assignee, so those are just omitted.
export function commentRecipients(p: {
  creatorId?: string | null;
  assigneeId?: string | null;
  commenterIds?: (string | null | undefined)[];
  authorId: string;
}): string[] {
  const set = new Set<string>();
  if (p.creatorId) set.add(p.creatorId);
  if (p.assigneeId) set.add(p.assigneeId);
  (p.commenterIds ?? []).forEach(id => { if (id) set.add(id); });
  set.delete(p.authorId);
  return Array.from(set);
}

// Keep at most `keep` newest per user → ids to delete (given ids newest-first).
export function idsToPrune(idsNewestFirst: string[], keep = 100): string[] {
  return idsNewestFirst.slice(keep);
}
