import { ArrowLeft, MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import type { AssignmentVersionDto, PatientV1DetailDto } from '../../types';
import { EditPatientDialog } from '../components/EditPatientDialog';
import { AttentionBadge, ErrorBanner, Spinner, StatusPill } from '../components/ui';
import { useSpecialistAuth } from '../AuthContext';
import { GENDER_LABELS, formatAge, formatDate } from '../lib/format';
import { AssignmentsTab } from './patient/AssignmentsTab';
import { ChartsTab } from './patient/ChartsTab';
import { OverviewTab } from './patient/OverviewTab';
import { ReportsTab } from './patient/ReportsTab';
import { SessionsTab } from './patient/SessionsTab';

const TABS = [
  { slug: '', label: 'Обзор' },
  { slug: 'charts', label: 'Графики' },
  { slug: 'sessions', label: 'Сессии' },
  { slug: 'reports', label: 'Отчёты' },
  { slug: 'assignments', label: 'Назначения' },
];

const activeAssignment = (assignments: AssignmentVersionDto[]): AssignmentVersionDto | null =>
  assignments.find((assignment) => assignment.valid_until === null) ?? assignments[0] ?? null;

export function PatientDetailPage() {
  const { id = '', tab } = useParams();
  const navigate = useNavigate();
  const { canMutate } = useSpecialistAuth();
  const [detail, setDetail] = useState<PatientV1DetailDto | null>(null);
  const [error, setError] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmRequested, setDeleteConfirmRequested] = useState(false);

  const load = useCallback(() => {
    return api.v1
      .getPatient(id)
      .then((response) => {
        setDetail(response);
        setError('');
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Не удалось открыть карточку'),
      );
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="sp-page">
        <ErrorBanner message={error} />
        <Link to="/specialist/patients" className="sp-button">
          <ArrowLeft size={16} aria-hidden /> К списку пациентов
        </Link>
      </div>
    );
  }

  if (!detail) return <Spinner label="Открываем карточку…" />;

  const { patient } = detail;
  const assignment = activeAssignment(detail.assignments);
  const current = tab ?? '';

  return (
    <div className="sp-page sp-fade">
      <Link to="/specialist/patients" className="sp-back">
        <ArrowLeft size={16} aria-hidden /> Все пациенты
      </Link>

      <header className="sp-patient-hero">
        <span className="sp-avatar sp-avatar--lg" aria-hidden>
          {patient.avatar}
        </span>
        <div className="sp-patient-hero__body">
          <h1>{patient.pseudonym}</h1>
          <p>
            {formatAge(patient.age)} · {GENDER_LABELS[patient.gender ?? 'unspecified']} · код{' '}
            <code>{patient.code}</code>
          </p>
          <div className="sp-patient-hero__pills">
            {patient.attention.needsAttention ? (
              <AttentionBadge reasons={patient.attention.reasons} />
            ) : (
              <StatusPill tone="positive">Занимается по плану</StatusPill>
            )}
            <StatusPill>
              Назначение с {formatDate(assignment?.valid_from ?? patient.assignment.validFrom)}
            </StatusPill>
          </div>
        </div>
        <div className="sp-patient-hero__assignment">
          <small>Активное назначение</small>
          <b>{patient.assignment.targetBreaths} выдохов за занятие</b>
          <span>
            {patient.assignment.sessionsPerWeek} занятия в неделю · выдох от{' '}
            {patient.assignment.minCompletedBreathSeconds} с
          </span>
        </div>
        {canMutate && (
          <div className="sp-patient-actions">
            <button
              type="button"
              className="sp-patient-actions__trigger"
              aria-label="Действия с пациентом"
              aria-expanded={actionsOpen}
              onClick={() => setActionsOpen((open) => !open)}
            >
              <MoreHorizontal size={20} aria-hidden />
            </button>
            {actionsOpen && (
              <div className="sp-patient-actions__menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false);
                    setDeleteConfirmRequested(false);
                    setEditOpen(true);
                  }}
                >
                  Редактировать профиль
                </button>
                <Link role="menuitem" to={`/specialist/patients/${id}/assignments`} onClick={() => setActionsOpen(false)}>
                  Изменить назначение
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="sp-patient-actions__delete"
                  onClick={() => {
                    setActionsOpen(false);
                    setDeleteConfirmRequested(true);
                    setEditOpen(true);
                  }}
                >
                  Удалить пациента
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      <nav className="sp-tabs" aria-label="Разделы карточки">
        {TABS.map((item) => (
          <NavLink
            key={item.slug || 'overview'}
            end={item.slug === ''}
            to={item.slug ? `/specialist/patients/${id}/${item.slug}` : `/specialist/patients/${id}`}
            className={({ isActive }) => (isActive ? 'is-active' : '')}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sp-tab-body sp-fade" key={current}>
        {current === '' && <OverviewTab detail={detail} />}
        {current === 'charts' && <ChartsTab patientId={id} detail={detail} />}
        {current === 'sessions' && <SessionsTab patientId={id} detail={detail} />}
        {current === 'reports' && <ReportsTab patientId={id} detail={detail} />}
        {current === 'assignments' && <AssignmentsTab patientId={id} detail={detail} onChanged={load} />}
      </div>

      {editOpen && (
        <EditPatientDialog
          patientId={id}
          patient={{
            pseudonym: patient.pseudonym,
            age: patient.age,
            gender: patient.gender === 'female' || patient.gender === 'male' ? patient.gender : 'unspecified',
          }}
          startConfirmingDelete={deleteConfirmRequested}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            void load();
          }}
          onDeleted={() => navigate('/specialist/patients', { state: { notice: 'Пациент удалён' } })}
        />
      )}
    </div>
  );
}
