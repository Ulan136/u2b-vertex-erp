import { z } from 'zod';

export const COMMENT_ENTITIES = ['order', 'task'] as const;
export type CommentEntity = (typeof COMMENT_ENTITIES)[number];

export const commentCreateSchema = z.object({
  entityType: z.enum(COMMENT_ENTITIES),
  entityId: z.string().uuid(),
  text: z.string().trim().min(1, 'Комментарий пустой').max(2000),
});

export type CommentCreate = z.infer<typeof commentCreateSchema>;
