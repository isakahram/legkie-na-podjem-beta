import { useEffect, useState } from 'react';
import { api } from '../../../api';
import type { PatientAnalyticsDto, PatientV1DetailDto } from '../../../types';
import { BarSeriesChart, LineSeriesChart } from '../../components/charts';
import { ErrorBanner, Panel, Spinner, StatusPill, ValidationNote } from '../../components/ui';
import { formatPercent, formatSeconds } from '../../lib/format';

const deltaTone = (value: number | null): 'positive' | 'warning' | 'neutral' => {
  if (value === null) return 'neutral';
  if (value > 0) return 'positive';
  if (value < 0) return 'warning';
  return 'neutral';
};

const deltaLabel = (value: number | null): string =>
  value === null ? 'нет данных для сравнения' : `${value > 0 ? '+' : ''}${value}%`;

export function ChartsTab({ patientId, detail }: { patientId: string; detail: PatientV1DetailDto }) {
  const [analytics, setAnalytics] = useState<PatientAnalyticsDto | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.v1
      .getPatientAnalytics(patientId)
      .then((response) => {
        if (!cancelled) setAnalytics(response);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Не удалось загрузить графики');
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (error) return <ErrorBanner message={error} />;
  if (!analytics) return <Spinner label="Считаем динамику…" />;

  const { weekly, planFact, comparison } = analytics;

  return (
    <div className="sp-stack">
      <div className="sp-two-col">
        <Panel title="Длительность выдоха" subtitle="Среднее по неделям, секунды">
          <LineSeriesChart
            ariaLabel="Динамика средней длительности выдоха по неделям"
            unit=" с"
            points={weekly.map((point) => ({
              label: point.label,
              value: point.averageBreathDuration ?? 0,
            }))}
          />
          <p className="sp-hint">
            Показатель усредняется по завершённым выдохам недели; недели без занятий отображаются нулём.
          </p>
        </Panel>

        <Panel title="Стабильность выдоха" subtitle="Среднее по неделям, проценты">
          <LineSeriesChart
            ariaLabel="Динамика стабильности выдоха по неделям"
            unit="%"
            points={weekly.map((point) => ({ label: point.label, value: point.averageStability ?? 0 }))}
          />
        </Panel>
      </div>

      <div className="sp-two-col">
        <Panel title="Количество выдохов" subtitle="Сумма за неделю">
          <BarSeriesChart
            ariaLabel="Количество выдохов по неделям в сравнении с планом"
            targetLabel="план по назначению"
            points={planFact.map((point) => ({
              label: point.label,
              value: point.factBreaths,
              target: point.planBreaths,
            }))}
          />
        </Panel>

        <Panel title="Регулярность" subtitle="Занятия против плана">
          <BarSeriesChart
            ariaLabel="Количество занятий по неделям в сравнении с назначением"
            points={planFact.map((point) => ({
              label: point.label,
              value: point.factSessions,
              target: point.planSessions,
            }))}
          />
        </Panel>
      </div>

      <Panel
        title="Две недели против двух предыдущих"
        subtitle="Короткое окно показывает изменения раньше, чем месячная сводка"
      >
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th scope="col">Показатель</th>
                <th scope="col">Текущие 2 недели</th>
                <th scope="col">Предыдущие 2 недели</th>
                <th scope="col">Изменение</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Занятий</th>
                <td>{comparison.current.sessions}</td>
                <td>{comparison.previous.sessions}</td>
                <td>
                  <StatusPill tone={deltaTone(comparison.delta.sessions)}>
                    {deltaLabel(comparison.delta.sessions)}
                  </StatusPill>
                </td>
              </tr>
              <tr>
                <th scope="row">Средний выдох</th>
                <td>{formatSeconds(comparison.current.averageBreathDuration)}</td>
                <td>{formatSeconds(comparison.previous.averageBreathDuration)}</td>
                <td>
                  <StatusPill tone={deltaTone(comparison.delta.averageBreathDuration)}>
                    {deltaLabel(comparison.delta.averageBreathDuration)}
                  </StatusPill>
                </td>
              </tr>
              <tr>
                <th scope="row">Стабильность</th>
                <td>{formatPercent(comparison.current.averageStability)}</td>
                <td>{formatPercent(comparison.previous.averageStability)}</td>
                <td>
                  <StatusPill tone={deltaTone(comparison.delta.averageStability)}>
                    {deltaLabel(comparison.delta.averageStability)}
                  </StatusPill>
                </td>
              </tr>
              <tr>
                <th scope="row">Выдохов всего</th>
                <td>{comparison.current.totalBreaths}</td>
                <td>{comparison.previous.totalBreaths}</td>
                <td>
                  <StatusPill tone={deltaTone(comparison.delta.totalBreaths)}>
                    {deltaLabel(comparison.delta.totalBreaths)}
                  </StatusPill>
                </td>
              </tr>
              <tr>
                <th scope="row">Регулярность</th>
                <td>{formatPercent(comparison.current.adherencePercent)}</td>
                <td>{formatPercent(comparison.previous.adherencePercent)}</td>
                <td>
                  <StatusPill tone={deltaTone(comparison.delta.adherencePercent)}>
                    {deltaLabel(comparison.delta.adherencePercent)}
                  </StatusPill>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ValidationNote />
      </Panel>

      <Panel title="Сравнение с назначением" subtitle="Насколько факт близок к плану по выдохам">
        <BarSeriesChart
          ariaLabel="Сравнение фактического числа выдохов с назначением"
          targetLabel={`назначение: ${detail.patient.assignment.targetBreaths} выдохов`}
          points={planFact.map((point) => ({
            label: point.label,
            value: point.planBreaths === 0 ? 0 : Math.round((point.factBreaths / point.planBreaths) * 100),
            target: 100,
          }))}
        />
        <p className="sp-hint">Значения приведены в процентах выполнения недельного плана по выдохам.</p>
      </Panel>
    </div>
  );
}
