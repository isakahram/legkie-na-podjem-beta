import { getISODay, parseISO } from 'date-fns';
import type {
  AttentionReason,
  AttentionThresholds,
  PatientAttention,
  PatientSummary,
  WeeklyPoint,
} from '../../src/types.ts';
import type { TrendContext } from '../../src/shared/trend.ts';
import { formatTrendLabel, resolveTrendContext, trendContextFromValues } from '../../src/shared/trend.ts';

/**
 * Пороговые значения по умолчанию для списка «Требуют внимания».
 * Специалист может переопределить их в настройках уведомлений.
 */
export const DEFAULT_ATTENTION_THRESHOLDS: AttentionThresholds = {
  missedDays: 3,
  declinePercent: -10,
  minAdherencePercent: 50,
};

/** Безопасное слияние пользовательских порогов с дефолтными. */
export function resolveThresholds(raw: unknown): AttentionThresholds {
  if (!raw || typeof raw !== 'object') return DEFAULT_ATTENTION_THRESHOLDS;
  const source = raw as Record<string, unknown>;
  const pickNumber = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  return {
    missedDays: pickNumber(source.missedDaysThreshold ?? source.missedDays, DEFAULT_ATTENTION_THRESHOLDS.missedDays),
    declinePercent: pickNumber(
      source.declineTrendPercent ?? source.declinePercent,
      DEFAULT_ATTENTION_THRESHOLDS.declinePercent,
    ),
    minAdherencePercent: pickNumber(
      source.minAdherencePercent,
      DEFAULT_ATTENTION_THRESHOLDS.minAdherencePercent,
    ),
  };
}

const pluralDays = (count: number): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
};

export function daysSinceLastSession(lastSessionAt: string | null, now: Date): number | null {
  if (!lastSessionAt) return null;
  const parsed = parseISO(lastSessionAt);
  if (Number.isNaN(parsed.getTime())) return null;

  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const thenUtc = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  const diff = Math.floor((nowUtc - thenUtc) / 86_400_000);
  return Math.max(0, diff);
}

/**
 * Правила попадания ребёнка в список «Требуют внимания».
 * Чистая функция: никакого доступа к БД, поэтому легко покрывается юнит-тестами.
 */
export function evaluateAttention(
  input: { summary: PatientSummary; weekly: WeeklyPoint[] },
  thresholds: AttentionThresholds = DEFAULT_ATTENTION_THRESHOLDS,
  now: Date = new Date(),
): PatientAttention {
  const reasons: AttentionReason[] = [];
  const gap = daysSinceLastSession(input.summary.lastSessionAt, now);
  const hasAnySession = input.weekly.some((point) => point.sessions > 0) || input.summary.lastSessionAt !== null;

  if (!hasAnySession) {
    reasons.push({
      code: 'no_sessions',
      label: 'Занятий ещё не было',
      severity: 'warning',
      value: null,
    });
  } else if (gap !== null && gap > thresholds.missedDays) {
    reasons.push({
      code: 'long_gap',
      label: `Нет занятий ${gap} ${pluralDays(gap)}`,
      severity: gap > thresholds.missedDays * 2 ? 'critical' : 'warning',
      value: gap,
    });
  }

  // Динамика считается только между двумя ПОЛНЫМИ неделями:
  // сравнение незавершённой недели с полной давало ложное «снижение на 100%».
  const weeklyTrend = resolveTrendContext(input.weekly);
  const summaryHasContext = input.summary.trendHasCurrentData !== undefined;
  const trend: TrendContext = summaryHasContext
    ? trendContextFromValues({
        trendPercent: input.summary.trendPercent,
        previousPercent: input.summary.trendPreviousPercent,
        currentPercent: input.summary.trendCurrentPercent,
        hasCurrentData: input.summary.trendHasCurrentData,
        currentWeekIsPartial: input.summary.trendWeekIsPartial,
      })
    : weeklyTrend.state !== 'trend' ||
        weeklyTrend.trendPercent === input.summary.trendPercent ||
        // Ряд с флагами неполных недель — новый формат, он авторитетнее плоского числа.
        input.weekly.some((point) => point.isPartial !== undefined)
      ? weeklyTrend
      : {
          // Сводка посчитана вне недельного ряда — точки неизвестны, но величина валидна.
          state: 'trend',
          trendPercent: input.summary.trendPercent,
          previousPercent: null,
          currentPercent: null,
          hasCurrentData: true,
          currentWeekIsPartial: weeklyTrend.currentWeekIsPartial,
        };

  const declined = trend.state === 'trend' && trend.trendPercent <= thresholds.declinePercent;
  // Данных за сравниваемый период нет: это не падение, но врач должен об этом знать.
  const missingPeriodData = trend.state !== 'trend' && !trend.hasCurrentData;

  if (hasAnySession && (declined || missingPeriodData)) {
    reasons.push({
      code: 'declining_trend',
      // Значение остаётся в value, меняется только формулировка.
      label: formatTrendLabel(trend),
      severity: declined ? 'critical' : 'warning',
      value: trend.state === 'trend' ? trend.trendPercent : null,
    });
  }

  // В начале недели план физически не мог быть выполнен — не считаем это отставанием.
  const dayOfWeek = getISODay(now);
  const weekIsInformative = dayOfWeek >= 3;

  if (weekIsInformative && hasAnySession && input.summary.adherencePercent < thresholds.minAdherencePercent) {
    reasons.push({
      code: 'low_adherence',
      label: `Регулярность ${input.summary.adherencePercent}% от плана`,
      severity: 'warning',
      value: input.summary.adherencePercent,
    });
  }

  return {
    needsAttention: reasons.length > 0,
    reasons,
    daysSinceLastSession: gap,
  };
}
