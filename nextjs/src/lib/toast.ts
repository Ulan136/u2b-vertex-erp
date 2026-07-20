'use client';
// Лёгкий тост для нового ERP (аналог showToast из старого интерфейса).
export function toast(msg: string) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('erp-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'erp-toast';
    el.className = 'erp-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  window.clearTimeout((el as HTMLElement & { _t?: number })._t);
  (el as HTMLElement & { _t?: number })._t = window.setTimeout(() => el && el.classList.remove('show'), 2600);
}
