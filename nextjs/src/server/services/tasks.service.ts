import { tasksRepo, type TaskListFilter } from '@/server/repositories/tasks.repo';
import {
  taskCreateSchema, taskUpdateSchema, resolveCompletedAt, type TaskStatus,
} from '@/server/dto/tasks.dto';
import { badRequest, notFound } from '@/server/lib/errors';

export const tasksService = {
  list: (filter: TaskListFilter) => tasksRepo.list(filter),

  async create(input: unknown) {
    const data = taskCreateSchema.parse(input);
    const status: TaskStatus = data.status ?? 'new';
    return tasksRepo.create({
      title: data.title,
      description: data.description ?? null,
      assigneeId: data.assigneeId ?? null,
      dueDate: data.dueDate ?? null,
      status,
      createdBy: data.createdBy ?? null,
      completedAt: resolveCompletedAt(status, null, new Date()),
    });
  },

  async update(id: string, input: unknown) {
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
    // status change → (re)stamp or clear completed_at
    if (data.status !== undefined) {
      patch.status = data.status;
      patch.completedAt = resolveCompletedAt(data.status, existing.completedAt, new Date());
    }

    const row = await tasksRepo.update(id, patch);
    if (!row) throw notFound('Задача не найдена');
    return row;
  },

  async remove(id: string) {
    if (!id) throw badRequest('id обязателен');
    await tasksRepo.remove(id);
    return { ok: true };
  },
};
