import { isAfter, parseISO, startOfWeek, subDays, subWeeks } from 'date-fns';
import type {
  AttentionThresholds,
  DashboardAttentionItem,
  DashboardDto,
  DashboardPeriod,
  DashboardRecentSession,
  DashboardSeriesPoint,
  PatientAttention,
  PatientSummary,
  SessionRecord,
  WeeklyPoint,
} from '../../src/types.ts';
import { DEFAULT_ATTENTION_THRESHOLDS, evaluateAttention } from './attention.ts';

export interface DashboardPatientInput {
  id: string;
  pseudonym: string;
  avatar: string;
  sessionsPerWeek: number;
  targetBreaths: number;
  summary: PatientSummary;
  weekly: WeeklyPoint[];
  sessions: SessionRecord[];
}

/** Ребёнок считается активным, если занимался за последние 14 дней. */
const ACTIVE_WINDOW_DAYS = 14;

const PERIOD_WEEKS: Record<DashboardPeriod, number> = {
  week: 1,
  month: 4,
  '8weeks': 8,
};

export function parsePeriod(raw: unknown): DashboardPeriod {
  return raw === 'week' || raw === 'month' || raw === '8weeks' ? raw : 'week';
}

/** Начало периода: понедельник недели, с которой начинается отсчёт. */
export function periodStart(period: DashboardPeriod, now: Date): Date {
  return startOfWeek(subWeeks(now, PERIOD_WEEKS[period] - 1), { weekStartsOn: 1 });
}

const isCountable = (session: SessionRecord): boolean =>
  session.status === 'completed' && session.inputMode === 'microphone';

const round = (value: number): number => Math.round(value);

/**
 * Сводка по всем пациентам специалиста.
 * Чистая функция над уже посчитанной аналитикой каждого пациента.
 */
export function buildDashboard(
  patients: DashboardPatientInput[],
  options: {
    period?: DashboardPeriod;
    thresholds?: AttentionThresholds;
    now?: Date;
    recentLimit?: number;
  } = {},
): DashboardDto {
  const period = options.period ?? 'week';
  const thresholds = options.thresholds ?? DEFAULT_ATTENTION_THRESHOLDS;
  const now = options.now ?? new Date();
  const recentLimit = options.recentLimit ?? 8;

  const from = periodStart(period, now);
  const activeFrom = subDays(now, ACTIVE_WINDOW_DAYS);
  const weeksInPeriod = PERIOD_WEEKS[period];

  let sessionsInPeriod = 0;
  let targetSessionsInPeriod = 0;
  let activePatients = 0;
  const adherenceValues: number[] = [];
  const attention: DashboardAttentionItem[] = [];
  const recentPool: DashboardRecentSession[] = [];

  for (const patient of patients) {
    const countable = patient.sessions.filter(isCountable);

    const inPeriod = countable.filter((session) => isAfter(parseISO(session.startedAt), from));
    sessionsInPeriod += inPeriod.length;
    targetSessionsInPeriod += patient.sessionsPerWeek * weeksInPeriod;

    if (countable.some((session) => isAfter(parseISO(session.startedAt), activeFrom))) {
      activePatients += 1;
    }

    adherenceValues.push(patient.summary.adherencePercent);

    const verdict: PatientAttention = evaluateAttention(
      { summary: patient.summary, weekly: patient.weekly },
      thresholds,
      now,
    );
    if (verdict.needsAttention) {
      attention.push({
        patientId: patient.id,
        pseudonym: patient.pseudonym,
        avatar: patient.avatar,
        reasons: verdict.reasons,
        daysSinceLastSession: verdict.daysSinceLastSession,
      });
    }

    for (const session of countable) {
      recentPool.push({
        id: session.id,
        patientId: patient.id,
        pseudonym: patient.pseudonym,
        startedAt: session.startedAt,
        durationSeconds: session.durationSeconds,
        completedBreaths: session.completedBreaths ?? session.completedCycles ?? 0,
        targetBreaths: session.targetBreaths ?? session.targetCycles ?? patient.targetBreaths,
        averageStability: session.averageStability,
      });
    }
  }

  // Общая динамика за 8 недель: складываем недельные точки всех пациентов.
  const series: DashboardSeriesPoint[] = [];
  const weekCount = patients[0]?.weekly.length ?? 8;
  for (let index = 0; index < weekCount; index += 1) {
    const points = patients.map((patient) => patient.weekly[index]).filter(Boolean);
    if (points.length === 0) continue;
    series.push({
      week: points[0].week,
      label: points[0].label,
      sessions: points.reduce((sum, point) => sum + point.sessions, 0),
      target: points.reduce((sum, point) => sum + point.target, 0),
    });
  }

  const criticalFirst = (item: DashboardAttentionItem): number =>
    item.reasons.some((reason) => reason.severity === 'critical') ? 0 : 1;

  attention.sort(
    (a, b) =>
      criticalFirst(a) - criticalFirst(b) ||
      (b.daysSinceLastSession ?? Number.MAX_SAFE_INTEGER) - (a.daysSinceLastSession ?? Number.MAX_SAFE_INTEGER),
  );

  recentPool.sort((a, b) => parseISO(b.startedAt).getTime() - parseISO(a.startedAt).getTime());

  return {
    period,
    generatedAt: now.toISOString(),
    kpi: {
      activePatients,
      totalPatients: patients.length,
      sessionsInPeriod,
      targetSessionsInPeriod,
      averageAdherencePercent:
        adherenceValues.length === 0
          ? 0
          : round(adherenceValues.reduce((sum, value) => sum + value, 0) / adherenceValues.length),
      missedSessions: Math.max(0, targetSessionsInPeriod - sessionsInPeriod),
      attentionCount: attention.length,
    },
    series,
    attention,
    recentSessions: recentPool.slice(0, recentLimit),
  };
}
