'use client';
import * as React from 'react';

// Переход к конкретной строке журнала по ?focus=<id> из URL. Строке нужно проставить
// data-focus-id={id}. Данные грузятся асинхронно, поэтому опрашиваем DOM до ~6с, пока
// строка не появится; найдя — плавно скроллим по центру и подсвечиваем вспышкой.
// `ready` — любое значение (напр. длина списка): смена перезапускает поиск после загрузки.
export function useRowFocus(ready?: unknown) {
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const focus = new URLSearchParams(window.location.search).get('focus');
    if (!focus) return;
    const sel = `[data-focus-id="${window.CSS && CSS.escape ? CSS.escape(focus) : focus}"]`;
    let tries = 0;
    const timer = window.setInterval(() => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('row-focus-flash');
        window.setTimeout(() => el.classList.remove('row-focus-flash'), 2600);
        window.clearInterval(timer);
      } else if (++tries > 60) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [ready]);
}
