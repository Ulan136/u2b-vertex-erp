import { commentsRepo } from '@/server/repositories/comments.repo';
import { ordersRepo } from '@/server/repositories/orders.repo';
import { tasksRepo } from '@/server/repositories/tasks.repo';
import { notificationsService } from '@/server/services/notifications.service';
import { commentCreateSchema, type CommentEntity } from '@/server/dto/comments.dto';
import { commentRecipients } from '@/server/dto/notifications.dto';
import { badRequest, forbidden, notFound } from '@/server/lib/errors';

type Actor = { id: string; role: string } | null | undefined;

// Fan out a "new comment" notification to the entity's participants (best-effort).
async function notifyComment(entityType: CommentEntity, entityId: string, authorId: string) {
  try {
    const commenterIds = await commentsRepo.commenterIds(entityType, entityId);
    if (entityType === 'task') {
      const t = await tasksRepo.findById(entityId);
      const recipients = commentRecipients({ creatorId: t?.createdBy, assigneeId: t?.assigneeId, commenterIds, authorId });
      await notificationsService.create(recipients, { type: 'comment', title: `Новый комментарий к задаче: ${t?.title ?? ''}`, link: 'tasks' });
    } else {
      const o = await ordersRepo.findById(entityId);
      const recipients = commentRecipients({ commenterIds, authorId });   // orders have no creator/assignee
      const link = o?.source === 'tec' ? 'tec-orders' : 'field-orders';
      await notificationsService.create(recipients, { type: 'comment', title: `Новый комментарий к заявке ${o?.orderNo ?? ''}`, link });
    }
  } catch (e) {
    console.warn('[comments notify]', (e as Error).message);
  }
}

export const commentsService = {
  list: (entityType: CommentEntity, entityId: string) => commentsRepo.list(entityType, entityId),
  counts: (entityType: CommentEntity) => commentsRepo.counts(entityType),

  async create(input: unknown, author: Actor) {
    if (!author?.id) throw badRequest('Требуется вход');
    const data = commentCreateSchema.parse(input);
    const comment = await commentsRepo.create({
      entityType: data.entityType, entityId: data.entityId, authorId: author.id, text: data.text,
    });
    await notifyComment(data.entityType, data.entityId, author.id);
    return comment;
  },

  // Delete: only the author or an admin.
  async remove(id: string, actor: Actor) {
    if (!id) throw badRequest('id обязателен');
    if (!actor?.id) throw badRequest('Требуется вход');
    const c = await commentsRepo.findById(id);
    if (!c) throw notFound('Комментарий не найден');
    if (c.authorId !== actor.id && actor.role !== 'admin') {
      throw forbidden('Удалить комментарий может только его автор или администратор');
    }
    await commentsRepo.remove(id);
    return { ok: true };
  },
};
