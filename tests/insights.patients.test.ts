import { describe, expect, it } from 'vitest';
import { applyPatientFilter, applyPatientSort, queryPatients } from '../server/insights/patients.ts';
import type { PatientListItemWithAttention, PatientSummary } from '../src/types.ts';

const summary = (patch: Partial<PatientSummary> = {}): PatientSummary => ({
  sessionsThisWeek: 2,
  targetSessions: 3,
  adherencePercent: 67,
  averageCorrectPercent: 85,
  averageBreathDuration: 3,
  averageStability: 78,
  averageSessionDuration: 600,
  breathCompletionPercent: 90,
  cycleCompletionPercent: 90,
  missedThisWeek: 1,
  lastSessionAt: '2026-09-29T10:00:00.000Z',
  trendPercent: 5,
  ...patch,
});

const item = (
  id: string,
  pseudonym: string,
  patch: Partial<PatientListItemWithAttention> = {},
): PatientListItemWithAttention => ({
  id,
  pseudonym,
  code: id.toUpperCase(),
  age: 8,
  gender: 'male',
  avatar: 'ПП',
  balance: 10,
  selectedSkin: 'berry',
  createdAt: '2026-02-01T00:00:00.000Z',
  assignment: {
    sessionsPerWeek: 3,
    targetBreaths: 8,
    minCompletedBreathSeconds: 1.5,
    targetBreathDurationMin: 2,
    targetBreathDurationMax: 4,
    validFrom: '2026-02-01T00:00:00.000Z',
    note: null,
  },
  summary: summary(),
  attention: { needsAttention: false, reasons: [], daysSinceLastSession: 1 },
  ...patch,
});

const active = item('p1', 'Артём Л.');
const missed = item('p2', 'Вера Н.', {
  age: 7,
  summary: summary({ lastSessionAt: '2026-09-18T10:00:00.000Z', adherencePercent: 0 }),
  attention: {
    needsAttention: true,
    reasons: [{ code: 'long_gap', label: 'Нет занятий 12 дней', severity: 'critical', value: 12 }],
    daysSinceLastSession: 12,
  },
});
const declining = item('p3', 'Кирилл Ж.', {
  age: 10,
  summary: summary({ trendPercent: -18, adherencePercent: 33 }),
  attention: {
    needsAttention: true,
    reasons: [{ code: 'declining_trend', label: 'Динамика снизилась на 18%', severity: 'critical', value: -18 }],
    daysSinceLastSession: 2,
  },
});

const all = [active, missed, declining];

describe('Фильтры списка пациентов', () => {
  it('«Все» ничего не отсекает', () => {
    expect(applyPatientFilter(all, 'all')).toHaveLength(3);
  });

  it('«Занимаются» оставляет тех, у кого занятие было на этой неделе', () => {
    expect(applyPatientFilter(all, 'active').map((patient) => patient.id)).toEqual(['p1', 'p3']);
  });

  it('«Пропуски» опирается на причины внимания', () => {
    expect(applyPatientFilter(all, 'missed').map((patient) => patient.id)).toEqual(['p2']);
  });

  it('«Спад динамики» отбирает отрицательный тренд', () => {
    expect(applyPatientFilter(all, 'declining').map((patient) => patient.id)).toEqual(['p3']);
  });

  it('«Требуют внимания» собирает всех помеченных', () => {
    expect(applyPatientFilter(all, 'attention').map((patient) => patient.id)).toEqual(['p2', 'p3']);
  });
});

describe('Сортировка списка пациентов', () => {
  it('по последней сессии от новых к старым', () => {
    expect(applyPatientSort(all, 'lastSession', 'desc').map((patient) => patient.id)).toEqual(['p1', 'p3', 'p2']);
  });

  it('по регулярности по возрастанию', () => {
    expect(applyPatientSort(all, 'adherence', 'asc').map((patient) => patient.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('по возрасту', () => {
    expect(applyPatientSort(all, 'age', 'asc').map((patient) => patient.age)).toEqual([7, 8, 10]);
  });

  it('по псевдониму с русской локалью', () => {
    expect(applyPatientSort(all, 'pseudonym', 'asc').map((patient) => patient.pseudonym)).toEqual([
      'Артём Л.',
      'Вера Н.',
      'Кирилл Ж.',
    ]);
  });

  it('исходный массив не мутируется', () => {
    const before = all.map((patient) => patient.id);
    applyPatientSort(all, 'age', 'asc');
    expect(all.map((patient) => patient.id)).toEqual(before);
  });
});

describe('Поиск и пагинация', () => {
  it('поиск нечувствителен к регистру и работает по коду', () => {
    expect(queryPatients(all, { search: 'вера' }).total).toBe(1);
    expect(queryPatients(all, { search: 'P3' }).total).toBe(1);
    expect(queryPatients(all, { search: 'никого' }).items).toHaveLength(0);
  });

  it('страницы нарезаются по pageSize', () => {
    const first = queryPatients(all, { pageSize: 2, sort: 'age', direction: 'asc' });
    expect(first.items.map((patient) => patient.id)).toEqual(['p2', 'p1']);
    expect(first.total).toBe(3);
    expect(first.page).toBe(1);

    const second = queryPatients(all, { pageSize: 2, page: 2, sort: 'age', direction: 'asc' });
    expect(second.items.map((patient) => patient.id)).toEqual(['p3']);
  });

  it('номер страницы за пределами диапазона прижимается к последней', () => {
    expect(queryPatients(all, { pageSize: 2, page: 99 }).page).toBe(2);
    expect(queryPatients(all, { pageSize: 2, page: -5 }).page).toBe(1);
  });

  it('фильтр и поиск применяются вместе', () => {
    const result = queryPatients(all, { filter: 'attention', search: 'Кирилл' });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe('p3');
  });
});
