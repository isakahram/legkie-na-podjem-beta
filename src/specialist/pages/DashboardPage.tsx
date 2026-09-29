import { Activity, CalendarCheck, ChevronRight, TriangleAlert, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import type { DashboardDto, DashboardPeriod } from '../../types';
import { BarSeriesChart } from '../components/charts';
import {
  EmptyState,
  ErrorBanner,
  KpiCard,
  Panel,
  SegmentedControl,
  Spinner,
  StatusPill,
  ValidationNote,
} from '../components/ui';
import { usePersistentState } from '../hooks';
import { formatDateTime, formatDuration, formatPercent } from '../lib/format';

const PERIOD_OPTIONS: Array<{ value: DashboardPeriod; label: string }> = [
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: '8weeks', label: '8 недель' },
];

/** Подпись периода для KPI: без неё «25%» читается как «за всё время». */
const PERIOD_NOTES: Record<DashboardPeriod, string> = {
  week: 'за неделю',
  month: 'за 4 недели',
  '8weeks': 'за 8 недель',
};

export function DashboardPage() {
  const [period, setPeriod] = usePersistentState<DashboardPeriod>('sp-dashboard-period', 'week');
  const [data, setData] = useState<DashboardDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const periodNote = PERIOD_NOTES[period];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.v1
      .dashboard(period)
      .then((response) => {
        if (!cancelled) {
          setData(response);
          setError('');
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Не удалось загрузить сводку');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <div className="sp-page sp-fade">
      <div className="sp-page__head">
        <div>
          <h1>Сводка</h1>
          <p>Занятия, регулярность и дети, которым сейчас нужно внимание.</p>
        </div>
        <SegmentedControl
          ariaLabel="Период сводки"
          value={period}
          options={PERIOD_OPTIONS}
          onChange={setPeriod}
        />
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && !data && <Spinner label="Собираем сводку…" />}

      {data && (
        <>
          <section className="sp-kpi-grid">
            <KpiCard
              icon={<Users size={18} aria-hidden />}
              tone="accent"
              label="Активные пациенты"
              value={`${data.kpi.activePatients}`}
              note={`всего под наблюдением: ${data.kpi.totalPatients}`}
            />
            <KpiCard
              icon={<CalendarCheck size={18} aria-hidden />}
              tone="positive"
              label="Занятий за период"
              value={`${data.kpi.sessionsInPeriod}`}
              note={`план ${periodNote}: ${data.kpi.targetSessionsInPeriod}`}
            />
            <KpiCard
              icon={<Activity size={18} aria-hidden />}
              tone="neutral"
              label="Средняя регулярность"
              value={formatPercent(data.kpi.averageAdherencePercent)}
              note={`доля выполненного плана ${periodNote}`}
            />
            <KpiCard
              icon={<TriangleAlert size={18} aria-hidden />}
              tone="warning"
              label="Пропуски"
              value={`${data.kpi.missedSessions}`}
              note={`из ${data.kpi.targetSessionsInPeriod} плановых ${periodNote} · требуют внимания: ${data.kpi.attentionCount}`}
            />
          </section>

          <Panel title="Динамика занятий" subtitle="Все пациенты, 8 недель">
            <BarSeriesChart
              ariaLabel="Количество занятий по неделям в сравнении с планом"
              points={data.series.map((point) => ({
                label: point.label,
                value: point.sessions,
                target: point.target,
              }))}
            />
          </Panel>

          <div className="sp-two-col">
            <Panel title="Требуют внимания" subtitle="Пропуски и снижение динамики">
              {data.attention.length === 0 ? (
                <EmptyState title="Все занимаются по плану" hint="Пропусков и спада динамики нет." />
              ) : (
                <ul className="sp-attention-list">
                  {data.attention.map((item) => (
                    <li key={item.patientId}>
                      <Link to={`/specialist/patients/${item.patientId}`}>
                        <span className="sp-avatar sp-avatar--sm" aria-hidden>
                          {item.avatar}
                        </span>
                        <span className="sp-attention-list__body">
                          <b>{item.pseudonym}</b>
                          <span className="sp-attention-list__reasons">
                            {item.reasons.map((reason) => (
                              <StatusPill
                                key={reason.code}
                                tone={reason.severity === 'critical' ? 'critical' : 'warning'}
                              >
                                {reason.label}
                              </StatusPill>
                            ))}
                          </span>
                        </span>
                        <ChevronRight size={18} aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <ValidationNote>
                Список формируется автоматически по регулярности и требует проверки специалистом.
              </ValidationNote>
            </Panel>

            <Panel title="Последние занятия" subtitle="Свежая лента по всем детям">
              {data.recentSessions.length === 0 ? (
                <EmptyState title="Занятий пока нет" />
              ) : (
                <ul className="sp-feed">
                  {data.recentSessions.map((session) => (
                    <li key={session.id}>
                      <Link to={`/specialist/patients/${session.patientId}`}>
                        <b>{session.pseudonym}</b>
                        <small>{formatDateTime(session.startedAt)}</small>
                        <span>
                          {session.completedBreaths}/{session.targetBreaths} выдохов ·{' '}
                          {formatDuration(session.durationSeconds)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
