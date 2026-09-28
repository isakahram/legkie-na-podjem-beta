import { Download, FileText, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import type { PatientV1DetailDto, SessionRecord, SessionsQuery } from '../../../types';
import {
  EmptyState,
  ErrorBanner,
  Pagination,
  Panel,
  Spinner,
  StatusPill,
  ValidationNote,
} from '../../components/ui';
import { downloadTextFile, sessionsToCsv } from '../../lib/csv';
import { formatDateTime, formatDuration, formatPercent, formatSeconds } from '../../lib/format';

const emptyFilters = { from: '', to: '', minDurationSeconds: '', minBreaths: '' };

export function SessionsTab({ patientId, detail }: { patientId: string; detail: PatientV1DetailDto }) {
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: SessionRecord[]; total: number; page: number; pageSize: number } | null>(
    null,
  );
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SessionRecord | null>(null);

  const load = useCallback(() => {
    const query: SessionsQuery = { page, pageSize: 15 };
    if (filters.from) query.from = new Date(`${filters.from}T00:00:00`).toISOString();
    if (filters.to) query.to = new Date(`${filters.to}T23:59:59`).toISOString();
    if (filters.minDurationSeconds) query.minDurationSeconds = Number(filters.minDurationSeconds);
    if (filters.minBreaths) query.minBreaths = Number(filters.minBreaths);

    return api.v1
      .listPatientSessions(patientId, query)
      .then((response) => {
        setData(response);
        setError('');
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить занятия'),
      );
  }, [filters, page, patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = async (): Promise<void> => {
    const all = await api.v1.listPatientSessions(patientId, { pageSize: 200 });
    downloadTextFile(
      `sessions-${detail.patient.pseudonym.replace(/\s+/g, '-')}.csv`,
      sessionsToCsv(all.items, detail.patient.pseudonym),
    );
  };

  return (
    <div className="sp-stack">
      <Panel
        title="Журнал занятий"
        subtitle="Каждая строка — одно занятие ребёнка"
        actions={
          <div className="sp-toolbar">
            <button type="button" className="sp-button" onClick={() => void exportCsv()}>
              <Download size={16} aria-hidden /> Экспорт CSV
            </button>
            <button type="button" className="sp-button" disabled title="Полный отчёт появится в следующем обновлении">
              <FileText size={16} aria-hidden /> Экспорт PDF
            </button>
          </div>
        }
      >
        <div className="sp-filters">
          <label className="sp-select">
            <span>С даты</span>
            <input
              type="date"
              value={filters.from}
              onChange={(event) => {
                setPage(1);
                setFilters({ ...filters, from: event.target.value });
              }}
            />
          </label>
          <label className="sp-select">
            <span>По дату</span>
            <input
              type="date"
              value={filters.to}
              onChange={(event) => {
                setPage(1);
                setFilters({ ...filters, to: event.target.value });
              }}
            />
          </label>
          <label className="sp-select">
            <span>Длительность от, с</span>
            <input
              type="number"
              min={0}
              step={30}
              value={filters.minDurationSeconds}
              onChange={(event) => {
                setPage(1);
                setFilters({ ...filters, minDurationSeconds: event.target.value });
              }}
            />
          </label>
          <label className="sp-select">
            <span>Выдохов от</span>
            <input
              type="number"
              min={0}
              value={filters.minBreaths}
              onChange={(event) => {
                setPage(1);
                setFilters({ ...filters, minBreaths: event.target.value });
              }}
            />
          </label>
          <button type="button" className="sp-button" onClick={() => setFilters(emptyFilters)}>
            Сбросить
          </button>
        </div>

        {error && <ErrorBanner message={error} />}
        {!data && !error && <Spinner label="Загружаем журнал…" />}
        {data && data.items.length === 0 && <EmptyState title="Занятий по фильтру нет" />}

        {data && data.items.length > 0 && (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th scope="col">Дата и время</th>
                  <th scope="col">Длительность</th>
                  <th scope="col">Выдохи</th>
                  <th scope="col">Средний выдох</th>
                  <th scope="col">Стабильность</th>
                  <th scope="col">Монеты</th>
                  <th scope="col" aria-label="Подробнее" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((session) => (
                  <tr key={session.id}>
                    <td>{formatDateTime(session.startedAt)}</td>
                    <td>{formatDuration(session.durationSeconds)}</td>
                    <td>
                      {session.completedBreaths ?? 0}/{session.targetBreaths ?? '—'}
                    </td>
                    <td>{formatSeconds(session.averageBreathDuration)}</td>
                    <td>{formatPercent(session.averageStability)}</td>
                    <td>{session.coinsCollected}</td>
                    <td>
                      <button type="button" className="sp-link" onClick={() => setSelected(session)}>
                        Подробнее
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        )}
        <ValidationNote />
      </Panel>

      {selected && <SessionDetails session={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function SessionDetails({ session, onClose }: { session: SessionRecord; onClose: () => void }) {
  return (
    <div className="sp-modal" role="dialog" aria-modal="true" aria-label="Агрегаты занятия">
      <div className="sp-modal__backdrop" onClick={onClose} />
      <div className="sp-modal__card">
        <header>
          <h2>Занятие {formatDateTime(session.startedAt)}</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <X size={18} aria-hidden />
          </button>
        </header>
        <div className="sp-modal__body">
          <dl className="sp-defs">
            <div>
              <dt>Длительность</dt>
              <dd>{formatDuration(session.durationSeconds)}</dd>
            </div>
            <div>
              <dt>Выдохов выполнено</dt>
              <dd>
                {session.completedBreaths ?? 0} из {session.targetBreaths ?? '—'}
              </dd>
            </div>
            <div>
              <dt>Средняя длительность выдоха</dt>
              <dd>{formatSeconds(session.averageBreathDuration)}</dd>
            </div>
            <div>
              <dt>Лучший выдох</dt>
              <dd>{formatSeconds(session.bestDuration ?? null)}</dd>
            </div>
            <div>
              <dt>Стабильность</dt>
              <dd>{formatPercent(session.averageStability)}</dd>
            </div>
            <div>
              <dt>Технические паузы</dt>
              <dd>{session.technicalPauses}</dd>
            </div>
            <div>
              <dt>Монеты</dt>
              <dd>{session.coinsCollected}</dd>
            </div>
            <div>
              <dt>Статус</dt>
              <dd>
                <StatusPill tone={session.status === 'completed' ? 'positive' : 'warning'}>
                  {session.status === 'completed' ? 'завершено' : 'прервано'}
                </StatusPill>
              </dd>
            </div>
          </dl>
          <ValidationNote />
        </div>
      </div>
    </div>
  );
}
