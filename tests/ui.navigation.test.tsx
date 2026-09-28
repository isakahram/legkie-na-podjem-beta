// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api';
import { SpecialistAuthProvider } from '../src/specialist/AuthContext';
import { specialistRoutes } from '../src/specialist/routes';
import type {
  DashboardDto,
  PatientListResponse,
  SessionsResponse,
  SpecialistSettingsDto,
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
  displayName: 'Мария Орлова',
  clinicName: 'Детская клиника',
  contactEmail: null,
  contactPhone: null,
};

const dashboard: DashboardDto = {
  period: 'week',
  generatedAt: '2026-09-29T10:00:00.000Z',
  kpi: {
    activePatients: 4,
    totalPatients: 4,
    sessionsInPeriod: 9,
    targetSessionsInPeriod: 12,
    averageAdherencePercent: 72,
    missedSessions: 3,
    attentionCount: 1,
  },
  series: [],
  attention: [],
  recentSessions: [],
};

const patients: PatientListResponse = {
  items: [
    {
      id: 'p1',
      pseudonym: 'Артём Л.',
      code: 'ОБЛАКО6',
      age: 8,
      gender: 'male',
      avatar: 'АЛ',
      balance: 10,
      selectedSkin: 'ocean',
      createdAt: '2026-02-01T00:00:00.000Z',
      assignment: {
        sessionsPerWeek: 3,
        targetBreaths: 8,
        minCompletedBreathSeconds: 1.5,
        targetBreathDurationMin: 2,
        targetBreathDurationMax: 4,
        validFrom: '2026-02-01T00:00:00.000Z',
        note: null,
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
  ],
  total: 1,
  page: 1,
  pageSize: 10,
};

const sessions: SessionsResponse = { items: [], total: 0, page: 1, pageSize: 20 };

const settings: SpecialistSettingsDto = {
  profile: {
    displayName: 'Мария Орлова',
    clinicName: 'Детская клиника',
    contactEmail: null,
    contactPhone: null,
  },
  notifications: {
    emailAlerts: true,
    weeklyReport: true,
    missedDaysThreshold: 3,
    declineTrendPercent: -15,
  },
  assignmentDefaults: { sessionsPerWeek: 3, targetBreaths: 8, minCompletedBreathSeconds: 1.5 },
  attentionThresholds: { missedDays: 3, declinePercent: -15, minAdherencePercent: 60 },
  updatedAt: null,
};

const renderApp = (path = '/specialist') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SpecialistAuthProvider>
        <Routes>{specialistRoutes}</Routes>
      </SpecialistAuthProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.spyOn(api.v1, 'me').mockResolvedValue({ user: specialist });
  vi.spyOn(api.v1, 'dashboard').mockResolvedValue(dashboard);
  vi.spyOn(api.v1, 'listPatients').mockResolvedValue(patients);
  vi.spyOn(api.v1, 'listSessions').mockResolvedValue(sessions);
  vi.spyOn(api.v1, 'getSettings').mockResolvedValue(settings);
  vi.spyOn(api.v1, 'listAuthSessions').mockResolvedValue([
    {
      id: 'sess-a',
      createdAt: '2026-09-29T08:00:00.000Z',
      lastActiveAt: '2026-09-29T09:00:00.000Z',
      expiresAt: '2026-10-06T08:00:00.000Z',
      userAgent: 'Chrome, Windows',
      ip: '10.0.0.1',
      current: true,
    },
  ]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Навигация по разделам кабинета', () => {
  it('боковое меню содержит все реализованные разделы', async () => {
    renderApp();

    const nav = await screen.findByRole('navigation', { name: /Разделы кабинета/i });
    for (const label of ['Дашборд', 'Пациенты', 'Занятия', 'Настройки']) {
      expect(screen.getAllByRole('link', { name: new RegExp(label) }).length).toBeGreaterThan(0);
    }
    expect(nav).toBeTruthy();
  });

  it('переход Дашборд → Пациенты → Занятия → Настройки грузит нужные данные', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByRole('heading', { name: 'Сводка' })).toBeTruthy();

    await user.click(screen.getByRole('link', { name: /Пациенты/ }));
    expect(await screen.findByRole('heading', { name: /Пациенты/ })).toBeTruthy();
    await waitFor(() => expect(api.v1.listPatients).toHaveBeenCalled());

    await user.click(screen.getByRole('link', { name: /Занятия/ }));
    expect(await screen.findByRole('heading', { name: 'Занятия' })).toBeTruthy();
    await waitFor(() => expect(api.v1.listSessions).toHaveBeenCalled());

    await user.click(screen.getByRole('link', { name: /Настройки/ }));
    expect(await screen.findByRole('heading', { name: 'Настройки' })).toBeTruthy();
    await waitFor(() => expect(api.v1.getSettings).toHaveBeenCalled());
    expect(screen.getByDisplayValue('Мария Орлова')).toBeTruthy();
  });

  it('из журнала занятий можно перейти в карточку ребёнка', async () => {
    vi.spyOn(api.v1, 'listSessions').mockResolvedValue({
      items: [
        {
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
          technicalPauses: 0,
          status: 'completed',
          inputMode: 'microphone',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    renderApp('/specialist/sessions');

    const link = await screen.findByRole('link', { name: 'Артём Л.' });
    expect(link.getAttribute('href')).toBe('/specialist/patients/p1');
  });

  it('в кабинете нет надписей «демо», «тест» и «заглушка»', async () => {
    renderApp('/specialist/settings');

    await screen.findByRole('heading', { name: 'Настройки' });
    expect(document.body.textContent ?? '').not.toMatch(/\bтест|заглушк|в разработке|скоро/i);
  });
});

describe('Демо-режим', () => {
  beforeEach(() => {
    vi.spyOn(api.v1, 'me').mockResolvedValue({ user: { ...specialist, role: 'demo_specialist' } });
  });

  it('помечает режим просмотра и скрывает сохранение настроек', async () => {
    renderApp('/specialist/settings');

    await screen.findByRole('heading', { name: 'Настройки' });
    expect(screen.queryByRole('button', { name: /Сохранить профиль/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Сменить пароль/ })).toBeNull();
    expect(screen.getAllByText(/Демонстрационный режим/i).length).toBeGreaterThan(0);
  });
});
