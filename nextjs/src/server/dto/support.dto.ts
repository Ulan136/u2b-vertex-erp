import { z } from 'zod';

// Заявка в техподдержку. Создаёт сотрудник филиала (или любой вошедший),
// разбирает админ. Переписка — в comments (entityType='support').

export const SUPPORT_STATUSES = ['Новая', 'В работе', 'Отвечено', 'Закрыта'] as const;
export const SUPPORT_SEVERITIES = ['Обычная', 'Срочная', 'Блокирует работу'] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type SupportSeverity = (typeof SUPPORT_SEVERITIES)[number];

export const supportCreateSchema = z.object({
  title: z.string().trim().min(3, 'Опишите проблему в заголовке'),
  body: z.string().trim().min(5, 'Опишите, что произошло'),
  screen: z.string().trim().max(60).nullish(),
  severity: z.enum(SUPPORT_SEVERITIES).optional(),
  branchId: z.string().uuid().nullish(),
});

export const supportUpdateSchema = z.object({
  status: z.enum(SUPPORT_STATUSES).optional(),
  severity: z.enum(SUPPORT_SEVERITIES).optional(),
  screen: z.string().trim().max(60).nullish(),
  title: z.string().trim().min(3).optional(),
  body: z.string().trim().min(5).optional(),
});

export const supportReplySchema = z.object({
  text: z.string().trim().min(1, 'Пустой ответ не отправляем'),
});

/** Отметки времени, которые ставит смена статуса. Пустой объект — ничего не меняем. */
export function stampsForStatus(status?: SupportStatus | null): Record<string, Date | null> {
  if (status === 'Отвечено') return { answeredAt: new Date() };
  if (status === 'Закрыта') return { closedAt: new Date() };
  // Возврат в работу снимает отметку закрытия: заявка снова живая.
  if (status === 'В работе' || status === 'Новая') return { closedAt: null };
  return {};
}

/** Заявка считается незакрытой, пока статус не «Закрыта» — такие и показываем в счётчике. */
export const isOpenTicket = (status?: string | null): boolean => status !== 'Закрыта';
