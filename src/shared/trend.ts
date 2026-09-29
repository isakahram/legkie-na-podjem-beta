/**
 * Единый расчёт и формулировка динамики для кабинета специалиста.
 *
 * Две причины, по которым это вынесено в общий модуль:
 * 1. Сервер (бейдж «Требуют внимания») и клиент (обзор, отчёты) обязаны говорить одинаково.
 * 2. Сравнивать можно только ДВЕ ПОЛНЫЕ недели: сравнение незавершённой недели с полной
 *    давало ложное «снижение на 100%», хотя данных за текущую неделю просто ещё нет.
 */
import type { WeeklyPoint } from '../types.ts';

export type TrendState =
  | 'trend'             // есть две полные недели с данными
  | 'no-data'           // полные недели есть, но занятий в них не было
  | 'incomplete-week';  // текущая неделя не завершена, полной пары для сравнения нет

export interface TrendContext {
  state: TrendState;
  /** Динамика в процентах между двумя последними ПОЛНЫМИ неделями. */
  trendPercent: number;
  /** Показатель предыдущей полной недели, %. */
  previousPercent: number | null;
  /** Показатель последней полной недели, %. */
  currentPercent: number | null;
  /** Есть ли занятия в сравниваемых полных неделях. */
  hasCurrentData: boolean;
  /** Последняя точка ряда — незавершённая неделя. */
  currentWeekIsPartial: boolean;
}

export const EMPTY_TREND_CONTEXT: TrendContext = {
  state: 'no-data',
  trendPercent: 0,
  previousPercent: null,
  currentPercent: null,
  hasCurrentData: false,
  currentWeekIsPartial: false,
};

const round = (value: number): number => Math.round(value);

/**
 * Выбирает пару полных недель и считает динамику.
 * Если последняя неделя неполная — сравниваются weekly[-2] и weekly[-3].
 */
export function resolveTrendContext(weekly: WeeklyPoint[]): TrendContext {
  if (weekly.length === 0) return EMPTY_TREND_CONTEXT;

  const last = weekly[weekly.length - 1];
  const partial = last.isPartial === true;
  const currentIndex = weekly.length - (partial ? 2 : 1);
  const current = weekly[currentIndex];
  const previous = weekly[currentIndex - 1];

  // Нет пары полных недель или предпоследняя тоже неполная — сравнивать нечего.
  if (!current || !previous || current.isPartial === true || previous.isPartial === true) {
    return {
      ...EMPTY_TREND_CONTEXT,
      state: partial ? 'incomplete-week' : 'no-data',
      currentWeekIsPartial: partial,
    };
  }

  const hasCurrentData = current.sessions > 0 || previous.sessions > 0;
  if (!hasCurrentData) {
    return {
      state: partial ? 'incomplete-week' : 'no-data',
      trendPercent: 0,
      previousPercent: null,
      currentPercent: null,
      hasCurrentData: false,
      currentWeekIsPartial: partial,
    };
  }

  const previousPercent = round(previous.averageCorrect);
  const currentPercent = round(current.averageCorrect);
  const trendPercent =
    previousPercent === 0 ? 0 : round(((currentPercent - previousPercent) / previousPercent) * 100);

  return {
    state: 'trend',
    trendPercent,
    previousPercent,
    currentPercent,
    hasCurrentData: true,
    currentWeekIsPartial: partial,
  };
}

/**
 * Человеческая формулировка динамики.
 * Никогда не пишет «снижение на 100%» там, где данных за период просто нет.
 */
export function formatTrendLabel(context: TrendContext): string {
  if (context.state === 'incomplete-week') return 'Текущая неделя не завершена';
  if (context.state === 'no-data' || !context.hasCurrentData) return 'Нет данных за период';

  if (context.trendPercent === 0) return 'Без изменений';

  // Конкретика «с X% до Y%» доступна только когда известны обе точки.
  if (context.previousPercent === null || context.currentPercent === null) {
    const absolute = Math.abs(Math.round(context.trendPercent));
    return context.trendPercent < 0 ? `Снижение на ${absolute}%` : `Рост на ${absolute}%`;
  }

  const from = context.previousPercent;
  const to = context.currentPercent;
  return context.trendPercent < 0 ? `Снижение с ${from}% до ${to}%` : `Рост с ${from}% до ${to}%`;
}

/** Контекст динамики из «плоских» значений — для DTO, где недельного ряда под рукой нет. */
export function trendContextFromValues(input: {
  trendPercent: number;
  previousPercent?: number | null;
  currentPercent?: number | null;
  hasCurrentData?: boolean;
  currentWeekIsPartial?: boolean;
}): TrendContext {
  const previousPercent = input.previousPercent ?? null;
  const currentPercent = input.currentPercent ?? null;
  const hasCurrentData =
    input.hasCurrentData ?? (previousPercent !== null && currentPercent !== null);
  // Явное «данных нет» всегда сильнее числа: именно оттуда бралось ложное −100%.
  const explicitlyEmpty = input.hasCurrentData === false;

  if (explicitlyEmpty || (!hasCurrentData && input.trendPercent === 0)) {
    return {
      ...EMPTY_TREND_CONTEXT,
      state: input.currentWeekIsPartial ? 'incomplete-week' : 'no-data',
      currentWeekIsPartial: input.currentWeekIsPartial ?? false,
    };
  }

  return {
    state: hasCurrentData || input.trendPercent !== 0 ? 'trend' : 'no-data',
    trendPercent: input.trendPercent,
    previousPercent,
    currentPercent,
    hasCurrentData: true,
    currentWeekIsPartial: input.currentWeekIsPartial ?? false,
  };
}
