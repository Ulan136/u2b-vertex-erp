import { NextRequest } from 'next/server';
import { withApi, optionsHandler } from '@/server/lib/http';
import { auditService } from '@/server/services/audit.service';

export const OPTIONS = optionsHandler;

// GET /api/v2/audit?scope=mine|all|logins&entityType=&entityId=&q=&limit=&offset=
// Роль-гейт внутри сервиса: «Все» — Админ/Директор/Бухгалтер; «Входы» — Админ.
export const GET = withApi(async (req: NextRequest, ctx) => {
  const sp = new URL(req.url).searchParams;
  return auditService.list(
    { id: ctx.user!.id, role: ctx.user!.role },
    {
      scope: sp.get('scope'),
      entityType: sp.get('entityType'),
      entityId: sp.get('entityId'),
      q: sp.get('q'),
      limit: Number(sp.get('limit')) || 40,
      offset: Number(sp.get('offset')) || 0,
    },
  );
});
