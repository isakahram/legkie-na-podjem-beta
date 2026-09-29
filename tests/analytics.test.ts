import { describe, expect, it } from 'vitest';
import { calculatePatientAnalytics } from '../server/analytics.ts';
import type { Assignment, SessionRecord } from '../src/types.ts';

const assignment: Assignment = {
  sessionsPerWeek: 3,
  cyclesPerSession: 8,
  recommendedDurationSeconds: 60,
};

const session = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  id: crypto.randomUUID(),
  childId: 'child-test',
  startedAt: '2026-09-28T14:00:00.000Z',
  durationSeconds: 60,
  breathCount: 8,
  averageStrength: 0.7,
  averageBreathDuration: 3.2,
  averageStability: 72,
  correctBreathPercent: 80,
  completedCycles: 8,
  targetCycles: 8,
  coinsCollected: 5,
  averageLatencyMs: 60,
  maxLatencyMs: 95,
  technicalPauses: 0,
  status: 'completed',
  inputMode: 'microphone',
  ...overrides,
});

describe('calculatePatientAnalytics', () => {
  const now = new Date('2026-09-29T12:00:00.000Z');

  it('calculates current weekly adherence and missing sessions', () => {
    const result = calculatePatientAnalytics([session(), session({ id: 'second', startedAt: '2026-09-29T08:00:00.000Z' })], assignment, now);
    expect(result.summary.sessionsThisWeek).toBe(2);
    expect(result.summary.adherencePercent).toBe(67);
    expect(result.summary.missedThisWeek).toBe(1);
  });

  it('excludes demo and stopped sessions from clinician metrics', () => {
    const result = calculatePatientAnalytics([
      session({ inputMode: 'demo' }),
      session({ id: 'stopped', status: 'stopped', inputMode: 'microphone' }),
    ], assignment, now);
    expect(result.summary.sessionsThisWeek).toBe(0);
    expect(result.summary.averageCorrectPercent).toBe(0);
  });

  it('старые записи без новых метрик не портят средние и дают null', () => {
    const result = calculatePatientAnalytics([
      session({ averageStability: null, averageBreathDuration: null }),
      session({ id: 'second', averageStability: 80, averageBreathDuration: 4 }),
    ], assignment, now);
    expect(result.summary.averageStability).toBe(80);
    expect(result.summary.averageBreathDuration).toBe(4);

    const legacyOnly = calculatePatientAnalytics([
      session({ averageStability: null, averageBreathDuration: null }),
    ], assignment, now);
    expect(legacyOnly.summary.averageStability).toBeNull();
    expect(legacyOnly.summary.averageBreathDuration).toBeNull();
  });

  it('calculates averages and cycle completion', () => {
    const result = calculatePatientAnalytics([
      session({ averageBreathDuration: 2.5, correctBreathPercent: 70, completedCycles: 6 }),
      session({ id: 'second', averageBreathDuration: 3.5, correctBreathPercent: 90, completedCycles: 8 }),
    ], assignment, now);
    expect(result.summary.averageBreathDuration).toBe(3);
    expect(result.summary.averageCorrectPercent).toBe(80);
    expect(result.summary.cycleCompletionPercent).toBe(88);
  });

  it('returns eight chronological weekly points', () => {
    const { weekly } = calculatePatientAnalytics([session()], assignment, now);
    expect(weekly).toHaveLength(8);
    expect(weekly.at(-1)?.sessions).toBe(1);
    expect(new Date(weekly[0].week).getTime()).toBeLessThan(new Date(weekly[7].week).getTime());
  });
});

describe('Незавершённая неделя в недельном ряду', () => {
  it('последняя точка помечена isPartial, если неделя ещё не закончилась', () => {
    const now = new Date('2026-09-30T12:00:00.000Z'); // среда
    const { weekly } = calculatePatientAnalytics([], assignment, now);
    expect(weekly.at(-1)?.isPartial).toBe(true);
    expect(weekly.slice(0, -1).every((point) => point.isPartial === false)).toBe(true);
  });

  it('в последний момент недели точка считается завершённой', () => {
    const now = new Date('2026-10-04T23:59:59.999Z'); // воскресенье, конец ISO-недели
    const { weekly } = calculatePatientAnalytics([], assignment, now);
    expect(weekly.at(-1)?.isPartial).toBe(false);
  });

  it('незавершённая неделя не даёт ложного −100% в сводке', () => {
    const now = new Date('2026-09-30T12:00:00.000Z');
    const { summary } = calculatePatientAnalytics([], assignment, now);
    expect(summary.trendPercent).toBe(0);
    expect(summary.trendHasCurrentData).toBe(false);
    expect(summary.trendWeekIsPartial).toBe(true);
  });
});
