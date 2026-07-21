// Чистые справочники аудита (без БД, edge/клиент-safe).

// Действия → человекочитаемо (для ленты «История»).
export const ACTION_RU: Record<string, string> = {
  created: 'создан',
  updated: 'изменён',
  deleted: 'удалён',
  cancelled: 'отменён',
  reversed: 'сторнирован',
  payment: 'проведён платёж',
  status_changed: 'смена статуса',
  login: 'вход в систему',
};

// Типы сущностей → подпись, иконка, маршрут в /erp (куда вести по клику).
export const ENTITY_META: Record<string, { ru: string; icon: string; route: string | null }> = {
  sale:        { ru: 'Продажа',      icon: '💰', route: '/erp/sales' },
  order:       { ru: 'Заявка',       icon: '📥', route: '/erp/orders' },
  certificate: { ru: 'Сертификат',   icon: '📋', route: '/erp/certs' },
  operation:   { ru: 'Операция',     icon: '💳', route: '/erp/finance' },
  debt:        { ru: 'Долг',         icon: '💳', route: '/erp/debts' },
  debt_payment:{ ru: 'Погашение',    icon: '💳', route: '/erp/debts' },
  task:        { ru: 'Задача',       icon: '✅', route: '/erp/tasks' },
  client:      { ru: 'Клиент',       icon: '👤', route: '/erp/clients' },
  user:        { ru: 'Пользователь', icon: '👥', route: '/erp/settings/users' },
  document:    { ru: 'Документ',     icon: '📄', route: '/erp/documents' },
  stock:       { ru: 'Склад',        icon: '🏭', route: '/erp/warehouse' },
  salary:      { ru: 'Зарплата',     icon: '👥', route: '/erp/staff' },
  permissions: { ru: 'Права',        icon: '🔑', route: '/erp/access' },
  org:         { ru: 'Реквизиты',    icon: '⚙️', route: '/erp/settings/org' },
  branch:      { ru: 'Филиал',       icon: '🏢', route: '/erp/settings/branches' },
};

export const AUDIT_ALL_ROLES = ['admin', 'director', 'accountant'];   // видят «Все сотрудники»
export const AUDIT_LOGIN_ROLES = ['admin'];                          // видят вкладку «Входы»

export function entityMeta(t?: string | null) {
  return (t && ENTITY_META[t]) || { ru: t || '—', icon: '•', route: null };
}
export function actionRu(a?: string | null) {
  return (a && ACTION_RU[a]) || a || '—';
}

// ── Чистые функции аудита (без БД — тестируемые) ──────────────

// Сегмент пути /api/v2/<seg> → тип сущности.
export const ENTITY_BY_SEG: Record<string, string> = {
  sales: 'sale', orders: 'order', certs: 'certificate', finance: 'operation',
  debts: 'debt', 'debt-payments': 'debt_payment', tasks: 'task', clients: 'client',
  users: 'user', documents: 'document', products: 'stock', employees: 'salary',
  'role-permissions': 'permissions', org: 'org', branches: 'branch',
};

export function actionForPath(method: string, path: string): string | null {
  if (path.endsWith('/cancel')) return 'cancelled';
  if (path.endsWith('/reverse')) return 'reversed';
  if (/\/payments$/.test(path)) return 'payment';
  if (/\/read(-all)?$/.test(path)) return null;      // отметка «прочитано» — не логируем
  if (method === 'DELETE') return 'deleted';
  if (method === 'PATCH' || method === 'PUT') return 'updated';
  if (method === 'POST') return 'created';
  return null;
}

export function labelOfResult(r: unknown): string | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  const v = o.saleNo ?? o.orderNo ?? o.number ?? o.title ?? o.name ?? o.counterpartyName ?? o.skuCode;
  return v == null ? null : String(v);
}

export type AuditDraft = { action?: string | null; entityType?: string | null; entityId?: string | null; label?: string | null; details?: unknown; skip?: boolean };
export type ResolvedMutation = { action: string; entityType: string; entityId: string | null; entityLabel: string | null; details: unknown };

// Из (метод, путь, params, результат, черновик) → строка аудита или null (не логировать).
export function resolveMutation(o: {
  method: string; path: string; params?: Record<string, string>; result: unknown; draft?: AuditDraft;
}): ResolvedMutation | null {
  if (o.draft?.skip) return null;
  const seg = o.path.split('/')[3] || '';
  const entityType = o.draft?.entityType ?? ENTITY_BY_SEG[seg];
  const action = o.draft?.action ?? actionForPath(o.method, o.path);
  if (!entityType || !action) return null;
  const r = o.result as Record<string, unknown> | null;
  const entityId = o.draft?.entityId ?? o.params?.id ?? (r && typeof r === 'object' ? (r.id as string | undefined) ?? null : null);
  return {
    action, entityType,
    entityId: (entityId as string) ?? null,
    entityLabel: o.draft?.label ?? labelOfResult(r),
    details: o.draft?.details ?? null,
  };
}

// План выборки ленты по роли/скоупу (роль-гейт, тестируемо).
export function auditListPlan(role: string, scope: string): { onlyLogins: boolean; mineOnly: boolean; denied: boolean } {
  if (scope === 'logins') {
    return AUDIT_LOGIN_ROLES.includes(role) ? { onlyLogins: true, mineOnly: false, denied: false } : { onlyLogins: false, mineOnly: true, denied: true };
  }
  const canAll = AUDIT_ALL_ROLES.includes(role);
  return { onlyLogins: false, mineOnly: scope !== 'all' || !canAll, denied: false };
}
