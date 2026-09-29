import { endOfWeek, isAfter, isBefore, parseISO, startOfWeek, subWeeks } from 'date-fns';
import type {
  PeriodComparison,
  PeriodMetrics,
  PlanFactPoint,
  ReportSummary,
  SessionRecord,
  SessionsQuery,
  WeeklyPoint,
} from '../../src/types.ts';

/** Только завершённые занятия с микрофона влияют на клинические показатели. */
export const isCountableSession = (session: SessionRecord): boolean =>
  session.status === 'completed' && session.inputMode === 'microphone';

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const averageOrNull = (values: Array<number | null>, precision = 1): number | null => {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (known.length === 0) return null;
  const factor = 10 ** precision;
  return Math.round(average(known) * factor) / factor;
};

const breathsOf = (session: SessionRecord): number =>
  session.completedBreaths ?? session.completedCycles ?? 0;

const inRange = (session: SessionRecord, from: Date, to: Date): boolean => {
  const date = parseISO(session.startedAt);
  return !isBefore(date, from) && !isAfter(date, to);
};

/** Сводные показатели за произвольный отрезок времени. */
export function periodMetrics(
  sessions: SessionRecord[],
  from: Date,
  to: Date,
  sessionsPerWeek: number,
  weeks: number,
): PeriodMetrics {
  const selected = sessions.filter(isCountableSession).filter((session) => inRange(session, from, to));
  const plan = Math.max(1, sessionsPerWeek * weeks);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    sessions: selected.length,
    averageBreathDuration: averageOrNull(selected.map((session) => session.averageBreathDuration)),
    averageStability: averageOrNull(selected.map((session) => session.averageStability), 0),
    averageSessionDuration: Math.round(average(selected.map((session) => session.durationSeconds))),
    totalBreaths: selected.reduce((sum, session) => sum + breathsOf(session), 0),
    adherencePercent: Math.min(100, Math.round((selected.length / plan) * 100)),
  };
}

const percentDelta = (current: number | null, previous: number | null): number | null => {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
};

/**
 * Сравнение текущих двух недель с двумя предыдущими.
 * Две недели — компромисс между шумом отдельного занятия и запаздыванием месяца.
 */
export function compareRecentPeriods(
  sessions: SessionRecord[],
  sessionsPerWeek: number,
  now = new Date(),
  weeks = 2,
): PeriodComparison {
  const currentFrom = startOfWeek(subWeeks(now, weeks - 1), { weekStartsOn: 1 });
  const currentTo = endOfWeek(now, { weekStartsOn: 1 });
  const previousFrom = startOfWeek(subWeeks(now, weeks * 2 - 1), { weekStartsOn: 1 });
  const previousTo = endOfWeek(subWeeks(now, weeks), { weekStartsOn: 1 });

  const current = periodMetrics(sessions, currentFrom, currentTo, sessionsPerWeek, weeks);
  const previous = periodMetrics(sessions, previousFrom, previousTo, sessionsPerWeek, weeks);

  return {
    current,
    previous,
    delta: {
      sessions: percentDelta(current.sessions, previous.sessions),
      averageBreathDuration: percentDelta(current.averageBreathDuration, previous.averageBreathDuration),
      averageStability: percentDelta(current.averageStability, previous.averageStability),
      totalBreaths: percentDelta(current.totalBreaths, previous.totalBreaths),
      adherencePercent: percentDelta(current.adherencePercent, previous.adherencePercent),
    },
  };
}

/** План против факта по неделям: занятия и выдохи. */
export function buildPlanFact(
  weekly: WeeklyPoint[],
  sessionsPerWeek: number,
  targetBreaths: number,
): PlanFactPoint[] {
  return weekly.map((point) => ({
    week: point.week,
    label: point.label,
    factSessions: point.sessions,
    planSessions: sessionsPerWeek,
    factBreaths: point.breaths,
    planBreaths: sessionsPerWeek * targetBreaths,
    isPartial: point.isPartial === true,
  }));
}

/** Фильтрация журнала занятий по датам, длительности и числу выдохов. */
export function filterSessions(sessions: SessionRecord[], query: SessionsQuery = {}): SessionRecord[] {
  const from = query.from ? parseISO(query.from) : null;
  const to = query.to ? parseISO(query.to) : null;

  return sessions.filter((session) => {
    const date = parseISO(session.startedAt);
    if (from && isBefore(date, from)) return false;
    if (to && isAfter(date, to)) return false;
    if (query.minDurationSeconds !== undefined && session.durationSeconds < query.minDurationSeconds) return false;
    if (query.maxDurationSeconds !== undefined && session.durationSeconds > query.maxDurationSeconds) return false;
    if (query.minBreaths !== undefined && breathsOf(session) < query.minBreaths) return false;
    if (query.patientId && session.childId !== query.patientId) return false;
    return true;
  });
}

/** Постраничная выдача журнала занятий. */
export function paginateSessions(
  sessions: SessionRecord[],
  page = 1,
  pageSize = 20,
): { items: SessionRecord[]; total: number; page: number; pageSize: number } {
  const total = sessions.length;
  const size = Math.min(200, Math.max(1, Math.floor(pageSize)));
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(pages, Math.max(1, Math.floor(page)));
  const offset = (current - 1) * size;
  return { items: sessions.slice(offset, offset + size), total, page: current, pageSize: size };
}

/** Структурированная сводка для раздела «Отчёты». */
export function buildReportSummary(
  sessions: SessionRecord[],
  weekly: WeeklyPoint[],
  options: {
    from: Date;
    to: Date;
    sessionsPerWeek: number;
    trendPercent: number;
    trendPreviousPercent?: number | null;
    trendCurrentPercent?: number | null;
    trendHasCurrentData?: boolean;
    trendWeekIsPartial?: boolean;
  },
): ReportSummary {
  const selected = sessions.filter(isCountableSession).filter((session) => inRange(session, options.from, options.to));
  const weeks = Math.max(1, Math.round((options.to.getTime() - options.from.getTime()) / (7 * 86_400_000)));
  const weeksInRange = weekly.filter((point) => {
    const start = parseISO(point.week);
    return !isBefore(start, options.from) && !isAfter(start, options.to);
  });

  return {
    periodStart: options.from.toISOString(),
    periodEnd: options.to.toISOString(),
    sessions: selected.length,
    averageAdherencePercent: Math.min(
      100,
      Math.round((selected.length / Math.max(1, options.sessionsPerWeek * weeks)) * 100),
    ),
    averageSessionDuration: Math.round(average(selected.map((session) => session.durationSeconds))),
    averageBreathDuration: averageOrNull(selected.map((session) => session.averageBreathDuration)),
    averageStability: averageOrNull(selected.map((session) => session.averageStability), 0),
    totalBreaths: selected.reduce((sum, session) => sum + breathsOf(session), 0),
    trendPercent: options.trendPercent,
    trendPreviousPercent: options.trendPreviousPercent ?? null,
    trendCurrentPercent: options.trendCurrentPercent ?? null,
    trendHasCurrentData: options.trendHasCurrentData,
    trendWeekIsPartial: options.trendWeekIsPartial,
    weekly: weeksInRange.length > 0 ? weeksInRange : weekly,
  };
}
