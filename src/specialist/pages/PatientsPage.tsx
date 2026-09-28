import { ChevronRight, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import type {
  PatientListResponse,
  PatientsFilter,
  PatientsSort,
} from '../../types';
import { useSpecialistAuth } from '../AuthContext';
import { AddPatientDialog } from '../components/AddPatientDialog';
import {
  AttentionBadge,
  EmptyState,
  ErrorBanner,
  Pagination,
  Panel,
  SegmentedControl,
  Spinner,
  StatusPill,
} from '../components/ui';
import { useViewport } from '../hooks';
import { formatAge, formatDate, formatPercent } from '../lib/format';

const FILTERS: Array<{ value: PatientsFilter; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'active', label: 'Занимаются' },
  { value: 'missed', label: 'Пропуски' },
  { value: 'declining', label: 'Спад динамики' },
  { value: 'attention', label: 'Требуют внимания' },
];

const SORTS: Array<{ value: PatientsSort; label: string }> = [
  { value: 'lastSession', label: 'по последней сессии' },
  { value: 'adherence', label: 'по регулярности' },
  { value: 'age', label: 'по возрасту' },
  { value: 'pseudonym', label: 'по псевдониму' },
];

export function PatientsPage() {
  const { canMutate } = useSpecialistAuth();
  const viewport = useViewport();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<PatientsFilter>('all');
  const [sort, setSort] = useState<PatientsSort>('lastSession');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PatientListResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const canEdit = canMutate && viewport !== 'phone';

  const load = useCallback(() => {
    setLoading(true);
    return api.v1
      .listPatients({ search, filter, sort, page, pageSize: 10 })
      .then((response) => {
        setData(response);
        setError('');
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить список'),
      )
      .finally(() => setLoading(false));
  }, [filter, page, search, sort]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filter, search, sort]);

  return (
    <div className="sp-page sp-fade">
      <div className="sp-page__head">
        <div>
          <h1>Пациенты</h1>
          <p>Регулярность, назначения и статус каждого ребёнка.</p>
        </div>
        {canEdit && (
          <button type="button" className="sp-button sp-button--primary" onClick={() => setDialogOpen(true)}>
            <Plus size={18} aria-hidden /> Добавить пациента
          </button>
        )}
      </div>

      <Panel
        actions={
          <div className="sp-toolbar">
            <label className="sp-search">
              <Search size={16} aria-hidden />
              <input
                type="search"
                value={search}
                placeholder="Поиск по псевдониму"
                aria-label="Поиск по псевдониму"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="sp-select">
              <span>Сортировка</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as PatientsSort)}>
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      >
        <SegmentedControl ariaLabel="Фильтр пациентов" value={filter} options={FILTERS} onChange={setFilter} />

        {error && <ErrorBanner message={error} />}
        {loading && !data && <Spinner label="Загружаем пациентов…" />}

        {data && data.items.length === 0 && (
          <EmptyState title="Никто не подходит под фильтр" hint="Измените условия поиска." />
        )}

        {data && data.items.length > 0 && (
          <div className="sp-table-wrap">
            <table className="sp-table">
              <thead>
                <tr>
                  <th scope="col">Псевдоним</th>
                  <th scope="col">Возраст</th>
                  <th scope="col">Назначение</th>
                  <th scope="col">Последняя сессия</th>
                  <th scope="col">Регулярность</th>
                  <th scope="col">Статус</th>
                  <th scope="col" aria-label="Открыть карточку" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((patient) => (
                  <tr key={patient.id}>
                    <th scope="row">
                      <span className="sp-avatar sp-avatar--sm" aria-hidden>
                        {patient.avatar}
                      </span>
                      <span>
                        <b>{patient.pseudonym}</b>
                        <small>{patient.code}</small>
                      </span>
                    </th>
                    <td>{formatAge(patient.age)}</td>
                    <td>
                      {patient.assignment.targetBreaths} выдохов ·{' '}
                      {patient.assignment.sessionsPerWeek}/нед
                    </td>
                    <td>{formatDate(patient.summary.lastSessionAt)}</td>
                    <td>
                      <StatusPill
                        tone={
                          patient.summary.adherencePercent >= 80
                            ? 'positive'
                            : patient.summary.adherencePercent >= 50
                              ? 'neutral'
                              : 'warning'
                        }
                      >
                        {patient.summary.sessionsThisWeek}/{patient.summary.targetSessions} ·{' '}
                        {formatPercent(patient.summary.adherencePercent)}
                      </StatusPill>
                    </td>
                    <td>
                      {patient.attention.needsAttention ? (
                        <AttentionBadge reasons={patient.attention.reasons} />
                      ) : (
                        <StatusPill tone="positive">В графике</StatusPill>
                      )}
                    </td>
                    <td className="sp-table__go">
                      <Link
                        to={`/specialist/patients/${patient.id}`}
                        aria-label={`Открыть карточку: ${patient.pseudonym}`}
                      >
                        <ChevronRight size={18} aria-hidden />
                      </Link>
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
      </Panel>

      {dialogOpen && (
        <AddPatientDialog
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            setDialogOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
