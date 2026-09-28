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
  contactEmail: 'maria@legkie.local',
  contactPhone: null,
};

const dashboard: DashboardDto = {
  period: 'week',
  generatedAt: '2026-09-30T12:00:00.000Z',
  kpi: {
    activePatients: 3,
    totalPatients: 4,
    sessionsInPeriod: 7,
    targetSessionsInPeriod: 13,
    averageAdherencePercent: 62,
    missedSessions: 6,
    attentionCount: 1,
  },
  series: [{ week: '2026-09-28', label: '28 сент.', sessions: 7, target: 13 }],
  attention: [
    {
      patientId: 'patient-maria-gap',
      pseudonym: 'Вера Н.',
      avatar: 'ВН',
      reasons: [{ code: 'long_gap', label: 'Нет занятий 7 дней', severity: 'warning', value: 7 }],
      daysSinceLastSession: 7,
    },
  ],
  recentSessions: [
    {
      id: 'sess-1',
      patientId: 'patient-maria-stable',
      pseudonym: 'Артём Л.',
      startedAt: '2026-09-29T14:00:00.000Z',
      durationSeconds: 540,
      completedBreaths: 8,
      targetBreaths: 8,
      averageStability: 82,
    },
  ],
};

const patients: PatientListResponse = {
  total: 1,
  page: 1,
  pageSize: 10,
  items: [
    {
      id: 'patient-maria-stable',
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
};

const renderCabinet = (path: string) =>
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
  vi.spyOn(api.v1, 'logout').mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Навигация по разделам кабинета', () => {
  it('дашборд показывает KPI, список внимания и ленту занятий', async () => {
    renderCabinet('/specialist');

    expect(await screen.findByRole('heading', { name: 'Сводка' })).toBeTruthy();
    expect(await screen.findByText('Активные пациенты')).toBeTruthy();
    expect(screen.getByText('Требуют внимания')).toBeTruthy();
    expect(screen.getByText('Нет занятий 7 дней')).toBeTruthy();
    expect(screen.getByText('Последние занятия')).toBeTruthy();
  });

  it('переход по боковому меню открывает раздел «Пациенты»', async () => {
    const user = userEvent.setup();
    renderCabinet('/specialist');

    await screen.findByRole('heading', { name: 'Сводка' });
    await user.click(screen.getByRole('link', { name: 'Пациенты' }));

    expect(await screen.findByRole('heading', { name: 'Пациенты' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Артём Л.')).toBeTruthy());
    expect(api.v1.listPatients).toHaveBeenCalled();
  });

  it('смена периода перезапрашивает сводку', async () => {
    const user = userEvent.setup();
    renderCabinet('/specialist');

    await screen.findByRole('heading', { name: 'Сводка' });
    await user.click(screen.getByRole('button', { name: '8 недель' }));

    await waitFor(() => expect(api.v1.dashboard).toHaveBeenCalledWith('8weeks'));
  });

  it('фильтр «Требуют внимания» уходит в запрос списка', async () => {
    const user = userEvent.setup();
    renderCabinet('/specialist/patients');

    await screen.findByRole('heading', { name: 'Пациенты' });
    await user.click(screen.getByRole('button', { name: 'Требуют внимания' }));

    await waitFor(() =>
      expect(api.v1.listPatients).toHaveBeenCalledWith(expect.objectContaining({ filter: 'attention' })),
    );
  });

  it('неавторизованного пользователя уводит на страницу входа', async () => {
    vi.spyOn(api.v1, 'me').mockRejectedValue(new Error('Требуется авторизация'));
    renderCabinet('/specialist');

    expect(await screen.findByRole('heading', { name: 'Кабинет специалиста' })).toBeTruthy();
  });
});

describe('Демо-режим в интерфейсе', () => {
  it('помечен явной плашкой и скрывает добавление пациента', async () => {
    vi.spyOn(api.v1, 'me').mockResolvedValue({
      user: { ...specialist, role: 'demo_specialist', displayName: 'Ознакомительный доступ' },
    });

    renderCabinet('/specialist/patients');

    await screen.findByRole('heading', { name: 'Пациенты' });
    expect(screen.getAllByText('Демонстрационный режим').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Добавить пациента/ })).toBeNull();
  });

  it('у специалиста кнопка добавления доступна', async () => {
    renderCabinet('/specialist/patients');

    await screen.findByRole('heading', { name: 'Пациенты' });
    expect(screen.getByRole('button', { name: /Добавить пациента/ })).toBeTruthy();
  });
});
