import { FileText, Printer } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import type { PatientV1DetailDto, ReportSnapshotDto } from '../../../types';
import { useSpecialistAuth } from '../../AuthContext';
import { BarSeriesChart } from '../../components/charts';
import {
  EmptyState,
  ErrorBanner,
  Panel,
  SegmentedControl,
  Spinner,
  ValidationNote,
} from '../../components/ui';
import { formatDate, formatDateTime, formatPercent, formatSeconds, formatTrendContext } from '../../lib/format';
import { openPrintableReport } from '../../lib/pdf';

type ReportPeriod = '4' | '8' | '12';

const PERIODS: Array<{ value: ReportPeriod; label: string }> = [
  { value: '4', label: '4 недели' },
  { value: '8', label: '8 недель' },
  { value: '12', label: '12 недель' },
];

export function ReportsTab({ patientId, detail }: { patientId: string; detail: PatientV1DetailDto }) {
  const { canMutate } = useSpecialistAuth();
  const [period, setPeriod] = useState<ReportPeriod>('8');
  const [reports, setReports] = useState<ReportSnapshotDto[] | null>(null);
  const [active, setActive] = useState<ReportSnapshotDto | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const load = useCallback(() => {
    return api.v1
      .listReports(patientId)
      .then((response) => {
        setReports(response);
        setActive((current) => current ?? response[0] ?? null);
        setError('');
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить отчёты'),
      );
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (): Promise<void> => {
    setPending(true);
    setError('');
    try {
      const periodEnd = new Date();
      const periodStart = new Date(periodEnd.getTime() - Number(period) * 7 * 86_400_000);
      const created = await api.v1.createReport(patientId, {
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });
      setActive(created);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сформировать отчёт');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="sp-stack">
      <Panel
        title="Сводка за период"
        subtitle="Структурированный отчёт по занятиям ребёнка"
        actions={
          <div className="sp-toolbar">
            <SegmentedControl
              ariaLabel="Период отчёта"
              value={period}
              options={PERIODS}
              onChange={setPeriod}
            />
            {canMutate && (
              <button type="button" className="sp-button sp-button--primary" onClick={() => void create()} disabled={pending}>
                <FileText size={16} aria-hidden /> {pending ? 'Формируем…' : 'Сформировать отчёт'}
              </button>
            )}
          </div>
        }
      >
        {error && <ErrorBanner message={error} />}
        {!reports && !error && <Spinner label="Загружаем отчёты…" />}

        {reports && !active && (
          <EmptyState
            title="Отчётов пока нет"
            hint={canMutate ? 'Выберите период и сформируйте первый отчёт.' : 'В режиме просмотра отчёты не создаются.'}
          />
        )}

        {active && (
          <>
            <div className="sp-report-head">
              <div>
                <b>
                  {formatDate(active.periodStart)} — {formatDate(active.periodEnd)}
                </b>
                <small>сформирован {formatDateTime(active.createdAt)}</small>
              </div>
              <button
                type="button"
                className="sp-button"
                onClick={() => openPrintableReport(detail.patient, active.data)}
              >
                <Printer size={16} aria-hidden /> Версия для печати и PDF
              </button>
            </div>

            <div className="sp-table-wrap">
              <table className="sp-table">
                <thead>
                  <tr>
                    <th scope="col">Показатель</th>
                    <th scope="col">Значение</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">Занятий за период</th>
                    <td>{active.data.sessions}</td>
                  </tr>
                  <tr>
                    <th scope="row">Средняя регулярность</th>
                    <td>{formatPercent(active.data.averageAdherencePercent)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Средняя длительность занятия</th>
                    <td>{Math.round(active.data.averageSessionDuration / 60)} мин</td>
                  </tr>
                  <tr>
                    <th scope="row">Средняя длительность выдоха</th>
                    <td>{formatSeconds(active.data.averageBreathDuration)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Стабильность</th>
                    <td>{formatPercent(active.data.averageStability)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Выдохов всего</th>
                    <td>{active.data.totalBreaths}</td>
                  </tr>
                  <tr>
                    <th scope="row">Динамика</th>
                    <td>
                      {formatTrendContext({
                        trendPercent: active.data.trendPercent,
                        previousPercent: active.data.trendPreviousPercent,
                        currentPercent: active.data.trendCurrentPercent,
                        hasCurrentData: active.data.trendHasCurrentData,
                        currentWeekIsPartial: active.data.trendWeekIsPartial,
                      })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <BarSeriesChart
              ariaLabel="Занятия по неделям внутри отчётного периода"
              points={active.data.weekly.map((point) => ({
                label: point.label,
                value: point.sessions,
                target: point.target,
              }))}
            />
          </>
        )}

        <ValidationNote>
          Показатели длительности и стабильности выдоха рассчитаны по звуковым признакам и требуют
          валидации специалистом. Отчёт не является медицинским заключением.
        </ValidationNote>
      </Panel>

      <Panel title="История отчётов" subtitle="Сохранённые срезы данных">
        {reports && reports.length === 0 && <EmptyState title="История пуста" />}
        {reports && reports.length > 0 && (
          <ul className="sp-history">
            {reports.map((report) => (
              <li key={report.id}>
                <button
                  type="button"
                  className={report.id === active?.id ? 'is-active' : ''}
                  onClick={() => setActive(report)}
                >
                  <b>
                    {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}
                  </b>
                  <small>
                    {report.data.sessions} занятий · регулярность{' '}
                    {formatPercent(report.data.averageAdherencePercent)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
