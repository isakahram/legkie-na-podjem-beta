import { describe, expect, it } from 'vitest';
import {
  buildPlanFact,
  buildReportSummary,
  compareRecentPeriods,
  filterSessions,
  isCountableSession,
  paginateSessions,
  periodMetrics,
} from '../server/insights/patientAnalytics.ts';
import type { SessionRecord, WeeklyPoint } from '../src/types.ts';

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

// Текущие две недели: с 21 сентября. Предыдущие две: с 7 по 20 сентября.
const currentSessions = [
  session('c1', '2026-09-29T10:00:00.000Z', { averageBreathDuration: 4, averageStability: 90 }),
  session('c2', '2026-09-24T10:00:00.000Z', { averageBreathDuration: 4, averageStability: 90 }),
  session('c3', '2026-09-22T10:00:00.000Z', { averageBreathDuration: 4, averageStability: 90 }),
];

const previousSessions = [
  session('p1', '2026-09-15T10:00:00.000Z', { averageBreathDuration: 2, averageStability: 60 }),
  session('p2', '2026-09-08T10:00:00.000Z', { averageBreathDuration: 2, averageStability: 60 }),
];

const weekly = (): WeeklyPoint[] =>
  Array.from({ length: 8 }, (_, index) => ({
    week: `2026-0${index < 3 ? 8 : 9}-${String(index * 3 + 1).padStart(2, '0')}`,
    label: `н${index + 1}`,
    sessions: 2,
    target: 3,
    averageCorrect: 80,
    averageDuration: 600,
    averageStability: 75,
    averageBreathDuration: 3,
    breaths: 16,
  }));

describe('Показатели за период', () => {
  it('учитывает только завершённые занятия с микрофона', () => {
    expect(isCountableSession(session('a', NOW.toISOString()))).toBe(true);
    expect(isCountableSession(session('b', NOW.toISOString(), { inputMode: 'demo' }))).toBe(false);
    expect(isCountableSession(session('c', NOW.toISOString(), { status: 'stopped' }))).toBe(false);
  });

  it('считает средние и регулярность', () => {
    const metrics = periodMetrics(
      currentSessions,
      new Date('2026-09-21T00:00:00.000Z'),
      new Date('2026-10-04T23:59:59.000Z'),
      3,
      2,
    );

    expect(metrics.sessions).toBe(3);
    expect(metrics.averageBreathDuration).toBe(4);
    expect(metrics.averageStability).toBe(90);
    expect(metrics.totalBreaths).toBe(24);
    expect(metrics.adherencePercent).toBe(50);
  });

  it('пустой период даёт нули и null вместо выдуманных значений', () => {
    const metrics = periodMetrics([], new Date('2026-09-01'), new Date('2026-09-07'), 3, 1);
    expect(metrics.sessions).toBe(0);
    expect(metrics.averageBreathDuration).toBeNull();
    expect(metrics.averageStability).toBeNull();
    expect(metrics.adherencePercent).toBe(0);
  });
});

describe('Сравнение двух недель с предыдущими двумя', () => {
  it('показывает рост показателей', () => {
    const comparison = compareRecentPeriods([...currentSessions, ...previousSessions], 3, NOW);

    expect(comparison.current.sessions).toBe(3);
    expect(comparison.previous.sessions).toBe(2);
    expect(comparison.delta.sessions).toBe(50);
    expect(comparison.delta.averageBreathDuration).toBe(100);
    expect(comparison.delta.averageStability).toBe(50);
  });

  it('без данных за прошлый период изменение равно null', () => {
    const comparison = compareRecentPeriods(currentSessions, 3, NOW);
    expect(comparison.previous.sessions).toBe(0);
    expect(comparison.delta.sessions).toBeNull();
    expect(comparison.delta.averageStability).toBeNull();
  });
});

describe('План против факта', () => {
  it('добавляет плановые значения к каждой неделе', () => {
    const planFact = buildPlanFact(weekly(), 3, 8);
    expect(planFact).toHaveLength(8);
    expect(planFact[0].planSessions).toBe(3);
    expect(planFact[0].planBreaths).toBe(24);
    expect(planFact[0].factSessions).toBe(2);
    expect(planFact[0].factBreaths).toBe(16);
  });
});

describe('Фильтры и страницы журнала занятий', () => {
  const journal = [
    session('s1', '2026-09-29T10:00:00.000Z', { durationSeconds: 300, completedBreaths: 4 }),
    session('s2', '2026-09-20T10:00:00.000Z', { durationSeconds: 600, completedBreaths: 8 }),
    session('s3', '2026-09-10T10:00:00.000Z', { durationSeconds: 900, completedBreaths: 12 }),
  ];

  it('фильтрует по датам', () => {
    const result = filterSessions(journal, { from: '2026-09-15T00:00:00.000Z' });
    expect(result.map((item) => item.id)).toEqual(['s1', 's2']);
  });

  it('фильтрует по длительности и числу выдохов', () => {
    expect(filterSessions(journal, { minDurationSeconds: 600 }).map((item) => item.id)).toEqual(['s2', 's3']);
    expect(filterSessions(journal, { maxDurationSeconds: 600 }).map((item) => item.id)).toEqual(['s1', 's2']);
    expect(filterSessions(journal, { minBreaths: 8 }).map((item) => item.id)).toEqual(['s2', 's3']);
  });

  it('фильтрует по пациенту', () => {
    const mixed = [...journal, session('other', '2026-09-28T10:00:00.000Z', { childId: 'p2' })];
    expect(filterSessions(mixed, { patientId: 'p2' }).map((item) => item.id)).toEqual(['other']);
  });

  it('нарезает страницы и прижимает номер к диапазону', () => {
    expect(paginateSessions(journal, 1, 2).items.map((item) => item.id)).toEqual(['s1', 's2']);
    expect(paginateSessions(journal, 2, 2).items.map((item) => item.id)).toEqual(['s3']);
    expect(paginateSessions(journal, 9, 2).page).toBe(2);
  });
});

describe('Сводка отчёта', () => {
  it('собирает показатели за выбранный период', () => {
    const summary = buildReportSummary([...currentSessions, ...previousSessions], weekly(), {
      from: new Date('2026-09-21T00:00:00.000Z'),
      to: new Date('2026-10-04T00:00:00.000Z'),
      sessionsPerWeek: 3,
      trendPercent: 12,
    });

    expect(summary.sessions).toBe(3);
    expect(summary.totalBreaths).toBe(24);
    expect(summary.averageBreathDuration).toBe(4);
    expect(summary.trendPercent).toBe(12);
    expect(summary.averageAdherencePercent).toBe(50);
  });

  it('период без занятий не ломает сводку', () => {
    const summary = buildReportSummary([], weekly(), {
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-02-01T00:00:00.000Z'),
      sessionsPerWeek: 3,
      trendPercent: 0,
    });

    expect(summary.sessions).toBe(0);
    expect(summary.averageBreathDuration).toBeNull();
    expect(summary.weekly.length).toBeGreaterThan(0);
  });
});
