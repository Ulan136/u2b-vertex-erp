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

export function Modal({ open, onClose, title, children, footer, width = 520 }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div className="ui-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ui-modal" style={{ width }}>
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
export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input className="ui-input" {...p} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className="ui-input ui-textarea" {...p} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select className="ui-input" {...p} />;

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className="ui-empty">{children}</div>;
}

// Фильтр по дням: диапазон дат «с … по …» + быстрые пресеты. Значения — ISO
// (YYYY-MM-DD); пустая строка = без границы. Строковое сравнение дат корректно.
export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const preset = (days: number) => { const t = new Date(); onChange(iso(new Date(t.getTime() - days * 864e5)), iso(t)); };
  const todayOnly = () => { const t = iso(new Date()); onChange(t, t); };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <input type="date" className="ui-input" style={{ width: 148 }} value={from} max={to || undefined} onChange={e => onChange(e.target.value, to)} title="С даты" />
      <span className="erp-muted" style={{ fontSize: 12 }}>—</span>
      <input type="date" className="ui-input" style={{ width: 148 }} value={to} min={from || undefined} onChange={e => onChange(from, e.target.value)} title="По дату" />
      <button type="button" className="erp-chip" onClick={todayOnly}>Сегодня</button>
      <button type="button" className="erp-chip" onClick={() => preset(6)}>7 дней</button>
      <button type="button" className="erp-chip" onClick={() => preset(29)}>30 дней</button>
      {(from || to) && <button type="button" className="erp-chip" onClick={() => onChange('', '')}>× сброс</button>}
    </span>
  );
}
