import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { calculatePatientAnalytics } from '../server/analytics.ts';
import { AppDatabase } from '../server/db.ts';

let directory = '';
let dbPath = '';

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'legkie-demo-'));
  dbPath = join(directory, 'test.sqlite');
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('Демо-данные: 5 клинических сценариев на 8 недель', () => {
  it('Сценарий 1: Стабильный прогресс (patient-progress)', () => {
    const db = new AppDatabase(dbPath);
    const child = db.getChild('patient-progress')!;
    expect(child).not.toBeNull();
    const sessions = db.listSessions(child.id);
    expect(sessions.length).toBeGreaterThanOrEqual(20);

    const analytics = calculatePatientAnalytics(sessions, child.assignment);

    // Выполнение плана и положительная динамика
    expect(analytics.summary.adherencePercent).toBeGreaterThanOrEqual(75);
    expect(analytics.summary.averageCorrectPercent).toBeGreaterThanOrEqual(80);

    // Рост длительности и стабильности от первых недель к последним
    const firstWeek = analytics.weekly[0];
    const lastWeek = analytics.weekly[7];
    expect(lastWeek.averageDuration).toBeGreaterThan(firstWeek.averageDuration);
    expect(lastWeek.averageCorrect).toBeGreaterThan(firstWeek.averageCorrect);
    if (lastWeek.averageStability && firstWeek.averageStability) {
      expect(lastWeek.averageStability).toBeGreaterThan(firstWeek.averageStability);
    }
  });

  it('Сценарий 2: Пропуски занятий (patient-skips)', () => {
    const db = new AppDatabase(dbPath);
    const child = db.getChild('patient-skips')!;
    expect(child).not.toBeNull();
    const sessions = db.listSessions(child.id);
    const analytics = calculatePatientAnalytics(sessions, child.assignment);

    // Нерегулярность занятий
    expect(analytics.summary.missedThisWeek).toBeGreaterThan(0);
    expect(analytics.summary.lastSessionAt).not.toBeNull();

    // Последний пропуск больше 3 дней
    const daysSinceLastSession = differenceInCalendarDays(
      new Date(),
      parseISO(analytics.summary.lastSessionAt!),
    );
    expect(daysSinceLastSession).toBeGreaterThanOrEqual(3);
  });

  it('Сценарий 3: Ухудшение динамики (patient-decline)', () => {
    const db = new AppDatabase(dbPath);
    const child = db.getChild('patient-decline')!;
    expect(child).not.toBeNull();
    const sessions = db.listSessions(child.id);
    const analytics = calculatePatientAnalytics(sessions, child.assignment);

    // Отрицательный тренд
    expect(analytics.summary.trendPercent).toBeLessThan(0);

    // Показатели последних недель ниже предыдущих
    const peakWeek = analytics.weekly[4]; // 4-я неделя назад
    const recentWeek = analytics.weekly[7]; // текущая/последняя неделя
    expect(recentWeek.averageCorrect).toBeLessThan(peakWeek.averageCorrect);
  });

  it('Сценарий 4: Новичок (patient-newbie)', () => {
    const db = new AppDatabase(dbPath);
    const child = db.getChild('patient-newbie')!;
    expect(child).not.toBeNull();
    const sessions = db.listSessions(child.id);
    const analytics = calculatePatientAnalytics(sessions, child.assignment);

    // Мало сессий, добавлен недавно
    expect(sessions.length).toBeLessThanOrEqual(3);
    expect(sessions.length).toBeGreaterThan(0);

    // Сессии только в текущей неделе, в прошлых неделях 0
    expect(analytics.weekly.slice(0, 7).every((w) => w.sessions === 0)).toBe(true);
    expect(analytics.weekly[7].sessions).toBeGreaterThan(0);
  });

  it('Сценарий 5: Длительный перерыв (patient-break)', () => {
    const db = new AppDatabase(dbPath);
    const child = db.getChild('patient-break')!;
    expect(child).not.toBeNull();
    const sessions = db.listSessions(child.id);
    const analytics = calculatePatientAnalytics(sessions, child.assignment);

    // В первой половине периода были активные занятия, во второй — 0
    const firstHalfSessions = analytics.weekly.slice(0, 4).reduce((sum, w) => sum + w.sessions, 0);
    const secondHalfSessions = analytics.weekly.slice(4).reduce((sum, w) => sum + w.sessions, 0);

    expect(firstHalfSessions).toBeGreaterThan(5);
    expect(secondHalfSessions).toBe(0);
    expect(analytics.summary.sessionsThisWeek).toBe(0);

    // Последнее занятие было далеко в прошлом
    const daysSinceLast = differenceInCalendarDays(
      new Date(),
      parseISO(analytics.summary.lastSessionAt!),
    );
    expect(daysSinceLast).toBeGreaterThanOrEqual(20);
  });

  it('все демо-пациенты соответствуют возрастной группе 5–10 лет', () => {
    const db = new AppDatabase(dbPath);
    const children = db.listChildren();
    expect(children.length).toBeGreaterThanOrEqual(9);

    for (const child of children) {
      expect(child.age).toBeGreaterThanOrEqual(5);
      expect(child.age).toBeLessThanOrEqual(10);
    }
  });
});
