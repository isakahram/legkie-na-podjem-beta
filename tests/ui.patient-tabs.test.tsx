// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api';
import { SpecialistAuthProvider } from '../src/specialist/AuthContext';
import { specialistRoutes } from '../src/specialist/routes';
import type {
  PatientAnalyticsDto,
  PatientV1DetailDto,
  SessionRecord,
  SessionsResponse,
  UserDto,
} from '../src/types';

const specialist: UserDto = {
  id: 'user-maria',
  email: 'maria@legkie.local',
  role: 'specialist',
  organizationId: 'org-demo',
  organizationName: 'Клиника',
  createdAt: '2026-02-01T00:00:00.000Z',
  lastLoginAt: null,
  displayName: 'Мария Сергеевна Орлова',
  clinicName: 'Детская клиника',
  contactEmail: null,
  contactPhone: null,
};

const session: SessionRecord = {
  id: 'sess-1',
  childId: 'p1',
  childNickname: 'Артём Л.',
  startedAt: '2026-09-29T14:00:00.000Z',
  durationSeconds: 540,
  breathCount: 8,
  averageStrength: 0.6,
  averageBreathDuration: 3.2,
  averageStability: 82,
  correctBreathPercent: 88,
  completedBreaths: 7,
  targetBreaths: 8,
  coinsCollected: 6,
  averageLatencyMs: 60,
  maxLatencyMs: 90,
  technicalPauses: 1,
  status: 'completed',
  inputMode: 'microphone',
};

const detail: PatientV1DetailDto = {
  patient: {
    id: 'p1',
    pseudonym: 'Артём Л.',
    code: 'ОБЛАКО6',
    age: 8,
    gender: 'male',
    avatar: 'АЛ',
    balance: 52,
    selectedSkin: 'ocean',
    createdAt: '2026-02-01T00:00:00.000Z',
    assignment: {
      sessionsPerWeek: 3,
      targetBreaths: 8,
      minCompletedBreathSeconds: 1.5,
      targetBreathDurationMin: 2,
      targetBreathDurationMax: 4,
      validFrom: '2026-02-01T00:00:00.000Z',
      note: 'Базовое назначение',
    },
    summary: {
      sessionsThisWeek: 2,
      targetSessions: 3,
      adherencePercent: 67,
      averageCorrectPercent: 88,
      averageBreathDuration: 3.2,
      averageStability: 82,
      averageSessionDuration: 560,
      breathCompletionPercent: 92,
      cycleCompletionPercent: 92,
      missedThisWeek: 1,
      lastSessionAt: '2026-09-29T14:00:00.000Z',
      trendPercent: 6,
    },
    attention: { needsAttention: false, reasons: [], daysSinceLastSession: 1 },
  },
  weekly: [
    {
      week: '2026-09-21',
      label: '21 сент.',
      sessions: 3,
      target: 3,
      averageCorrect: 88,
      averageDuration: 560,
      averageStability: 82,
      averageBreathDuration: 3.2,
      breaths: 21,
    },
  ],
  sessions: [session],
  assignments: [
    {
      id: 'assign-1',
      patient_id: 'p1',
      created_by_user_id: 'user-maria',
      sessions_per_week: 3,
      target_breaths: 8,
      min_completed_breath_seconds: 1.5,
      target_breath_duration_min: 2,
      target_breath_duration_max: 4,
      valid_from: '2026-02-01T00:00:00.000Z',
      valid_until: null,
      note: 'Базовое назначение',
      created_at: '2026-02-01T00:00:00.000Z',
    },
  ],
};

const analytics: PatientAnalyticsDto = {
  weekly: detail.weekly,
  planFact: [
    { week: '2026-09-21', label: '21 сент.', factSessions: 3, planSessions: 3, factBreaths: 21, planBreaths: 24 },
  ],
  comparison: {
    current: {
      from: '2026-09-21T00:00:00.000Z',
      to: '2026-10-04T00:00:00.000Z',
      sessions: 5,
      averageBreathDuration: 3.4,
      averageStability: 84,
      averageSessionDuration: 560,
      totalBreaths: 38,
      adherencePercent: 83,
    },
    previous: {
      from: '2026-09-07T00:00:00.000Z',
      to: '2026-09-20T00:00:00.000Z',
      sessions: 4,
      averageBreathDuration: 3,
      averageStability: 78,
      averageSessionDuration: 540,
      totalBreaths: 30,
      adherencePercent: 67,
    },
    delta: {
      sessions: 25,
      averageBreathDuration: 13,
      averageStability: 8,
      totalBreaths: 27,
      adherencePercent: 24,
    },
  },
};

const sessionsPage: SessionsResponse = { items: [session], total: 1, page: 1, pageSize: 15 };

const renderCard = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SpecialistAuthProvider>
        <Routes>{specialistRoutes}</Routes>
      </SpecialistAuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.spyOn(api.v1, 'me').mockResolvedValue({ user: specialist });
  vi.spyOn(api.v1, 'getPatient').mockResolvedValue(detail);
  vi.spyOn(api.v1, 'getPatientAnalytics').mockResolvedValue(analytics);
  vi.spyOn(api.v1, 'listPatientSessions').mockResolvedValue(sessionsPage);
  vi.spyOn(api.v1, 'listReports').mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Карточка ребёнка: шапка и вкладки', () => {
  it('шапка показывает псевдоним, возраст и активное назначение', async () => {
    renderCard('/specialist/patients/p1');

    expect(await screen.findByRole('heading', { name: 'Артём Л.' })).toBeTruthy();
    expect(screen.getByText(/8 лет/)).toBeTruthy();
    expect(screen.getByText('8 выдохов за занятие')).toBeTruthy();
    expect(screen.getByText('Занимается по плану')).toBeTruthy();
  });

  it('вкладка «Обзор» открыта по умолчанию и показывает KPI недели', async () => {
    renderCard('/specialist/patients/p1');

    expect(await screen.findByText('Регулярность за неделю')).toBeTruthy();
    expect(screen.getByText('Средняя длительность выдоха')).toBeTruthy();
    expect(screen.getByText('Пропуски на этой неделе')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Активное назначение' })).toBeTruthy();
  });

  it('переключение на «Графики» запрашивает аналитику и показывает сравнение периодов', async () => {
    const user = userEvent.setup();
    renderCard('/specialist/patients/p1');

    await screen.findByRole('heading', { name: 'Артём Л.' });
    await user.click(screen.getByRole('link', { name: 'Графики' }));

    await waitFor(() => expect(api.v1.getPatientAnalytics).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText('Две недели против двух предыдущих')).toBeTruthy();
    expect(screen.getByText('Сравнение с назначением')).toBeTruthy();
  });

  it('вкладка «Сессии» показывает журнал и открывает агрегаты занятия', async () => {
    const user = userEvent.setup();
    renderCard('/specialist/patients/p1/sessions');

    expect(await screen.findByText('Журнал занятий')).toBeTruthy();
    await waitFor(() => expect(api.v1.listPatientSessions).toHaveBeenCalled());

    await user.click(await screen.findByRole('button', { name: 'Подробнее' }));
    expect(await screen.findByRole('dialog', { name: 'Агрегаты занятия' })).toBeTruthy();
    expect(screen.getByText('Технические паузы')).toBeTruthy();
  });

  it('вкладка «Отчёты» предлагает выбрать период и показывает сноску о валидации', async () => {
    renderCard('/specialist/patients/p1/reports');

    expect(await screen.findByText('Сводка за период')).toBeTruthy();
    expect(screen.getByRole('button', { name: '8 недель' })).toBeTruthy();
    expect(screen.getByText(/требуют.*валидации специалистом/i)).toBeTruthy();
  });

  it('вкладка «Назначения» показывает историю версий и форму редактирования', async () => {
    const user = userEvent.setup();
    renderCard('/specialist/patients/p1/assignments');

    expect(await screen.findByText('История версий')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Изменить/ }));
    expect(screen.getByText('Сохранить новую версию')).toBeTruthy();
  });
});

describe('Карточка ребёнка в демо-режиме', () => {
  it('не показывает редактирование назначения', async () => {
    vi.spyOn(api.v1, 'me').mockResolvedValue({ user: { ...specialist, role: 'demo_specialist' } });
    renderCard('/specialist/patients/p1/assignments');

    expect(await screen.findByText('История версий')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Изменить/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Завершить/ })).toBeNull();
  });

  it('не предлагает формировать отчёт', async () => {
    vi.spyOn(api.v1, 'me').mockResolvedValue({ user: { ...specialist, role: 'demo_specialist' } });
    renderCard('/specialist/patients/p1/reports');

    expect(await screen.findByText('Сводка за период')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Сформировать отчёт/ })).toBeNull();
  });
});
