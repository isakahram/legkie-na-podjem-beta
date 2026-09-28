import { describe, expect, it } from 'vitest';
import { buildDashboard, parsePeriod, periodStart, type DashboardPatientInput } from '../server/insights/dashboard.ts';
import type { PatientSummary, SessionRecord, WeeklyPoint } from '../src/types.ts';

const NOW = new Date('2026-09-30T12:00:00.000Z');

const session = (id: string, startedAt: string, patch: Partial<SessionRecord> = {}): SessionRecord => ({
  id,
  childId: 'p1',
  startedAt,
  durationSeconds: 600,
  breathCount: 8,
  averageStrength: 0.6,
  averageBreathDuration: 3,
  averageStability: 80,
  correctBreathPercent: 88,
  completedBreaths: 8,
  targetBreaths: 8,
  coinsCollected: 6,
  averageLatencyMs: 60,
  maxLatencyMs: 90,
  technicalPauses: 0,
  status: 'completed',
  inputMode: 'microphone',
  ...patch,
});

const weekly = (sessions: number[]): WeeklyPoint[] =>
  sessions.map((count, index) => ({
    week: `2026-08-0${index + 1}`,
    label: `н${index + 1}`,
    sessions: count,
    target: 3,
    averageCorrect: 80,
    averageDuration: 600,
    averageStability: 78,
    breaths: count * 8,
  }));

const summary = (patch: Partial<PatientSummary> = {}): PatientSummary => ({
  sessionsThisWeek: 2,
  targetSessions: 3,
  adherencePercent: 67,
  averageCorrectPercent: 85,
  averageBreathDuration: 3,
  averageStability: 79,
  averageSessionDuration: 600,
  breathCompletionPercent: 90,
  cycleCompletionPercent: 90,
  missedThisWeek: 1,
  lastSessionAt: '2026-09-29T10:00:00.000Z',
  trendPercent: 3,
  ...patch,
});

const patient = (id: string, patch: Partial<DashboardPatientInput> = {}): DashboardPatientInput => ({
  id,
  pseudonym: `Пациент ${id}`,
  avatar: 'ПП',
  sessionsPerWeek: 3,
  targetBreaths: 8,
  summary: summary(),
  weekly: weekly([2, 3, 3, 2, 3, 3, 2, 2]),
  sessions: [session(`${id}-a`, '2026-09-29T10:00:00.000Z'), session(`${id}-b`, '2026-09-22T10:00:00.000Z')],
  ...patch,
});

describe('Сводка по всем пациентам', () => {
  it('период по умолчанию — текущая неделя', () => {
    expect(parsePeriod(undefined)).toBe('week');
    expect(parsePeriod('нечто')).toBe('week');
    expect(parsePeriod('8weeks')).toBe('8weeks');
  });

  it('начало периода сдвигается на нужное число недель', () => {
    expect(periodStart('week', NOW).toISOString().slice(0, 10)).toBe('2026-09-28');
    expect(periodStart('month', NOW).toISOString().slice(0, 10)).toBe('2026-09-07');
    expect(periodStart('8weeks', NOW).toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('считает KPI за выбранный период', () => {
    const dashboard = buildDashboard([patient('p1'), patient('p2')], { period: 'week', now: NOW });

    expect(dashboard.kpi.totalPatients).toBe(2);
    expect(dashboard.kpi.activePatients).toBe(2);
    expect(dashboard.kpi.sessionsInPeriod).toBe(2); // по одной сессии 29 сентября у каждого
    expect(dashboard.kpi.targetSessionsInPeriod).toBe(6);
    expect(dashboard.kpi.missedSessions).toBe(4);
    expect(dashboard.kpi.averageAdherencePercent).toBe(67);
  });

  it('за восемь недель период шире и попадает больше занятий', () => {
    const dashboard = buildDashboard([patient('p1')], { period: '8weeks', now: NOW });
    expect(dashboard.kpi.sessionsInPeriod).toBe(2);
    expect(dashboard.kpi.targetSessionsInPeriod).toBe(24);
  });

  it('демо-сессии и прерванные занятия не попадают в KPI', () => {
    const noisy = patient('p1', {
      sessions: [
        session('demo', '2026-09-29T10:00:00.000Z', { inputMode: 'demo' }),
        session('stopped', '2026-09-29T11:00:00.000Z', { status: 'stopped' }),
      ],
    });
    const dashboard = buildDashboard([noisy], { period: 'week', now: NOW });
    expect(dashboard.kpi.sessionsInPeriod).toBe(0);
    expect(dashboard.kpi.activePatients).toBe(0);
    expect(dashboard.recentSessions).toHaveLength(0);
  });

  it('складывает недельные ряды всех пациентов', () => {
    const dashboard = buildDashboard([patient('p1'), patient('p2')], { now: NOW });
    expect(dashboard.series).toHaveLength(8);
    expect(dashboard.series[0].sessions).toBe(4);
    expect(dashboard.series[0].target).toBe(6);
  });

  it('в список внимания попадают только проблемные дети, критические — первыми', () => {
    const ok = patient('ok');
    const gap = patient('gap', {
      summary: summary({ lastSessionAt: '2026-09-20T10:00:00.000Z' }),
      sessions: [session('gap-a', '2026-09-20T10:00:00.000Z')],
    });
    const decline = patient('decline', { summary: summary({ trendPercent: -40 }) });

    const dashboard = buildDashboard([ok, gap, decline], { now: NOW });
    expect(dashboard.kpi.attentionCount).toBe(2);
    expect(dashboard.attention.map((item) => item.patientId)).not.toContain('ok');
    expect(dashboard.attention[0].reasons.some((reason) => reason.severity === 'critical')).toBe(true);
  });

  it('лента последних занятий отсортирована по убыванию даты и ограничена лимитом', () => {
    const dashboard = buildDashboard([patient('p1'), patient('p2')], { now: NOW, recentLimit: 3 });
    expect(dashboard.recentSessions).toHaveLength(3);
    const times = dashboard.recentSessions.map((item) => new Date(item.startedAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('пустой список пациентов не ломает сводку', () => {
    const dashboard = buildDashboard([], { now: NOW });
    expect(dashboard.kpi.totalPatients).toBe(0);
    expect(dashboard.kpi.averageAdherencePercent).toBe(0);
    expect(dashboard.series).toHaveLength(0);
  });
});
