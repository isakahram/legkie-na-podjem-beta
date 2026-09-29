import { Activity, CalendarCheck, Target, TriangleAlert, Wind } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PatientV1DetailDto } from '../../../types';
import { KpiCard, Panel, StatusPill, ValidationNote } from '../../components/ui';
import { formatDateTime, formatDuration, formatPercent, formatSeconds, formatTrendContext } from '../../lib/format';

/** Занятия текущей недели для короткой ленты. */
const recentSessions = (detail: PatientV1DetailDto) =>
  detail.sessions
    .filter((session) => session.status === 'completed' && session.inputMode === 'microphone')
    .slice(0, 5);

export function OverviewTab({ detail }: { detail: PatientV1DetailDto }) {
  const { patient } = detail;
  const { summary, assignment, attention } = patient;
  const weeklyBreaths = detail.weekly.at(-1)?.breaths ?? 0;
  // Динамика формулируется словами: «-100%» без данных за период вводит врача в заблуждение.
  const trendLabel = formatTrendContext({
    trendPercent: summary.trendPercent,
    previousPercent: summary.trendPreviousPercent,
    currentPercent: summary.trendCurrentPercent,
    hasCurrentData: summary.trendHasCurrentData,
    currentWeekIsPartial: summary.trendWeekIsPartial,
  });

  return (
    <div className="sp-stack">
      <section className="sp-kpi-grid">
        <KpiCard
          icon={<CalendarCheck size={18} aria-hidden />}
          tone={summary.missedThisWeek === 0 ? 'positive' : 'warning'}
          label="Регулярность за неделю"
          value={`${summary.sessionsThisWeek}/${summary.targetSessions}`}
          note={formatPercent(summary.adherencePercent)}
        />
        <KpiCard
          icon={<Wind size={18} aria-hidden />}
          label="Средняя длительность выдоха"
          value={formatSeconds(summary.averageBreathDuration)}
          note="по завершённым выдохам"
        />
        <KpiCard
          icon={<Activity size={18} aria-hidden />}
          label="Стабильность"
          value={formatPercent(summary.averageStability)}
          note={trendLabel}
        />
        <KpiCard
          icon={<Target size={18} aria-hidden />}
          tone="accent"
          label="Выдохов за неделю"
          value={`${weeklyBreaths}`}
          note={`план: ${assignment.targetBreaths * assignment.sessionsPerWeek}`}
        />
        <KpiCard
          icon={<TriangleAlert size={18} aria-hidden />}
          tone={summary.missedThisWeek > 0 ? 'warning' : 'neutral'}
          label="Пропуски на этой неделе"
          value={`${summary.missedThisWeek}`}
          note={
            attention.daysSinceLastSession === null
              ? 'занятий ещё не было'
              : `последнее занятие ${attention.daysSinceLastSession} дн. назад`
          }
        />
      </section>

      <div className="sp-two-col">
        <Panel title="Активное назначение" subtitle="Параметры, по которым работает игра">
          <dl className="sp-defs">
            <div>
              <dt>Выдохов за занятие</dt>
              <dd>{assignment.targetBreaths}</dd>
            </div>
            <div>
              <dt>Занятий в неделю</dt>
              <dd>{assignment.sessionsPerWeek}</dd>
            </div>
            <div>
              <dt>Минимальный засчитываемый выдох</dt>
              <dd>{assignment.minCompletedBreathSeconds} с</dd>
            </div>
            <div>
              <dt>Целевая длительность выдоха</dt>
              <dd>
                {assignment.targetBreathDurationMin ?? '—'}–{assignment.targetBreathDurationMax ?? '—'} с
              </dd>
            </div>
          </dl>
          {assignment.note && <p className="sp-hint">{assignment.note}</p>}
          <Link to="assignments" className="sp-link">
            Перейти к назначениям
          </Link>
        </Panel>

        <Panel title="Статус регулярности" subtitle="Автоматическая оценка">
          <p className="sp-hint">
            Динамика: <strong>{trendLabel}</strong>
          </p>
          {attention.needsAttention ? (
            <ul className="sp-reason-list">
              {attention.reasons.map((reason) => (
                <li key={reason.code}>
                  <StatusPill tone={reason.severity === 'critical' ? 'critical' : 'warning'}>
                    {reason.label}
                  </StatusPill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sp-hint">
              Ребёнок занимается в графике: пропусков больше трёх дней и спада динамики нет.
            </p>
          )}
          <ValidationNote />
        </Panel>
      </div>

      <Panel title="Последние занятия" subtitle="Пять свежих записей">
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th scope="col">Дата</th>
                <th scope="col">Длительность</th>
                <th scope="col">Выдохи</th>
                <th scope="col">Стабильность</th>
              </tr>
            </thead>
            <tbody>
              {recentSessions(detail).map((session) => (
                <tr key={session.id}>
                  <td>{formatDateTime(session.startedAt)}</td>
                  <td>{formatDuration(session.durationSeconds)}</td>
                  <td>
                    {session.completedBreaths ?? 0}/{session.targetBreaths ?? '—'}
                  </td>
                  <td>{formatPercent(session.averageStability)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Link to="sessions" className="sp-link">
          Все занятия
        </Link>
      </Panel>
    </div>
  );
}
