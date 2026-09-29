import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import type { UpdatePatientInput } from '../../types';
import { ErrorBanner } from './ui';

interface EditPatientDialogProps {
  patient: UpdatePatientInput;
  patientId: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  startConfirmingDelete?: boolean;
}

/** Редактирование профиля и подтверждение мягкого удаления пациента. */
export function EditPatientDialog({
  patient,
  patientId,
  onClose,
  onSaved,
  onDeleted,
  startConfirmingDelete = false,
}: EditPatientDialogProps) {
  const [form, setForm] = useState<UpdatePatientInput>(patient);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(startConfirmingDelete);

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await api.v1.updatePatient(patientId, form);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить профиль');
    } finally {
      setPending(false);
    }
  };

  const remove = async (): Promise<void> => {
    setError('');
    setPending(true);
    try {
      await api.v1.deletePatient(patientId);
      onDeleted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось удалить пациента');
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="sp-modal"
      role="dialog"
      aria-modal="true"
      aria-label={confirmingDelete ? 'Удаление пациента' : 'Редактирование пациента'}
    >
      <div className="sp-modal__backdrop" onClick={pending ? undefined : onClose} />
      <div className="sp-modal__card">
        <header>
          <h2>{confirmingDelete ? 'Удалить пациента?' : 'Редактировать профиль'}</h2>
          <button type="button" onClick={onClose} disabled={pending} aria-label="Закрыть">
            <X size={18} aria-hidden />
          </button>
        </header>

        {confirmingDelete ? (
          <div className="sp-modal__body sp-form">
            {error && <ErrorBanner message={error} />}
            <p>Данные сессий сохранятся в архиве.</p>
            <div className="sp-modal__actions">
              <button type="button" className="sp-button" disabled={pending} onClick={() => setConfirmingDelete(false)}>
                Отмена
              </button>
              <button type="button" className="sp-button sp-button--danger" disabled={pending} onClick={() => void remove()}>
                {pending ? 'Удаляем…' : 'Удалить'}
              </button>
            </div>
          </div>
        ) : (
          <form className="sp-form sp-modal__body" onSubmit={(event) => void save(event)}>
            {error && <ErrorBanner message={error} />}
            <label className="sp-field">
              <span>Псевдоним</span>
              <div className="sp-field__control">
                <input
                  required
                  minLength={1}
                  maxLength={50}
                  value={form.pseudonym}
                  onChange={(event) => setForm({ ...form, pseudonym: event.target.value })}
                />
              </div>
            </label>

            <div className="sp-field-row">
              <label className="sp-field">
                <span>Возраст</span>
                <div className="sp-field__control">
                  <input
                    type="number"
                    min={5}
                    max={12}
                    step={1}
                    required
                    value={form.age}
                    onChange={(event) => setForm({ ...form, age: Number(event.target.value) })}
                  />
                </div>
              </label>

              <label className="sp-field">
                <span>Пол</span>
                <div className="sp-field__control">
                  <select
                    value={form.gender}
                    onChange={(event) =>
                      setForm({ ...form, gender: event.target.value as UpdatePatientInput['gender'] })
                    }
                  >
                    <option value="unspecified">Не указан</option>
                    <option value="male">Мальчик</option>
                    <option value="female">Девочка</option>
                  </select>
                </div>
              </label>
            </div>

            <section className="sp-danger-zone" aria-label="Удаление пациента">
              <b>Удаление пациента</b>
              <p>Профиль исчезнет из активного списка, а сессии останутся в архиве.</p>
              <button type="button" className="sp-button sp-button--danger" onClick={() => setConfirmingDelete(true)}>
                Удалить пациента
              </button>
            </section>

            <div className="sp-modal__actions">
              <button type="button" className="sp-button" disabled={pending} onClick={onClose}>
                Отмена
              </button>
              <button type="submit" className="sp-button sp-button--primary" disabled={pending}>
                {pending ? 'Сохраняем…' : 'Сохранить'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
