'use client';
import useSWR, { type SWRConfiguration } from 'swr';

// Единый клиентский слой данных для новых ERP-страниц (/erp).
// Ошибки API (JSON {error}) превращаются в Error с человекочитаемым текстом.
export async function apiFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try { const e = await r.json(); msg = e.error || msg; } catch { /* keep */ }
    throw new Error(msg);
  }
  const ct = r.headers.get('content-type') || '';
  return (ct.includes('json') ? await r.json() : await r.text()) as T;
}

export const apiSend = <T = unknown>(url: string, method: string, body?: unknown) =>
  apiFetch<T>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

// SWR-хук: useApi<T>('/api/v2/...') → { data, error, isLoading, mutate }.
export function useApi<T = unknown>(url: string | null, config?: SWRConfiguration) {
  return useSWR<T>(url, (u: string) => apiFetch<T>(u), config);
}
