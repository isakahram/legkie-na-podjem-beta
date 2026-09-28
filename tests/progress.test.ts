import { describe, expect, it } from 'vitest';
import { AppDatabase } from '../server/db.ts';
import type { SessionPayload } from '../src/types.ts';

/** «Пустой» демо-ребёнок из сида — без предзаполненных сессий. */
const CHILD_ID = 'child-cloud';

const basePayload = (overrides: Partial<SessionPayload>): SessionPayload => ({
  childId: CHILD_ID,
  startedAt: new Date().toISOString(),
  durationSeconds: 90,
  breathCount: 6,
  averageStrength: 0.6,
  averageBreathDuration: 2.4,
  bestDuration: 3.1,
  averageStability: 70,
  correctBreathPercent: 80,
  completedBreaths: 6,
  targetBreaths: 8,
  coinsCollected: 5,
  averageLatencyMs: 60,
  maxLatencyMs: 100,
  technicalPauses: 0,
  status: 'completed',
  inputMode: 'microphone',
  ...overrides,
});

const daysAgoIso = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
};

describe('честная автовыдача скинов-эффектов', () => {
  it('без прогресса скины-эффекты остаются недоступны', () => {
    const db = new AppDatabase(':memory:');
    db.grantProgressSkins(CHILD_ID);
    const child = db.getChild(CHILD_ID)!;
    expect(child.skins.find((skin) => skin.id === 'glow')!.owned).toBe(false);
    expect(child.skins.find((skin) => skin.id === 'sparkles')!.owned).toBe(false);
    expect(child.skins.find((skin) => skin.id === 'iridescent')!.owned).toBe(false);
  });

  it('10 завершённых занятий honестно открывают «Переливание»', () => {
    const db = new AppDatabase(':memory:');
    for (let index = 0; index < 10; index += 1) {
      db.insertSession(basePayload({ startedAt: daysAgoIso(index * 3), completedBreaths: 2 }));
    }
    db.grantProgressSkins(CHILD_ID);
    const child = db.getChild(CHILD_ID)!;
    expect(child.skins.find((skin) => skin.id === 'iridescent')!.owned).toBe(true);
    // Побочных разблокировок быть не должно: выдохов и стрика недостаточно.
    expect(child.skins.find((skin) => skin.id === 'sparkles')!.owned).toBe(false);
    expect(child.skins.find((skin) => skin.id === 'glow')!.owned).toBe(false);
  });

  it('9 занятий ещё не открывают «Переливание» — условие не «почти», а честное', () => {
    const db = new AppDatabase(':memory:');
    for (let index = 0; index < 9; index += 1) {
      db.insertSession(basePayload({ startedAt: daysAgoIso(index * 3) }));
    }
    db.grantProgressSkins(CHILD_ID);
    expect(db.getChild(CHILD_ID)!.skins.find((skin) => skin.id === 'iridescent')!.owned).toBe(false);
  });

  it('30 ровных выдохов, накопленных за несколько обычных занятий, открывают «Искры»', () => {
    // Одно занятие не может дать 30 выдохов (валидация API ограничивает 20 за раз) —
    // поэтому прогресс должен быть честно накопительным, а не «за один заход».
    const db = new AppDatabase(':memory:');
    for (let index = 0; index < 5; index += 1) {
      db.insertSession(basePayload({ startedAt: daysAgoIso(index * 2), completedBreaths: 6 }));
    }
    db.grantProgressSkins(CHILD_ID);
    expect(db.getChild(CHILD_ID)!.skins.find((skin) => skin.id === 'sparkles')!.owned).toBe(true);
  });

  it('29 накопленных выдохов ещё не открывают «Искры»', () => {
    const db = new AppDatabase(':memory:');
    for (let index = 0; index < 5; index += 1) {
      db.insertSession(basePayload({ startedAt: daysAgoIso(index * 2), completedBreaths: index === 0 ? 5 : 6 }));
    }
    db.grantProgressSkins(CHILD_ID);
    expect(db.getChild(CHILD_ID)!.skins.find((skin) => skin.id === 'sparkles')!.owned).toBe(false);
  });

  it('7 занятий подряд открывают «Сияние»', () => {
    const db = new AppDatabase(':memory:');
    for (let index = 0; index < 7; index += 1) {
      db.insertSession(basePayload({ startedAt: daysAgoIso(index) }));
    }
    db.grantProgressSkins(CHILD_ID);
    expect(db.getChild(CHILD_ID)!.skins.find((skin) => skin.id === 'glow')!.owned).toBe(true);
  });

  it('пропуск дня рвёт стрик — 4 подряд и провал не считаются 7 днями', () => {
    const db = new AppDatabase(':memory:');
    [0, 1, 2, 3, 6, 7, 8].forEach((day) => db.insertSession(basePayload({ startedAt: daysAgoIso(day) })));
    db.grantProgressSkins(CHILD_ID);
    expect(db.getChild(CHILD_ID)!.skins.find((skin) => skin.id === 'glow')!.owned).toBe(false);
  });

  it('демо-сессии не приближают разблокировку прогресс-скинов', () => {
    const db = new AppDatabase(':memory:');
    for (let index = 0; index < 12; index += 1) {
      db.insertSession(basePayload({ startedAt: daysAgoIso(index * 3), inputMode: 'demo', completedBreaths: 40 }));
    }
    db.grantProgressSkins(CHILD_ID);
    const child = db.getChild(CHILD_ID)!;
    expect(child.skins.find((skin) => skin.id === 'iridescent')!.owned).toBe(false);
    expect(child.skins.find((skin) => skin.id === 'sparkles')!.owned).toBe(false);
  });
});
