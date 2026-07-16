// Pure presence helper (no DB) — online = last_seen_at within 3 minutes.
export const ONLINE_MS = 3 * 60 * 1000;

export function isOnline(lastSeenAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  return Number.isFinite(t) && now - t <= ONLINE_MS;
}
