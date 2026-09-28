import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../server/db.ts';

let directory = '';
let path = '';
const openDatabases: AppDatabase[] = [];

/** Открывает БД и регистрирует её для закрытия в afterEach (важно для Windows). */
const openDatabase = (file: string): AppDatabase => {
  const db = new AppDatabase(file);
  openDatabases.push(db);
  return db;
};

/** Схема, существовавшая до перехода на «Воздушный шар». */
const createLegacyDatabase = (file: string): void => {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE clinicians (id TEXT PRIMARY KEY, display_name TEXT NOT NULL);
    CREATE TABLE children (
      id TEXT PRIMARY KEY,
      clinician_id TEXT NOT NULL REFERENCES clinicians(id),
      code TEXT NOT NULL UNIQUE,
      nickname TEXT NOT NULL,
      age INTEGER NOT NULL CHECK(age BETWEEN 3 AND 17),
      avatar TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
      selected_skin TEXT NOT NULL DEFAULT 'berry'
    );
    CREATE TABLE assignments (
      child_id TEXT PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
      sessions_per_week INTEGER NOT NULL,
      cycles_per_session INTEGER NOT NULL,
      recommended_duration_seconds INTEGER NOT NULL
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      breath_count INTEGER NOT NULL,
      average_strength REAL NOT NULL,
      average_breath_duration REAL NOT NULL,
      correct_breath_percent REAL NOT NULL,
      completed_cycles INTEGER NOT NULL,
      target_cycles INTEGER NOT NULL,
      coins_collected INTEGER NOT NULL,
      obstacles_avoided INTEGER NOT NULL,
      suspicious_events INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('completed', 'stopped')),
      input_mode TEXT NOT NULL CHECK(input_mode IN ('microphone', 'demo'))
    );
    INSERT INTO clinicians VALUES ('clinician-demo', 'Анна Викторовна');
    INSERT INTO children VALUES
      ('child-old', 'clinician-demo', 'СТАРЫЙ', 'Old', 8, 'OL', 5, 'berry');
    INSERT INTO assignments VALUES ('child-old', 3, 8, 300);
    INSERT INTO sessions VALUES (
      'session-old', 'child-old', '2026-09-01T10:00:00.000Z', 60, 8, 0.6, 2.4, 82, 7, 8,
      9, 4, 1, 'completed', 'microphone'
    );
  `);
  db.close();
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'legkie-'));
  path = join(directory, 'legacy.sqlite');
});

afterEach(() => {
  // Windows не удаляет файлы с открытыми дескрипторами — закрываем соединения явно.
  for (const db of openDatabases.splice(0)) {
    try {
      db.close();
    } catch {
      // соединение уже закрыто — игнорируем
    }
  }
  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // уборка временного каталога не должна ронять тесты (антивирус/индексатор на Windows)
  }
});

describe('миграция старой базы', () => {
  it('переносит старые сессии и возвращает новые метрики как null', () => {
    createLegacyDatabase(path);
    const db = openDatabase(path);
    const [session] = db.listSessions('child-old');
    expect(session.id).toBe('session-old');
    expect(session.averageBreathDuration).toBe(2.4);
    expect(session.averageStability).toBeNull();
    expect(session.averageLatencyMs).toBeNull();
    expect(session.maxLatencyMs).toBeNull();
    expect(session.technicalPauses).toBe(1);
    expect(session).not.toHaveProperty('obstaclesAvoided');
  });

  it('сохраняет колонку obstacles_avoided ради безопасной миграции', () => {
    createLegacyDatabase(path);
    const _db = openDatabase(path);
    const raw = new DatabaseSync(path);
    const columns = (raw.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>)
      .map((column) => column.name);
    raw.close();
    expect(columns).toContain('obstacles_avoided');
    expect(columns).toContain('average_stability');
    expect(_db.listSessions()).toHaveLength(1);
  });

  it('записывает новую сессию с null-метриками', () => {
    const db = openDatabase(path);
    const child = db.listChildren()[0];
    const saved = db.insertSession({
      childId: child.id,
      startedAt: '2026-09-29T10:00:00.000Z',
      durationSeconds: 300,
      breathCount: 4,
      averageStrength: 0.5,
      averageBreathDuration: null,
      averageStability: null,
      correctBreathPercent: 0,
      completedCycles: 0,
      targetCycles: child.assignment.cyclesPerSession,
      coinsCollected: 3,
      averageLatencyMs: null,
      maxLatencyMs: null,
      technicalPauses: 0,
      status: 'completed',
      inputMode: 'microphone',
    });
    const stored = db.listSessions(child.id).find((item) => item.id === saved.id)!;
    expect(stored.averageBreathDuration).toBeNull();
    expect(stored.averageStability).toBeNull();
    expect(stored.coinsCollected).toBe(3);
  });

  it('создаёт таблицу schema_migrations и фиксирует применённые миграции', () => {
    const db = openDatabase(path);
    const migrations = db.db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all() as Array<{
      version: number;
      name: string;
    }>;
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations[0].version).toBe(1);
    expect(migrations[0].name).toBe('001_specialist_cabinet_data_model');
  });

  it('сохраняет обратную совместимость для игровых методов: ВЕТЕР7, сессии, калибровка, магазин', () => {
    const db = openDatabase(path);
    // Проверка входа по коду ВЕТЕР7
    const child = db.findChildByCode('ВЕТЕР7');
    expect(child).not.toBeNull();
    expect(child!.nickname).toBe('Миша К.');
    expect(child!.assignment.targetBreaths).toBe(8);
    expect(child!.skins.length).toBeGreaterThan(0);

    // Сохранение калибровки
    db.saveCalibration(child!.id, {
      ambientRms: 0.05,
      breathRms: 0.45,
      breathZcr: 0.12,
      breathCentroid: 1200,
      breathFlatness: 0.3,
      quality: 0.9,
      createdAt: '2026-09-29T11:00:00.000Z',
    });
    const cal = db.latestCalibration(child!.id);
    expect(cal).not.toBeNull();
    expect(cal!.quality).toBe(0.9);

    // Сохранение сессии
    const saved = db.insertSession({
      childId: child!.id,
      startedAt: '2026-09-29T11:05:00.000Z',
      durationSeconds: 120,
      breathCount: 8,
      averageStrength: 0.6,
      averageBreathDuration: 2.5,
      bestDuration: 3.0,
      averageStability: 75,
      correctBreathPercent: 85,
      completedBreaths: 8,
      targetBreaths: 8,
      coinsCollected: 10,
      averageLatencyMs: 50,
      maxLatencyMs: 90,
      technicalPauses: 0,
      status: 'completed',
      inputMode: 'microphone',
    });
    expect(saved.id).toBeTruthy();

    // Магазин: покупка доступного скина
    const initialBalance = db.getChild(child!.id)!.balance;
    db.rewardSession(child!.id, 50);
    const updated = db.buySkin(child!.id, 'sunny');
    expect(updated.skins.find((s) => s.id === 'sunny')!.owned).toBe(true);
    expect(updated.balance).toBe(initialBalance + 50 - 12);
  });

  it('сохраняет 4 базовых демо-пациента и добавляет 5 новых клинических сценариев как отдельных пациентов', () => {
    const db = openDatabase(path);
    // 4 базовых демо-пациента
    expect(db.findChildByCode('ВЕТЕР7')).not.toBeNull();
    expect(db.findChildByCode('ЗВЕЗДА')).not.toBeNull();
    expect(db.findChildByCode('РАДУГА')).not.toBeNull();
    expect(db.findChildByCode('ОБЛАКО')).not.toBeNull();

    // 5 новых отдельных сценариев
    expect(db.findChildByCode('ВЫДОХ1')).not.toBeNull();
    expect(db.findChildByCode('ПОЛЕТ2')).not.toBeNull();
    expect(db.findChildByCode('НЕБО3')).not.toBeNull();
    expect(db.findChildByCode('ЛУЧИК4')).not.toBeNull();
    expect(db.findChildByCode('ВЕТЕРОК5')).not.toBeNull();

    // Всего не менее 9 пациентов в базе
    const all = db.listChildren();
    expect(all.length).toBeGreaterThanOrEqual(9);
  });
});
