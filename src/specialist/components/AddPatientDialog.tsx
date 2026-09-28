import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import type { CreatePatientInput } from '../../types';
import { ErrorBanner } from './ui';

/**
 * Создание пациента: псевдоним, возраст, пол.
 * Код доступа к игре генерирует сервер — специалист его сразу видит.
 */
export function AddPatientDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<CreatePatientInput>({ pseudonym: '', age: 8, gender: 'unspecified' });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [createdCode, setCreatedCode] = useState('');

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const created = await api.v1.createPatient(form);
      setCreatedCode(created.code);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать профиль');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="sp-modal" role="dialog" aria-modal="true" aria-label="Добавление пациента">
      <div className="sp-modal__backdrop" onClick={onClose} />
      <div className="sp-modal__card">
        <header>
          <h2>{createdCode ? 'Профиль создан' : 'Новый пациент'}</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть">
            <X size={18} aria-hidden />
          </button>
        </header>

        {createdCode ? (
          <div className="sp-modal__body">
            <p>Передайте ребёнку код доступа к игре:</p>
            <p className="sp-code">{createdCode}</p>
            <button type="button" className="sp-button sp-button--primary" onClick={onCreated}>
              Готово
            </button>
          </div>
        ) : (
          <form className="sp-form sp-modal__body" onSubmit={submit}>
            {error && <ErrorBanner message={error} />}

            <label className="sp-field">
              <span>Псевдоним</span>
              <div className="sp-field__control">
                <input
                  required
                  minLength={2}
                  maxLength={60}
                  value={form.pseudonym}
                  placeholder="Например, Миша К."
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
                      setForm({ ...form, gender: event.target.value as CreatePatientInput['gender'] })
                    }
                  >
                    <option value="unspecified">Не указан</option>
                    <option value="male">Мальчик</option>
                    <option value="female">Девочка</option>
                  </select>
                </div>
              </label>
            </div>

            <p className="sp-hint">
              Указывайте псевдоним, а не настоящее имя: кабинет не хранит персональные данные ребёнка.
            </p>

            <div className="sp-modal__actions">
              <button type="button" className="sp-button" onClick={onClose}>
                Отмена
              </button>
              <button type="submit" className="sp-button sp-button--primary" disabled={pending}>
                {pending ? 'Создаём…' : 'Создать профиль'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
