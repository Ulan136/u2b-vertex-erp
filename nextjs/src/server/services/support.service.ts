import { supportRepo, type SupportListFilter } from '@/server/repositories/support.repo';
import { usersRepo } from '@/server/repositories/users.repo';
import { notificationsService } from '@/server/services/notifications.service';
import {
  supportCreateSchema, supportUpdateSchema, supportReplySchema, stampsForStatus,
  type SupportStatus,
} from '@/server/dto/support.dto';
import { badRequest, notFound } from '@/server/lib/errors';

// Кому падает уведомление о новой заявке — администраторам.
async function adminIds(): Promise<string[]> {
  try {
    const all = await usersRepo.listActive();
    return all.filter(u => u.role === 'admin').map(u => u.id);
  } catch { return []; }
}

export const supportService = {
  list: (filter: SupportListFilter) => supportRepo.list(filter),

  async get(id: string, branchId?: string | null) {
    const ticket = await supportRepo.findById(id);
    if (!ticket) throw notFound('Заявка не найдена');
    // Филиал видит только свои заявки — гейт на уровне данных, не только меню.
    if (branchId && ticket.branchId !== branchId) throw notFound('Заявка не найдена');
    const messages = await supportRepo.messages(id);
    return { ...ticket, messages };
  },

  async create(input: unknown, actorId?: string | null) {
    const data = supportCreateSchema.parse(input);
    // Филиал берём у автора: сотрудник не выбирает его руками и не подменит чужой.
    const fromUser = actorId ? await usersRepo.branchOf(actorId) : null;
    const row = await supportRepo.create({
      title: data.title,
      body: data.body,
      screen: data.screen ?? null,
      severity: data.severity ?? 'Обычная',
      branchId: fromUser ?? data.branchId ?? null,
      status: 'Новая',
      createdBy: actorId ?? null,
    });
    try {
      await notificationsService.create(await adminIds(), {
        type: 'support_new',
        title: `Поддержка · новая заявка №${row?.ticketNo ?? ''}: ${data.title}`.slice(0, 300),
        link: 'support',
      });
    } catch { /* уведомление не должно ломать создание заявки */ }
    return row;
  },

  async update(id: string, input: unknown) {
    if (!id) throw badRequest('id обязателен');
    const data = supportUpdateSchema.parse(input);
    const existing = await supportRepo.findById(id);
    if (!existing) throw notFound('Заявка не найдена');

    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.body !== undefined) patch.body = data.body;
    if (data.screen !== undefined) patch.screen = data.screen ?? null;
    if (data.severity !== undefined) patch.severity = data.severity;
    if (data.status !== undefined) {
      patch.status = data.status;
      Object.assign(patch, stampsForStatus(data.status as SupportStatus));
    }
    const row = await supportRepo.update(id, patch);

    // Автор заявки узнаёт, что по ней появилось движение.
    if (data.status !== undefined && existing.createdBy) {
      try {
        await notificationsService.create([existing.createdBy], {
          type: 'support_status',
          title: `Поддержка · заявка №${existing.ticketNo ?? ''}: ${data.status}`.slice(0, 300),
          link: 'support',
        });
      } catch { /* best-effort */ }
    }
    return row;
  },

  // Сообщение в переписке. Отвечает поддержка — уведомляем автора; пишет автор —
  // уведомляем админов, иначе ответ останется незамеченным.
  async reply(id: string, input: unknown, actorId?: string | null) {
    const { text } = supportReplySchema.parse(input);
    const ticket = await supportRepo.findById(id);
    if (!ticket) throw notFound('Заявка не найдена');

    const row = await supportRepo.addMessage(id, text, actorId ?? null);
    const fromAuthor = !!actorId && actorId === ticket.createdBy;
    const recipients = fromAuthor
      ? await adminIds()
      : (ticket.createdBy ? [ticket.createdBy] : []);
    try {
      await notificationsService.create(recipients, {
        type: 'support_reply',
        title: `Поддержка · ответ по заявке №${ticket.ticketNo ?? ''}`.slice(0, 300),
        link: 'support',
      });
    } catch { /* best-effort */ }

    // Ответ поддержки переводит заявку в «Отвечено», если она была открыта.
    if (!fromAuthor && ticket.status !== 'Закрыта') {
      await supportRepo.update(id, { status: 'Отвечено', answeredAt: new Date() });
    }
    return row;
  },
};
