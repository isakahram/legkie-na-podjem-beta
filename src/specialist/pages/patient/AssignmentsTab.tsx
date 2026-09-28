import { CheckCircle2, History, Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../../../api';
import type { AssignmentVersionDto, CreateAssignmentInput, PatientV1DetailDto } from '../../../types';
import { useSpecialistAuth } from '../../AuthContext';
import { ErrorBanner, Panel, StatusPill } from '../../components/ui';
import { useViewport } from '../../hooks';
import { formatDate } from '../../lib/format';

const toForm = (assignment: AssignmentVersionDto | null, fallbackTargetBreaths: number): CreateAssignmentInput => ({
  sessionsPerWeek: assignment?.sessions_per_week ?? 3,
  targetBreaths: assignment?.target_breaths ?? fallbackTargetBreaths,
  minCompletedBreathSeconds: assignment?.min_completed_breath_seconds ?? 1.5,
  targetBreathDurationMin: assignment?.target_breath_duration_min ?? 2,
  targetBreathDurationMax: assignment?.target_breath_duration_max ?? 4,
  note: '',
});

export function AssignmentsTab({
  patientId,
  detail,
  onChanged,
}: {
  patientId: string;
  detail: PatientV1DetailDto;
  onChanged: () => Promise<void> | void;
}) {
  const { canMutate } = useSpecialistAuth();
  const viewport = useViewport();
  const canEdit = canMutate && viewport !== 'phone';

  const active = detail.assignments.find((item) => item.valid_until === null) ?? null;
  const [form, setForm] = useState<CreateAssignmentInput>(() =>
    toForm(active, detail.patient.assignment.targetBreaths),
  );
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await api.v1.createAssignment(patientId, form);
      setEditing(false);
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить назначение');
    } finally {
      setPending(false);
    }
  };

  const close = async (): Promise<void> => {
    if (!active) return;
    setPending(true);
    setError('');
    try {
      await api.v1.closeAssignment(patientId, active.id);
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось завершить назначение');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="sp-stack">
      <Panel
        title="Активное назначение"
        subtitle="Редактирование создаёт новую версию, история сохраняется"
        actions={
          canEdit && (
            <div className="sp-toolbar">
              <button type="button" className="sp-button" onClick={() => setEditing((value) => !value)}>
                <Pencil size={16} aria-hidden /> {editing ? 'Отмена' : 'Изменить'}
              </button>
              {active && (
                <button type="button" className="sp-button" onClick={() => void close()} disabled={pending}>
                  <CheckCircle2 size={16} aria-hidden /> Завершить
                </button>
              )}
            </div>
          )
        }
      >
        {error && <ErrorBanner message={error} />}

        {!editing && (
          <dl className="sp-defs">
            <div>
              <dt>Занятий в неделю</dt>
              <dd>{active?.sessions_per_week ?? '—'}</dd>
            </div>
            <div>
              <dt>Выдохов за занятие</dt>
              <dd>{active?.target_breaths ?? '—'}</dd>
            </div>
            <div>
              <dt>Минимальный засчитываемый выдох</dt>
              <dd>{active?.min_completed_breath_seconds ?? '—'} с</dd>
            </div>
            <div>
              <dt>Целевая длительность выдоха</dt>
              <dd>
                {active?.target_breath_duration_min ?? '—'}–{active?.target_breath_duration_max ?? '—'} с
              </dd>
            </div>
            <div>
              <dt>Действует с</dt>
              <dd>{active ? formatDate(active.valid_from) : '—'}</dd>
            </div>
            <div>
              <dt>Комментарий</dt>
              <dd>{active?.note ?? '—'}</dd>
            </div>
          </dl>
        )}

        {editing && (
          <form className="sp-form" onSubmit={submit}>
            <div className="sp-field-row">
              <label className="sp-field">
                <span>Занятий в неделю</span>
                <div className="sp-field__control">
                  <input
                    type="number"
                    min={1}
                    max={7}
                    required
                    value={form.sessionsPerWeek}
                    onChange={(event) => setForm({ ...form, sessionsPerWeek: Number(event.target.value) })}
                  />
                </div>
              </label>
              <label className="sp-field">
                <span>Выдохов за занятие</span>
                <div className="sp-field__control">
                  <input
                    type="number"
                    min={4}
                    max={30}
                    required
                    value={form.targetBreaths}
                    onChange={(event) => setForm({ ...form, targetBreaths: Number(event.target.value) })}
                  />
                </div>
              </label>
            </div>

            <div className="sp-field-row">
              <label className="sp-field">
                <span>Минимальный выдох, с</span>
                <div className="sp-field__control">
                  <input
                    type="number"
                    step={0.1}
                    min={0.5}
                    max={10}
                    required
                    value={form.minCompletedBreathSeconds}
                    onChange={(event) =>
                      setForm({ ...form, minCompletedBreathSeconds: Number(event.target.value) })
                    }
                  />
                </div>
              </label>
              <label className="sp-field">
                <span>Целевой выдох от, с</span>
                <div className="sp-field__control">
                  <input
                    type="number"
                    step={0.1}
                    min={0.5}
                    max={15}
                    value={form.targetBreathDurationMin ?? ''}
                    onChange={(event) =>
                      setForm({ ...form, targetBreathDurationMin: Number(event.target.value) })
                    }
                  />
                </div>
              </label>
              <label className="sp-field">
                <span>до, с</span>
                <div className="sp-field__control">
                  <input
                    type="number"
                    step={0.1}
                    min={0.5}
                    max={20}
                    value={form.targetBreathDurationMax ?? ''}
                    onChange={(event) =>
                      setForm({ ...form, targetBreathDurationMax: Number(event.target.value) })
                    }
                  />
                </div>
              </label>
            </div>

            <label className="sp-field">
              <span>Комментарий</span>
              <div className="sp-field__control">
                <input
                  maxLength={500}
                  value={form.note ?? ''}
                  placeholder="Например: увеличили нагрузку после контрольного визита"
                  onChange={(event) => setForm({ ...form, note: event.target.value })}
                />
              </div>
            </label>

            <div className="sp-modal__actions">
              <button type="submit" className="sp-button sp-button--primary" disabled={pending}>
                {pending ? 'Сохраняем…' : 'Сохранить новую версию'}
              </button>
            </div>
          </form>
        )}
      </Panel>

      <Panel title="История версий" subtitle="Кто и когда менял назначение">
        <div className="sp-table-wrap">
          <table className="sp-table">
            <thead>
              <tr>
                <th scope="col">Период действия</th>
                <th scope="col">Занятий/нед</th>
                <th scope="col">Выдохов</th>
                <th scope="col">Мин. выдох</th>
                <th scope="col">Комментарий</th>
                <th scope="col">Статус</th>
              </tr>
            </thead>
            <tbody>
              {detail.assignments.map((assignment) => (
                <tr key={assignment.id}>
                  <td>
                    <History size={14} aria-hidden /> {formatDate(assignment.valid_from)} —{' '}
                    {assignment.valid_until ? formatDate(assignment.valid_until) : 'сейчас'}
                  </td>
                  <td>{assignment.sessions_per_week}</td>
                  <td>{assignment.target_breaths}</td>
                  <td>{assignment.min_completed_breath_seconds} с</td>
                  <td>{assignment.note ?? '—'}</td>
                  <td>
                    {assignment.valid_until === null ? (
                      <StatusPill tone="positive">активно</StatusPill>
                    ) : (
                      <StatusPill>завершено</StatusPill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
