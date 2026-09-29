import { format, isAfter, isBefore, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Assignment, PatientSummary, SessionRecord, WeeklyPoint } from '../src/types.ts';
import { resolveTrendContext } from '../src/shared/trend.ts';

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * Среднее по метрике, которой может не быть в старых записях.
 * Пустой набор даёт null, а не 0: отсутствие данных — не нулевой результат.
 */
const averageOrNull = (values: Array<number | null>, precision = 0): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : round(average(known), precision);
};

const round = (value: number, precision = 0): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

/** Понедельник ISO-недели для указанной даты, 00:00:00.000 UTC. */
const startOfWeekUtc = (date: Date): Date => {
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - (isoDay - 1),
    ),
  );
};

/** Воскресенье ISO-недели для указанной даты, 23:59:59.999 UTC. */
const endOfWeekUtc = (date: Date): Date => {
  const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  const daysUntilSunday = 7 - isoDay;
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + daysUntilSunday,
      23,
      59,
      59,
      999,
    ),
  );
};

/** Сдвиг даты на N недель назад в UTC (сохраняет день недели). */
const subWeeksUtc = (date: Date, weeks: number): Date =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - weeks * 7,
    ),
  );

/**
 * Calculates clinician-facing metrics from completed microphone sessions only.
 * Demo sessions remain visible in the log but never affect health-adjacent summaries.
 */
export function calculatePatientAnalytics(
  sessions: SessionRecord[],
  assignment: Assignment,
  now = new Date(),
): { summary: PatientSummary; weekly: WeeklyPoint[] } {
  const targetBreaths = assignment.targetBreaths ?? assignment.cyclesPerSession ?? 8;
  const eligible = sessions.filter(
    (session) => session.status === 'completed' && session.inputMode === 'microphone',
  );
  const currentWeekStart = startOfWeekUtc(now);
  const currentWeekEnd = endOfWeekUtc(now);
  const thisWeek = eligible.filter((session) => {
    const date = parseISO(session.startedAt);
    return !isBefore(date, currentWeekStart) && !isAfter(date, currentWeekEnd);
  });

  const weekly: WeeklyPoint[] = Array.from({ length: 8 }, (_, index) => {
    const weekStart = startOfWeekUtc(subWeeksUtc(now, 7 - index));
    const weekEnd = endOfWeekUtc(weekStart);
    const inWeek = eligible.filter((session) => {
      const date = parseISO(session.startedAt);
      return !isBefore(date, weekStart) && !isAfter(date, weekEnd);
    });
    return {
      week: format(weekStart, 'yyyy-MM-dd'),
      label: format(weekStart, 'd MMM', { locale: ru }),
      sessions: inWeek.length,
      target: assignment.sessionsPerWeek,
      averageCorrect: round(average(inWeek.map((session) => session.correctBreathPercent))),
      averageDuration: round(average(inWeek.map((session) => session.durationSeconds))),
      averageStability: averageOrNull(inWeek.map((session) => session.averageStability)),
      averageBreathDuration: averageOrNull(inWeek.map((session) => session.averageBreathDuration), 1),
      breaths: inWeek.reduce((sum, session) => sum + (session.completedBreaths ?? session.completedCycles ?? 0), 0),
      targetBreaths: targetBreaths * assignment.sessionsPerWeek,
      cycles: inWeek.reduce((sum, session) => sum + (session.completedBreaths ?? session.completedCycles ?? 0), 0),
      targetCycles: targetBreaths * assignment.sessionsPerWeek,
      // Неделя, которая ещё не закончилась, помечается как неполная:
      // по ней нельзя судить о динамике и её нельзя рисовать сплошной линией.
      isPartial: isAfter(weekEnd, now),
    };
  });

  const trend = resolveTrendContext(weekly);
  const lastSession = [...eligible].sort(
    (a, b) => parseISO(b.startedAt).getTime() - parseISO(a.startedAt).getTime(),
  )[0];
  const totalCompletedCycles = eligible.reduce((sum, session) => sum + (session.completedBreaths ?? session.completedCycles ?? 0), 0);
  const totalTargetCycles = eligible.reduce((sum, session) => sum + (session.targetBreaths ?? session.targetCycles ?? targetBreaths), 0);

  return {
    summary: {
      sessionsThisWeek: thisWeek.length,
      targetSessions: assignment.sessionsPerWeek,
      adherencePercent: Math.min(100, round((thisWeek.length / assignment.sessionsPerWeek) * 100)),
      averageCorrectPercent: round(average(eligible.map((session) => session.correctBreathPercent))),
      averageBreathDuration: averageOrNull(eligible.map((session) => session.averageBreathDuration), 1),
      averageStability: averageOrNull(eligible.map((session) => session.averageStability)),
      averageSessionDuration: round(average(eligible.map((session) => session.durationSeconds))),
      breathCompletionPercent:
        totalTargetCycles === 0 ? 0 : Math.min(100, round((totalCompletedCycles / totalTargetCycles) * 100)),
      cycleCompletionPercent: totalTargetCycles === 0 ? 0 : Math.min(100, round((totalCompletedCycles / totalTargetCycles) * 100)),
      missedThisWeek: Math.max(0, assignment.sessionsPerWeek - thisWeek.length),
      lastSessionAt: lastSession?.startedAt ?? null,
      trendPercent: trend.trendPercent,
      trendPreviousPercent: trend.previousPercent,
      trendCurrentPercent: trend.currentPercent,
      trendHasCurrentData: trend.hasCurrentData,
      trendWeekIsPartial: trend.currentWeekIsPartial,
    },
    weekly,
  };
}
