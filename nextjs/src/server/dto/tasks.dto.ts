import { z } from 'zod';

export const TASK_STATUSES = ['new', 'accepted', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// ── Pure helpers (no DB) — unit-testable ──────────────────────

// Linear status flow: new → accepted → in_progress → done.
// Returns the next status, or null when already done.
export function nextStatus(current: TaskStatus): TaskStatus | null {
  const i = TASK_STATUSES.indexOf(current);
  return i >= 0 && i < TASK_STATUSES.length - 1 ? TASK_STATUSES[i + 1] : null;
}

// completed_at is set the moment a task becomes 'done' and cleared when it
// leaves 'done'. A task that stays 'done' keeps its original completion time.
export function resolveCompletedAt(
  newStatus: TaskStatus,
  existingCompletedAt: Date | null | undefined,
  now: Date,
): Date | null {
  if (newStatus !== 'done') return null;
  return existingCompletedAt ?? now;
}

// A task is overdue when it has a due date in the past and is not done.
export function isOverdue(
  dueDate: string | null | undefined,
  status: TaskStatus,
  today: string,
): boolean {
  if (status === 'done' || !dueDate) return false;
  return String(dueDate).slice(0, 10) < today;
}

// ── Zod schemas ───────────────────────────────────────────────
const taskBase = z.object({
  title: z.string().trim().min(1, 'Название обязательно'),
  description: z.string().nullish(),
  assigneeId: z.string().uuid().nullish(),
  dueDate: z.string().nullish(),
  status: z.enum(TASK_STATUSES).optional(),
  createdBy: z.string().uuid().nullish(),
});

export const taskCreateSchema = taskBase;
export const taskUpdateSchema = taskBase.partial();

export type TaskCreate = z.infer<typeof taskCreateSchema>;
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;
