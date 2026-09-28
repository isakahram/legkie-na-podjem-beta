import { Download } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import type { PatientListItemDto, SessionRecord, SessionsQuery, SessionsResponse } from '../../types';
import { EmptyState, ErrorBanner, Pagination, Panel, Spinner, StatusPill, ValidationNote } from '../components/ui';
import { downloadTextFile, sessionsToCsv } from '../lib/csv';
import { formatDateTime, formatDuration, formatPercent, formatSeconds } from '../lib/format';

const emptyFilters = { patientId: '', from: '', to: '', minDurationSeconds: '', minBreaths: '' };

/** Глобальный журнал занятий по всем доступным специалисту детям. */
export function SessionsPage() {
  const [patients, setPatients] = useState<PatientListItemDto[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SessionsResponse | null>(null);
  const [error, setError] = useState('');

  const query = useMemo<SessionsQuery>(() => {
    const next: SessionsQuery = { page, pageSize: 20 };
    if (filters.patientId) next.patientId = filters.patientId;
    if (filters.from) next.from = new Date(`${filters.from}T00:00:00`).toISOString();
    if (filters.to) next.to = new Date(`${filters.to}T23:59:59`).toISOString();
    if (filters.minDurationSeconds) next.minDurationSeconds = Number(filters.minDurationSeconds);
    if (filters.minBreaths) next.minBreaths = Number(filters.minBreaths);
    return next;
  }, [filters, page]);

  useEffect(() => {
    void api.v1
      .listPatients({ pageSize: 200 })
      .then((response) => setPatients(response.items))
      .catch(() => setPatients([]));
  }, []);

  const load = useCallback(
    () =>
      api.v1
        .listSessions(query)
        .then((response) => {
          setData(response);
          setError('');
        })
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught.message : 'Не удалось загрузить занятия'),
        ),
    [query],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const update = (patch: Partial<typeof emptyFilters>): void => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const exportCsv = async (): Promise<void> => {
    const all = await api.v1.listSessions({ ...query, page: 1, pageSize: 500 });
    downloadTextFile('sessions.csv', sessionsToCsv(all.items));
  };

  return (
    <div className="sp-page sp-fade">
      <header className="sp-page__head">
        <div>
          <h1>Занятия</h1>
          <p>Все занятия детей, к которым у вас есть доступ.</p>
        </div>
        <button type="button" className="sp-button" onClick={() => void exportCsv()}>
          <Download size={16} aria-hidden="true" /> Выгрузить CSV
        </button>
      </header>

      {error ? <ErrorBanner message={error} /> : null}

      <Panel title="Фильтры">
        <div className="sp-filters">
          <label>
            <span>Ребёнок</span>
            <select className="sp-select" value={filters.patientId} onChange={(event) => update({ patientId: event.target.value })}>
              <option value="">Все дети</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.pseudonym}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>С даты</span>
            <input type="date" value={filters.from} onChange={(event) => update({ from: event.target.value })} />
          </label>
          <label>
            <span>По дату</span>
            <input type="date" value={filters.to} onChange={(event) => update({ to: event.target.value })} />
          </label>
          <label>
            <span>Длительность от, сек</span>
            <input
              type="number"
              min={0}
              value={filters.minDurationSeconds}
              onChange={(event) => update({ minDurationSeconds: event.target.value })}
            />
          </label>
          <label>
            <span>Выдохов от</span>
            <input
              type="number"
              min={0}
              value={filters.minBreaths}
              onChange={(event) => update({ minBreaths: event.target.value })}
            />
          </label>
          <button type="button" className="sp-button" onClick={() => setFilters(emptyFilters)}>
            Сбросить
          </button>
        </div>
      </Panel>

      <Panel title="Журнал занятий" subtitle={data ? `Найдено записей: ${data.total}` : undefined}>
        {!data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState title="Занятий не найдено" hint="Измените фильтры или подождите новые занятия." />
        ) : (
          <>
            <div className="sp-table-wrap">
              <table className="sp-table">
                <thead>
                  <tr>
                    <th scope="col">Дата и время</th>
                    <th scope="col">Ребёнок</th>
                    <th scope="col">Длительность</th>
                    <th scope="col">Выдохи</th>
                    <th scope="col">Стабильность</th>
                    <th scope="col">Монеты</th>
                    <th scope="col">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((session: SessionRecord) => (
                    <tr key={session.id}>
                      <td>{formatDateTime(session.startedAt)}</td>
                      <td>
                        <Link className="sp-link" to={`/specialist/patients/${session.childId}`}>
                          {session.childNickname}
                        </Link>
                      </td>
                      <td>{formatDuration(session.durationSeconds)}</td>
                      <td>
                        {session.completedBreaths} из {session.targetBreaths}
                        <small className="sp-muted"> · {formatSeconds(session.averageBreathDuration)}</small>
                      </td>
                      <td>{formatPercent(session.averageStability)}</td>
                      <td>{session.coinsCollected}</td>
                      <td>
                        <StatusPill tone={session.status === 'completed' ? 'positive' : 'neutral'}>
                          {session.status === 'completed' ? 'Завершено' : 'Прервано'}
                        </StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onChange={(next) => setPage(next)}
            />
          </>
        )}
        <ValidationNote />
      </Panel>
    </div>
  );
}
