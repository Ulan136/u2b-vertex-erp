import { tasksRepo, type TaskListFilter } from '@/server/repositories/tasks.repo';
import { notificationsService } from '@/server/services/notifications.service';
import {
  taskCreateSchema, taskUpdateSchema, resolveCompletedAt, type TaskStatus,
} from '@/server/dto/tasks.dto';
import { taskAssignedRecipients, taskDoneRecipients } from '@/server/dto/notifications.dto';
import { badRequest, notFound } from '@/server/lib/errors';

const notifyAssigned = (assigneeId: string | null | undefined, actorId: string | null | undefined, title: string) =>
  notificationsService.create(taskAssignedRecipients(assigneeId, actorId), {
    type: 'task_assigned', title: `Вам назначена задача: ${title}`, link: 'tasks',
  });

export const tasksService = {
  list: (filter: TaskListFilter) => tasksRepo.list(filter),

  async create(input: unknown, actorId?: string | null) {
    const data = taskCreateSchema.parse(input);
    const status: TaskStatus = data.status ?? 'new';
    const row = await tasksRepo.create({
      title: data.title,
      description: data.description ?? null,
      assigneeId: data.assigneeId ?? null,
      dueDate: data.dueDate ?? null,
      status,
      createdBy: data.createdBy ?? actorId ?? null,   // creator = session user
      completedAt: resolveCompletedAt(status, null, new Date()),
    });
    try { await notifyAssigned(row?.assigneeId, actorId, row?.title ?? data.title); } catch { /* best-effort */ }
    return row;
  },

  async update(id: string, input: unknown, actorId?: string | null) {
    if (!id) throw badRequest('id обязателен');
    const data = taskUpdateSchema.parse(input);
    const existing = await tasksRepo.findById(id);
    if (!existing) throw notFound('Задача не найдена');

    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description ?? null;
    if (data.assigneeId !== undefined) patch.assigneeId = data.assigneeId ?? null;
    if (data.dueDate !== undefined) patch.dueDate = data.dueDate ?? null;
    if (data.createdBy !== undefined) patch.createdBy = data.createdBy ?? null;
    if (data.status !== undefined) {
      patch.status = data.status;
      patch.completedAt = resolveCompletedAt(data.status, existing.completedAt, new Date());
    }

    const row = await tasksRepo.update(id, patch);
    if (!row) throw notFound('Задача не найдена');

    try {
      // reassigned to a new person → notify them
      if (data.assigneeId !== undefined && data.assigneeId && data.assigneeId !== existing.assigneeId) {
        await notifyAssigned(data.assigneeId, actorId, row.title);
      }
      // moved to "done" → notify the creator
      if (data.status === 'done' && existing.status !== 'done') {
        await notificationsService.create(taskDoneRecipients(existing.createdBy, actorId), {
          type: 'task_done', title: `Задача выполнена: ${row.title}`, link: 'tasks',
        });
      }
    } catch { /* best-effort */ }

    return row;
  },

  async remove(id: string) {
    if (!id) throw badRequest('id обязателен');
    await tasksRepo.remove(id);
    return { ok: true };
  },
};
