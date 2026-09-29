import { describe, expect, it } from 'vitest';
import {
  formatTrendLabel,
  resolveTrendContext,
  trendContextFromValues,
} from '../src/shared/trend.ts';
import { formatTrend } from '../src/specialist/lib/format.ts';
import type { WeeklyPoint } from '../src/types.ts';

const week = (patch: Partial<WeeklyPoint> & { week: string }): WeeklyPoint => ({
  label: patch.week,
  sessions: 0,
  target: 3,
  averageCorrect: 0,
  averageDuration: 0,
  averageStability: null,
  breaths: 0,
  ...patch,
});

describe('Формулировка динамики', () => {
  it('без занятий в текущем периоде пишет «Нет данных за период», а не −100%', () => {
    const context = trendContextFromValues({ trendPercent: 0, hasCurrentData: false });
    expect(context.state).toBe('no-data');
    expect(formatTrendLabel(context)).toBe('Нет данных за период');
    expect(formatTrendLabel(context)).not.toContain('100');
  });

  it('снижение показывает обе точки', () => {
    expect(
      formatTrendLabel(
        trendContextFromValues({ trendPercent: -25, previousPercent: 80, currentPercent: 60 }),
      ),
    ).toBe('Снижение с 80% до 60%');
  });

  it('рост показывает обе точки', () => {
    expect(
      formatTrendLabel(
        trendContextFromValues({ trendPercent: 20, previousPercent: 50, currentPercent: 60 }),
      ),
    ).toBe('Рост с 50% до 60%');
  });

  it('нулевая динамика — «Без изменений»', () => {
    expect(
      formatTrendLabel(
        trendContextFromValues({ trendPercent: 0, previousPercent: 70, currentPercent: 70 }),
      ),
    ).toBe('Без изменений');
  });

  it('незавершённая неделя без данных отличается от отсутствия данных', () => {
    const weekly = [
      week({ week: '2026-09-07', sessions: 0, averageCorrect: 0 }),
      week({ week: '2026-09-14', sessions: 0, averageCorrect: 0 }),
      week({ week: '2026-09-21', sessions: 0, averageCorrect: 0, isPartial: true }),
    ];
    expect(formatTrendLabel(resolveTrendContext(weekly))).toBe('Текущая неделя не завершена');
  });

  it('сравнивает две последние ПОЛНЫЕ недели, игнорируя незавершённую', () => {
    const weekly = [
      week({ week: '2026-09-07', sessions: 3, averageCorrect: 80 }),
      week({ week: '2026-09-14', sessions: 3, averageCorrect: 60 }),
      week({ week: '2026-09-21', sessions: 0, averageCorrect: 0, isPartial: true }),
    ];
    const context = resolveTrendContext(weekly);
    expect(context.state).toBe('trend');
    expect(context.previousPercent).toBe(80);
    expect(context.currentPercent).toBe(60);
    expect(context.trendPercent).toBe(-25);
    expect(formatTrendLabel(context)).toBe('Снижение с 80% до 60%');
  });

  it('если и предпоследняя неделя неполная — «Нет данных за период» без ложного падения', () => {
    const weekly = [
      week({ week: '2026-09-14', sessions: 3, averageCorrect: 90, isPartial: true }),
      week({ week: '2026-09-21', sessions: 0, averageCorrect: 0, isPartial: true }),
    ];
    const label = formatTrendLabel(resolveTrendContext(weekly));
    expect(label).toBe('Текущая неделя не завершена');
    expect(label).not.toContain('100');
  });

  it('старый formatTrend сохраняет сигнатуру и поведение', () => {
    expect(formatTrend(0)).toBe('без изменений');
    expect(formatTrend(12)).toBe('рост +12%');
    expect(formatTrend(-12)).toBe('снижение -12%');
    expect(formatTrend(null)).toBe('—');
  });
});
