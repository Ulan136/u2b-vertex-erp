'use client';
// P1-2 (настройка видимых колонок): попап «Колонки» с чекбоксами + запоминание в
// localStorage. Скрытие — через CSS: у каждой ячейки класс col-<key>, а этот
// компонент инъектит <style> `.wrapClass .col-<key>{display:none}` для скрытых.
import * as React from 'react';

export type Col = { key: string; label: string; locked?: boolean };

export function useCols(routeKey: string, cols: Col[]) {
  const storageKey = `erp_cols_${routeKey}`;
  const wrapClass = `erp-cols-${routeKey}`;
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) setHidden(new Set(JSON.parse(raw) as string[])); } catch { /* ignore */ }
  }, [storageKey]);
  const persist = (s: Set<string>) => { setHidden(new Set(s)); try { localStorage.setItem(storageKey, JSON.stringify(Array.from(s))); } catch { /* ignore */ } };
  const toggle = (k: string) => { const s = new Set(hidden); if (s.has(k)) s.delete(k); else s.add(k); persist(s); };
  const reset = () => persist(new Set());
  return { hidden, toggle, reset, cols, wrapClass };
}

export type ColsCtl = ReturnType<typeof useCols>;

export function ColumnMenu({ ctl }: { ctl: ColsCtl }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const css = Array.from(ctl.hidden).map(k => `.${ctl.wrapClass} .col-${k}{display:none}`).join('');
  const nHidden = ctl.cols.filter(c => ctl.hidden.has(c.key)).length;
  return (
    <div className="erp-cols" ref={ref}>
      <style>{css}</style>
      <button type="button" className="ui-btn ui-btn-outline" onClick={() => setOpen(o => !o)} aria-expanded={open} title="Показать/скрыть колонки">
        ⚙ Колонки{nHidden ? ` · −${nHidden}` : ''}
      </button>
      {open && (
        <div className="erp-cols-pop" role="menu">
          <div className="erp-cols-pop-head">Колонки таблицы</div>
          {ctl.cols.map(c => (
            <label key={c.key} className={`erp-cols-row${c.locked ? ' is-locked' : ''}`}>
              <input type="checkbox" checked={!ctl.hidden.has(c.key)} disabled={c.locked} onChange={() => !c.locked && ctl.toggle(c.key)} />
              <span>{c.label}</span>
            </label>
          ))}
          <button type="button" className="erp-cols-reset" onClick={ctl.reset}>Показать все</button>
        </div>
      )}
    </div>
  );
}
