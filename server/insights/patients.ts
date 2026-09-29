import { parseISO } from 'date-fns';
import type {
  AttentionThresholds,
  PatientListItemWithAttention,
  PatientListResponse,
  PatientsFilter,
  PatientsQuery,
  PatientsSort,
  SessionRecord,
  WeeklyPoint,
} from '../../src/types.ts';
import { calculatePatientAnalytics } from '../analytics.ts';
import type { AppDatabase } from '../db.ts';
import { evaluateAttention, resolveThresholds } from './attention.ts';
import type { DashboardPatientInput } from './dashboard.ts';

export interface PatientView extends DashboardPatientInput {
  item: PatientListItemWithAttention;
}

/**
 * Единая точка сборки данных пациента для кабинета: назначение → аналитика → метки внимания.
 * Возвращает и «плоский» DTO для списка, и сырьё для дашборда.
 */
export function buildPatientViews(
  database: AppDatabase,
  userId: string,
  options: { thresholds?: AttentionThresholds; now?: Date } = {},
): PatientView[] {
  const now = options.now ?? new Date();
  const thresholds = options.thresholds ?? resolveThresholds(database.getSpecialistSettings(userId).notifications);

  return database.listPatientsForUser(userId).map((patient) => {
    const sessions: SessionRecord[] = database.listSessions(patient.id);
    const analytics = calculatePatientAnalytics(
      sessions,
      {
        sessionsPerWeek: patient.assignment.sessionsPerWeek,
        targetBreaths: patient.assignment.targetBreaths,
        cyclesPerSession: patient.assignment.targetBreaths,
        recommendedDurationSeconds: 600,
      },
      now,
    );
    const weekly: WeeklyPoint[] = analytics.weekly;
    const attention = evaluateAttention({ summary: analytics.summary, weekly }, thresholds, now);

    return {
      id: patient.id,
      pseudonym: patient.pseudonym,
      avatar: patient.avatar,
      sessionsPerWeek: patient.assignment.sessionsPerWeek,
      targetBreaths: patient.assignment.targetBreaths,
      summary: analytics.summary,
      weekly,
      sessions,
      item: { ...patient, summary: analytics.summary, attention },
    };
  });
}

const timeOf = (value: string | null): number => (value ? parseISO(value).getTime() : 0);

/** Фильтрация списка пациентов по вкладкам кабинета. */
export function applyPatientFilter(
  items: PatientListItemWithAttention[],
  filter: PatientsFilter,
): PatientListItemWithAttention[] {
  switch (filter) {
    case 'active':
      return items.filter(
        (item) => item.attention.daysSinceLastSession !== null && item.attention.daysSinceLastSession <= 7,
      );
    case 'missed':
      return items.filter((item) =>
        item.attention.reasons.some((reason) => reason.code === 'long_gap' || reason.code === 'no_sessions'),
      );
    case 'declining':
      return items.filter((item) => item.summary.trendPercent < 0);
    case 'attention':
      return items.filter((item) => item.attention.needsAttention);
    default:
      return items;
  }
}

/** Сортировка списка пациентов. */
export function applyPatientSort(
  items: PatientListItemWithAttention[],
  sort: PatientsSort,
  direction: 'asc' | 'desc',
): PatientListItemWithAttention[] {
  const factor = direction === 'asc' ? 1 : -1;
  const sorted = [...items];
  sorted.sort((a, b) => {
    switch (sort) {
      case 'adherence':
        return (a.summary.adherencePercent - b.summary.adherencePercent) * factor;
      case 'age':
        return (a.age - b.age) * factor;
      case 'pseudonym':
        return a.pseudonym.localeCompare(b.pseudonym, 'ru') * factor;
      default:
        return (timeOf(a.summary.lastSessionAt) - timeOf(b.summary.lastSessionAt)) * factor;
    }
  });
  return sorted;
}

// Держим в согласии с максимумом pageSize в Zod-схеме server/routes/v1/patients.ts —
// клиент запрашивает pageSize=200 для фильтра «Ребёнок» на странице «Занятия».
const PAGE_SIZE_LIMIT = 500;

/** Поиск, фильтры, сортировка и пагинация списка пациентов. */
export function queryPatients(
  items: PatientListItemWithAttention[],
  query: PatientsQuery = {},
): PatientListResponse {
  const search = (query.search ?? '').trim().toLowerCase();
  let result = items;

  if (search) {
    result = result.filter(
      (item) =>
        item.pseudonym.toLowerCase().includes(search) || item.code.toLowerCase().includes(search),
    );
  }

  result = applyPatientFilter(result, query.filter ?? 'all');
  result = applyPatientSort(result, query.sort ?? 'lastSession', query.direction ?? 'desc');

  const total = result.length;
  const pageSize = Math.min(PAGE_SIZE_LIMIT, Math.max(1, Math.floor(query.pageSize ?? 10)));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(query.page ?? 1)));
  const offset = (page - 1) * pageSize;

  return {
    items: result.slice(offset, offset + pageSize),
    total,
    page,
    pageSize,
  };
}
