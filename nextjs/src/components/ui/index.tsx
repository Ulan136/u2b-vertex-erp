import * as React from 'react';

// Переиспользуемые примитивы нового ERP-интерфейса. Растут по мере миграции.
export function Card({ children, className = '', ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-card ${className}`} {...rest}>{children}</div>;
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'err' | 'info' }) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' };
export function Button({ variant = 'primary', className = '', ...rest }: BtnProps) {
  return <button className={`ui-btn ui-btn-${variant} ${className}`} {...rest} />;
}

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="ui-pagetitle-row">
      <div className="ui-pagetitle">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {action && <div className="ui-pagetitle-action">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 560 }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  // Enter в поле → переход к следующему полю (быстрый ввод). В textarea — перенос
  // строки; на последнем поле Enter нажимает главную кнопку внизу (сабмит).
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const t = e.target as HTMLElement;
    const tag = t.tagName;
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
    if (tag !== 'INPUT' && tag !== 'SELECT') return;
    if ((t as HTMLInputElement).type === 'checkbox' || (t as HTMLInputElement).type === 'radio') return;
    e.preventDefault();
    const root = rootRef.current; if (!root) return;
    const fields = Array.from(root.querySelectorAll<HTMLElement>('.ui-modal-body input, .ui-modal-body select, .ui-modal-body textarea'))
      .filter(el => !(el as HTMLInputElement).disabled && el.offsetParent !== null && (el as HTMLInputElement).type !== 'hidden');
    const i = fields.indexOf(t);
    const next = fields[i + 1];
    if (next) next.focus();
    else (root.querySelector('.ui-modal-foot .ui-btn-primary') as HTMLButtonElement | null)?.click();
  }
  if (!open) return null;
  return (
    <div className="ui-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-modal" style={{ width }} ref={rootRef} onKeyDown={onKeyDown}>
        <div className="ui-modal-head"><h3>{title}</h3><button className="ui-modal-close" onClick={onClose} aria-label="Закрыть">✕</button></div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <label className="ui-field"><span className="ui-field-label">{label}{required && ' *'}</span>{children}</label>;
}
export const Input = ({ className = '', ...p }: React.InputHTMLAttributes<HTMLInputElement>) => <input className={`ui-input ${className}`} {...p} />;
// Поле суммы: показывает число с разделением тысяч (300 000), а хранит «сырую»
// числовую строку (300000). onValue отдаёт сырое значение (только цифры + точка).
export function MoneyInput({ value, onValue, className = '', ...rest }: { value: string | number | null | undefined; onValue: (v: string) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'className'>) {
  const raw = value == null ? '' : String(value);
  const n = raw.replace(/\s/g, '');
  const display = n === '' ? '' : (n.includes('.') ? n : (Number(n) || 0).toLocaleString('ru-RU'));
  return <input className={`ui-input ${className}`} type="text" inputMode="decimal" value={display}
    onChange={e => onValue(e.target.value.replace(/[^\d.]/g, ''))} {...rest} />;
}
export const Textarea = ({ className = '', ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={`ui-input ui-textarea ${className}`} {...p} />;
export const Select = ({ className = '', ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select className={`ui-input ${className}`} {...p} />;

export function EmptyRow({ children }: { children: React.ReactNode }) {
  // aria-live: скринридер озвучивает смену состояния (загрузка/пусто/ошибка). P3-2.
  return <div className="ui-empty" role="status" aria-live="polite">{children}</div>;
}

// Фильтр по дням: диапазон дат «с … по …» + быстрые пресеты. Значения — ISO
// (YYYY-MM-DD); пустая строка = без границы. Строковое сравнение дат корректно.
export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  // Локальные компоненты, НЕ toISOString (UTC мог сдвинуть день на границе суток).
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayOnly = () => { const t = iso(new Date()); onChange(t, t); };
  const yesterdayOnly = () => { const y = iso(new Date(Date.now() - 864e5)); onChange(y, y); };
  const thisMonth = () => { const d = new Date(); onChange(iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))); };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <input type="date" className="ui-input" style={{ width: 148 }} value={from} max={to || undefined} onChange={e => onChange(e.target.value, to)} title="С даты" />
      <span className="erp-muted" style={{ fontSize: 12 }}>—</span>
      <input type="date" className="ui-input" style={{ width: 148 }} value={to} min={from || undefined} onChange={e => onChange(from, e.target.value)} title="По дату" />
      <button type="button" className="erp-chip" onClick={todayOnly}>Сегодня</button>
      <button type="button" className="erp-chip" onClick={yesterdayOnly}>Вчера</button>
      <button type="button" className="erp-chip" onClick={thisMonth}>Текущий месяц</button>
      {(from || to) && <button type="button" className="erp-chip" onClick={() => onChange('', '')}>× сброс</button>}
    </span>
  );
}
