import {
  endOfWeek,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Assignment, PatientSummary, SessionRecord, WeeklyPoint } from '../src/types.ts';

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const round = (value: number, precision = 0): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

/**
 * Calculates clinician-facing metrics from completed microphone sessions only.
 * Demo sessions remain visible in the log but never affect health-adjacent summaries.
 */
export function calculatePatientAnalytics(
  sessions: SessionRecord[],
  assignment: Assignment,
  now = new Date(),
): { summary: PatientSummary; weekly: WeeklyPoint[] } {
  const eligible = sessions.filter(
    (session) => session.status === 'completed' && session.inputMode === 'microphone',
  );
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const thisWeek = eligible.filter((session) => {
    const date = parseISO(session.startedAt);
    return !isBefore(date, currentWeekStart) && !isAfter(date, currentWeekEnd);
  });

  const weekly: WeeklyPoint[] = Array.from({ length: 8 }, (_, index) => {
    const weekStart = startOfWeek(subWeeks(now, 7 - index), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
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
      cycles: inWeek.reduce((sum, session) => sum + session.completedCycles, 0),
      targetCycles: assignment.cyclesPerSession * assignment.sessionsPerWeek,
    };
  });

  const previous = weekly.at(-2)?.averageCorrect ?? 0;
  const current = weekly.at(-1)?.averageCorrect ?? 0;
  const lastSession = [...eligible].sort(
    (a, b) => parseISO(b.startedAt).getTime() - parseISO(a.startedAt).getTime(),
  )[0];
  const totalCompletedCycles = eligible.reduce((sum, session) => sum + session.completedCycles, 0);
  const totalTargetCycles = eligible.reduce((sum, session) => sum + session.targetCycles, 0);

  return {
    summary: {
      sessionsThisWeek: thisWeek.length,
      targetSessions: assignment.sessionsPerWeek,
      adherencePercent: Math.min(100, round((thisWeek.length / assignment.sessionsPerWeek) * 100)),
      averageCorrectPercent: round(average(eligible.map((session) => session.correctBreathPercent))),
      averageBreathDuration: round(average(eligible.map((session) => session.averageBreathDuration)), 1),
      averageSessionDuration: round(average(eligible.map((session) => session.durationSeconds))),
      cycleCompletionPercent:
        totalTargetCycles === 0 ? 0 : Math.min(100, round((totalCompletedCycles / totalTargetCycles) * 100)),
      missedThisWeek: Math.max(0, assignment.sessionsPerWeek - thisWeek.length),
      lastSessionAt: lastSession?.startedAt ?? null,
      trendPercent: previous === 0 ? 0 : round(((current - previous) / previous) * 100),
    },
    weekly,
  };
}
