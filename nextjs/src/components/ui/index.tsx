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

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="ui-pagetitle">
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </div>
  );
}
