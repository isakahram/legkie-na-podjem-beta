import { Info, Inbox, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AttentionReason } from '../../types';

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`sp-panel ${className}`.trim()}>
      {(title || actions) && (
        <header className="sp-panel__head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="sp-panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function KpiCard({
  label,
  value,
  note,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'accent';
  icon?: ReactNode;
}) {
  return (
    <article className={`sp-kpi sp-kpi--${tone}`}>
      {icon && <span className="sp-kpi__icon">{icon}</span>}
      <div className="sp-kpi__body">
        <small>{label}</small>
        <strong>{value}</strong>
        {note && <p>{note}</p>}
      </div>
    </article>
  );
}

export function StatusPill({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'positive' | 'warning' | 'critical';
  children: ReactNode;
}) {
  return <span className={`sp-pill sp-pill--${tone}`}>{children}</span>;
}

export function AttentionBadge({ reasons }: { reasons: AttentionReason[] }) {
  if (reasons.length === 0) return null;
  const critical = reasons.some((reason) => reason.severity === 'critical');
  return (
    <StatusPill tone={critical ? 'critical' : 'warning'}>
      Требует внимания
    </StatusPill>
  );
}

export function ValidationNote({ children }: { children?: ReactNode }) {
  return (
    <p className="sp-validation">
      <Info size={14} aria-hidden />
      {children ?? 'Физиологические показатели носят справочный характер и требуют валидации специалистом.'}
    </p>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="sp-empty">
      <Inbox aria-hidden />
      <b>{title}</b>
      {hint && <span>{hint}</span>}
    </div>
  );
}

export function Spinner({ label = 'Загружаем данные…' }: { label?: string }) {
  return (
    <div className="sp-spinner" role="status">
      <Loader2 aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="sp-error" role="alert">
      {message}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="sp-segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'is-active' : ''}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="sp-pagination" aria-label="Страницы списка">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Назад
      </button>
      <span>
        Страница {page} из {pages}
      </span>
      <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Вперёд
      </button>
    </nav>
  );
}
