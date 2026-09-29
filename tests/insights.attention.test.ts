import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATTENTION_THRESHOLDS,
  daysSinceLastSession,
  evaluateAttention,
  resolveThresholds,
} from '../server/insights/attention.ts';
import type { PatientSummary, WeeklyPoint } from '../src/types.ts';

// Среда: 2026-09-30, чтобы правило регулярности уже было информативным.
const NOW = new Date('2026-09-30T12:00:00.000Z');

const summary = (patch: Partial<PatientSummary> = {}): PatientSummary => ({
  sessionsThisWeek: 3,
  targetSessions: 3,
  adherencePercent: 100,
  averageCorrectPercent: 88,
  averageBreathDuration: 3.1,
  averageStability: 80,
  averageSessionDuration: 600,
  breathCompletionPercent: 92,
  cycleCompletionPercent: 92,
  missedThisWeek: 0,
  lastSessionAt: '2026-09-29T10:00:00.000Z',
  trendPercent: 4,
  ...patch,
});

const weekly = (sessions: number): WeeklyPoint[] =>
  Array.from({ length: 8 }, (_, index) => ({
    week: `2026-08-0${index + 1}`,
    label: `нед ${index + 1}`,
    sessions,
    target: 3,
    averageCorrect: 80,
    averageDuration: 600,
    averageStability: 78,
    breaths: sessions * 8,
  }));

describe('Правила списка «Требуют внимания»', () => {
  it('ребёнок в графике не попадает в список', () => {
    const verdict = evaluateAttention({ summary: summary(), weekly: weekly(3) }, DEFAULT_ATTENTION_THRESHOLDS, NOW);
    expect(verdict.needsAttention).toBe(false);
    expect(verdict.reasons).toHaveLength(0);
    expect(verdict.daysSinceLastSession).toBe(1);
  });

  it('пропуск больше трёх дней даёт причину long_gap', () => {
    const verdict = evaluateAttention(
      { summary: summary({ lastSessionAt: '2026-09-24T10:00:00.000Z' }), weekly: weekly(1) },
      DEFAULT_ATTENTION_THRESHOLDS,
      NOW,
    );
    expect(verdict.needsAttention).toBe(true);
    expect(verdict.reasons.map((reason) => reason.code)).toContain('long_gap');
    expect(verdict.daysSinceLastSession).toBe(6);
  });

  it('ровно три дня без занятий ещё не считаются пропуском', () => {
    const verdict = evaluateAttention(
      { summary: summary({ lastSessionAt: '2026-09-27T10:00:00.000Z' }), weekly: weekly(2) },
      DEFAULT_ATTENTION_THRESHOLDS,
      NOW,
    );
    expect(verdict.reasons.map((reason) => reason.code)).not.toContain('long_gap');
  });

  it('очень долгий перерыв помечается как критический', () => {
    const verdict = evaluateAttention(
      { summary: summary({ lastSessionAt: '2026-09-10T10:00:00.000Z' }), weekly: weekly(1) },
      DEFAULT_ATTENTION_THRESHOLDS,
      NOW,
    );
    const gap = verdict.reasons.find((reason) => reason.code === 'long_gap');
    expect(gap?.severity).toBe('critical');
  });

  it('ухудшение динамики фиксируется отдельной причиной', () => {
    const verdict = evaluateAttention(
      { summary: summary({ trendPercent: -24 }), weekly: weekly(3) },
      DEFAULT_ATTENTION_THRESHOLDS,
      NOW,
    );
    expect(verdict.reasons.map((reason) => reason.code)).toContain('declining_trend');
    expect(verdict.reasons.find((reason) => reason.code === 'declining_trend')?.severity).toBe('critical');
  });

  it('без занятий в текущем периоде бейдж пишет «Нет данных за период», а не −100%', () => {
    const emptyWeeks: WeeklyPoint[] = weekly(0).map((point) => ({ ...point, averageCorrect: 0 }));
    const verdict = evaluateAttention(
      {
        summary: summary({
          trendPercent: -100,
          trendPreviousPercent: null,
          trendCurrentPercent: null,
          trendHasCurrentData: false,
          trendWeekIsPartial: false,
          lastSessionAt: '2026-08-01T10:00:00.000Z',
        }),
        weekly: emptyWeeks,
      },
      DEFAULT_ATTENTION_THRESHOLDS,
      NOW,
    );
    const reason = verdict.reasons.find((item) => item.code === 'declining_trend');
    expect(reason?.label).toBe('Нет данных за период');
    expect(verdict.reasons.map((item) => item.label).join(' ')).not.toContain('100%');
  });

  it('незавершённая текущая неделя не даёт ложного «снижения на 100%»', () => {
    const weeks: WeeklyPoint[] = weekly(3).map((point, index, all) =>
      index === all.length - 1 ? { ...point, sessions: 0, averageCorrect: 0, isPartial: true } : point,
    );
    const verdict = evaluateAttention(
      { summary: summary({ trendPercent: -100 }), weekly: weeks },
      DEFAULT_ATTENTION_THRESHOLDS,
      NOW,
    );
    const reason = verdict.reasons.find((item) => item.code === 'declining_trend');
    expect(reason).toBeUndefined();
  });

  it('снижение между полными неделями формулируется конкретно', () => {
    const weeks: WeeklyPoint[] = weekly(3).map((point, index, all) => {
      if (index === all.length - 1) return { ...point, sessions: 0, averageCorrect: 0, isPartial: true };
      if (index === all.length - 2) return { ...point, averageCorrect: 60 };
      if (index === all.length - 3) return { ...point, averageCorrect: 90 };
      return point;
    });
    const verdict = evaluateAttention(
      { summary: summary({ trendPercent: -33 }), weekly: weeks },
      DEFAULT_ATTENTION_THRESHOLDS,
      NOW,
    );
    expect(verdict.reasons.find((item) => item.code === 'declining_trend')?.label).toBe(
      'Снижение с 90% до 60%',
    );
  });

  it('низкая регулярность отмечается в середине недели, но не в понедельник', () => {
    const lowAdherence = { summary: summary({ adherencePercent: 33, sessionsThisWeek: 1 }), weekly: weekly(1) };

    const midweek = evaluateAttention(lowAdherence, DEFAULT_ATTENTION_THRESHOLDS, NOW);
    expect(midweek.reasons.map((reason) => reason.code)).toContain('low_adherence');

    const monday = evaluateAttention(lowAdherence, DEFAULT_ATTENTION_THRESHOLDS, new Date('2026-09-28T09:00:00.000Z'));
    expect(monday.reasons.map((reason) => reason.code)).not.toContain('low_adherence');
  });

  it('ребёнок без единого занятия помечается отдельной причиной', () => {
    const verdict = evaluateAttention(
      { summary: summary({ lastSessionAt: null, sessionsThisWeek: 0, adherencePercent: 0 }), weekly: weekly(0) },
      DEFAULT_ATTENTION_THRESHOLDS,
      NOW,
    );
    expect(verdict.reasons.map((reason) => reason.code)).toEqual(['no_sessions']);
    expect(verdict.daysSinceLastSession).toBeNull();
  });
});

describe('Пороговые значения', () => {
  it('пустые настройки дают значения по умолчанию', () => {
    expect(resolveThresholds(null)).toEqual(DEFAULT_ATTENTION_THRESHOLDS);
    expect(resolveThresholds('не объект')).toEqual(DEFAULT_ATTENTION_THRESHOLDS);
  });

  it('настройки уведомлений переопределяют пороги', () => {
    const resolved = resolveThresholds({ missedDaysThreshold: 5, declineTrendPercent: -25 });
    expect(resolved.missedDays).toBe(5);
    expect(resolved.declinePercent).toBe(-25);
    expect(resolved.minAdherencePercent).toBe(DEFAULT_ATTENTION_THRESHOLDS.minAdherencePercent);
  });

  it('пропуск считается в календарных днях', () => {
    expect(daysSinceLastSession(null, NOW)).toBeNull();
    expect(daysSinceLastSession('2026-09-28T23:00:00.000Z', NOW)).toBe(2);
  });
});
