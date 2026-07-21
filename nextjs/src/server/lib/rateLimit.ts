// Ин-мемори скользящее окно — первая линия защиты от брутфорса/флуда.
// В serverless состояние живёт на инстанс (не общее для всех), но тёплый инстанс
// держит окно и отбивает шквал с одного адреса. Для строгих гарантий позже
// вынести в Upstash/Redis (общий стор).

type Hit = { count: number; reset: number };
const buckets = new Map<string, Hit>();

// Проверить и учесть попытку. ok=false → лимит превышен, retryAfter в секундах.
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > 5000) sweep(now);            // не даём Map расти бесконечно
  const cur = buckets.get(key);
  if (!cur || cur.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  cur.count++;
  if (cur.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((cur.reset - now) / 1000)) };
  return { ok: true, retryAfter: 0 };
}

function sweep(now: number) {
  buckets.forEach((v, k) => { if (v.reset <= now) buckets.delete(k); });
}

// IP клиента за прокси Vercel (x-forwarded-for → первый адрес).
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
}
