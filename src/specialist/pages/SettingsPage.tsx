import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useSpecialistAuth } from '../AuthContext';
import type {
  AssignmentDefaults,
  AuthSessionDto,
  NotificationPrefs,
  SpecialistProfileDto,
  SpecialistSettingsDto,
} from '../../types';
import { ErrorBanner, Panel, Spinner, StatusPill, ValidationNote } from '../components/ui';
import { downloadTextFile } from '../lib/csv';
import { formatDateTime } from '../lib/format';

type Saved = '' | 'profile' | 'notifications' | 'defaults' | 'password' | 'sessions';

/** Настройки кабинета: профиль, безопасность, уведомления, назначения, данные. */
export function SettingsPage() {
  const { user, canMutate, refresh } = useSpecialistAuth();
  const [settings, setSettings] = useState<SpecialistSettingsDto | null>(null);
  const [sessions, setSessions] = useState<AuthSessionDto[]>([]);
  const [profile, setProfile] = useState<SpecialistProfileDto | null>(null);
  const [notifications, setNotifications] = useState<NotificationPrefs | null>(null);
  const [defaults, setDefaults] = useState<AssignmentDefaults | null>(null);
  const [passwords, setPasswords] = useState({ current: '', next: '', repeat: '' });
  const [saved, setSaved] = useState<Saved>('');
  const [error, setError] = useState('');

  const loadSessions = (): Promise<void> =>
    api.v1
      .listAuthSessions()
      .then(setSessions)
      .catch(() => setSessions([]));

  useEffect(() => {
    void api.v1
      .getSettings()
      .then((data) => {
        setSettings(data);
        setProfile(data.profile);
        setNotifications(data.notifications);
        setDefaults(data.assignmentDefaults);
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить настройки'),
      );
    void loadSessions();
  }, []);

  const guard = async (key: Saved, action: () => Promise<unknown>): Promise<void> => {
    setError('');
    try {
      await action();
      setSaved(key);
      window.setTimeout(() => setSaved(''), 2500);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить изменения');
    }
  };

  const changePassword = async (): Promise<void> => {
    if (passwords.next !== passwords.repeat) {
      setError('Новый пароль и подтверждение не совпадают');
      return;
    }
    await guard('password', async () => {
      await api.v1.changePassword({ oldPassword: passwords.current, newPassword: passwords.next });
      setPasswords({ current: '', next: '', repeat: '' });
      await loadSessions();
    });
  };

  const exportData = async (): Promise<void> => {
    const payload = await api.v1.exportData();
    downloadTextFile('legkie-export.json', JSON.stringify(payload, null, 2), 'application/json');
  };

  if (!settings || !profile || !notifications || !defaults) {
    return <div className="sp-page sp-fade">{error ? <ErrorBanner message={error} /> : <Spinner />}</div>;
  }

  return (
    <div className="sp-page sp-fade">
      <header className="sp-page__head">
        <div>
          <h1>Настройки</h1>
          <p>Профиль, безопасность, уведомления и параметры назначений по умолчанию.</p>
        </div>
      </header>

      {error ? <ErrorBanner message={error} /> : null}
      {!canMutate ? (
        <Panel>
          <p className="sp-muted">В режиме просмотра настройки доступны только для чтения.</p>
        </Panel>
      ) : null}

      <div className="sp-settings-grid">
        <Panel title="Профиль" subtitle={user?.email}>
          <form
            className="sp-form"
            onSubmit={(event) => {
              event.preventDefault();
              void guard('profile', async () => {
                await api.v1.updateProfile(profile);
                await refresh();
              });
            }}
          >
            <label>
              <span>Имя и фамилия</span>
              <input
                type="text"
                value={profile.displayName ?? ''}
                disabled={!canMutate}
                onChange={(event) => setProfile({ ...profile, displayName: event.target.value })}
              />
            </label>
            <label>
              <span>Клиника</span>
              <input
                type="text"
                value={profile.clinicName ?? ''}
                disabled={!canMutate}
                onChange={(event) => setProfile({ ...profile, clinicName: event.target.value })}
              />
            </label>
            <label>
              <span>Контактная почта</span>
              <input
                type="email"
                value={profile.contactEmail ?? ''}
                disabled={!canMutate}
                onChange={(event) => setProfile({ ...profile, contactEmail: event.target.value })}
              />
            </label>
            <label>
              <span>Телефон</span>
              <input
                type="tel"
                value={profile.contactPhone ?? ''}
                disabled={!canMutate}
                onChange={(event) => setProfile({ ...profile, contactPhone: event.target.value })}
              />
            </label>
            {canMutate ? (
              <div className="sp-form__actions">
                <button type="submit" className="sp-button sp-button--primary">
                  Сохранить профиль
                </button>
                {saved === 'profile' ? <span className="sp-saved">Сохранено</span> : null}
              </div>
            ) : null}
          </form>
        </Panel>

        <Panel title="Безопасность" subtitle="Пароль и активные входы">
          {canMutate ? (
            <form
              className="sp-form"
              onSubmit={(event) => {
                event.preventDefault();
                void changePassword();
              }}
            >
              <label>
                <span>Текущий пароль</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={passwords.current}
                  onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
                />
              </label>
              <label>
                <span>Новый пароль</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.next}
                  onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
                />
              </label>
              <label>
                <span>Повторите новый пароль</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwords.repeat}
                  onChange={(event) => setPasswords({ ...passwords, repeat: event.target.value })}
                />
              </label>
              <div className="sp-form__actions">
                <button type="submit" className="sp-button sp-button--primary">
                  Сменить пароль
                </button>
                {saved === 'password' ? <span className="sp-saved">Пароль обновлён</span> : null}
              </div>
            </form>
          ) : null}

          <h3>Активные входы</h3>
          {sessions.length === 0 ? (
            <p className="sp-muted">Активных входов не найдено.</p>
          ) : (
            sessions.map((item) => (
              <div className="sp-session-row" key={item.id}>
                <div>
                  <strong>{item.userAgent ?? 'Неизвестное устройство'}</strong>
                  <small>
                    Вход {formatDateTime(item.createdAt)} · активность {formatDateTime(item.lastActiveAt)}
                    {item.ip ? ` · ${item.ip}` : ''}
                  </small>
                </div>
                {item.current ? (
                  <StatusPill tone="positive">Текущий</StatusPill>
                ) : canMutate ? (
                  <button
                    type="button"
                    className="sp-button"
                    onClick={() =>
                      void guard('sessions', async () => {
                        await api.v1.revokeAuthSession(item.id);
                        await loadSessions();
                      })
                    }
                  >
                    Завершить
                  </button>
                ) : null}
              </div>
            ))
          )}
          {canMutate ? (
            <div className="sp-form__actions">
              <button
                type="button"
                className="sp-button"
                onClick={() =>
                  void guard('sessions', async () => {
                    await api.v1.revokeAllAuthSessions();
                    window.location.assign('/login');
                  })
                }
              >
                Выйти на всех устройствах
              </button>
            </div>
          ) : null}
        </Panel>

        <Panel title="Уведомления" subtitle="Когда сообщать о риске пропусков">
          <form
            className="sp-form"
            onSubmit={(event) => {
              event.preventDefault();
              void guard('notifications', () => api.v1.updateNotifications(notifications));
            }}
          >
            <label className="sp-check">
              <input
                type="checkbox"
                checked={notifications.emailAlerts}
                disabled={!canMutate}
                onChange={(event) => setNotifications({ ...notifications, emailAlerts: event.target.checked })}
              />
              <span>Письма о детях, которые требуют внимания</span>
            </label>
            <label className="sp-check">
              <input
                type="checkbox"
                checked={notifications.weeklyReport}
                disabled={!canMutate}
                onChange={(event) => setNotifications({ ...notifications, weeklyReport: event.target.checked })}
              />
              <span>Еженедельная сводка по всем детям</span>
            </label>
            <label>
              <span>Считать пропуском после, дней</span>
              <input
                type="number"
                min={1}
                max={30}
                value={notifications.missedDaysThreshold}
                disabled={!canMutate}
                onChange={(event) =>
                  setNotifications({ ...notifications, missedDaysThreshold: Number(event.target.value) })
                }
              />
            </label>
            <label>
              <span>Порог ухудшения динамики, %</span>
              <input
                type="number"
                min={-100}
                max={0}
                value={notifications.declineTrendPercent}
                disabled={!canMutate}
                onChange={(event) =>
                  setNotifications({ ...notifications, declineTrendPercent: Number(event.target.value) })
                }
              />
            </label>
            {canMutate ? (
              <div className="sp-form__actions">
                <button type="submit" className="sp-button sp-button--primary">
                  Сохранить уведомления
                </button>
                {saved === 'notifications' ? <span className="sp-saved">Сохранено</span> : null}
              </div>
            ) : null}
          </form>
        </Panel>

        <Panel title="Назначения по умолчанию" subtitle="Подставляются при добавлении ребёнка">
          <form
            className="sp-form"
            onSubmit={(event) => {
              event.preventDefault();
              void guard('defaults', () => api.v1.updateAssignmentDefaults(defaults));
            }}
          >
            <label>
              <span>Занятий в неделю</span>
              <input
                type="number"
                min={1}
                max={7}
                value={defaults.sessionsPerWeek}
                disabled={!canMutate}
                onChange={(event) => setDefaults({ ...defaults, sessionsPerWeek: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>Выдохов за занятие</span>
              <input
                type="number"
                min={4}
                max={30}
                value={defaults.targetBreaths}
                disabled={!canMutate}
                onChange={(event) => setDefaults({ ...defaults, targetBreaths: Number(event.target.value) })}
              />
            </label>
            <label>
              <span>Минимальная длительность выдоха, сек</span>
              <input
                type="number"
                step={0.1}
                min={0.5}
                max={10}
                value={defaults.minCompletedBreathSeconds}
                disabled={!canMutate}
                onChange={(event) =>
                  setDefaults({ ...defaults, minCompletedBreathSeconds: Number(event.target.value) })
                }
              />
            </label>
            {canMutate ? (
              <div className="sp-form__actions">
                <button type="submit" className="sp-button sp-button--primary">
                  Сохранить параметры
                </button>
                {saved === 'defaults' ? <span className="sp-saved">Сохранено</span> : null}
              </div>
            ) : null}
          </form>
        </Panel>

        <Panel title="Данные и приватность">
          <p>
            Кабинет хранит только агрегаты занятий: длительность, количество и стабильность выдохов, монеты. Запись
            голоса и сырое аудио не сохраняются и не передаются на сервер.
          </p>
          <p className="sp-muted">
            Дети обозначены псевдонимами, персональные данные в кабинет не вносятся. Действия со сведениями о детях
            фиксируются в журнале аудита.
          </p>
          <div className="sp-form__actions">
            <button type="button" className="sp-button" onClick={() => void exportData()}>
              Выгрузить мои данные (JSON)
            </button>
          </div>
          <ValidationNote />
        </Panel>
      </div>
    </div>
  );
}
