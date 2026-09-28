import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../server/db.ts';

let directory = '';
let path = '';

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

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('миграция старой базы', () => {
  it('переносит старые сессии и возвращает новые метрики как null', () => {
    createLegacyDatabase(path);
    const db = new AppDatabase(path);
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
    const _db = new AppDatabase(path);
    const raw = new DatabaseSync(path);
    const columns = (raw.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>)
      .map((column) => column.name);
    raw.close();
    expect(columns).toContain('obstacles_avoided');
    expect(columns).toContain('average_stability');
    expect(_db.listSessions()).toHaveLength(1);
  });

  it('записывает новую сессию с null-метриками', () => {
    const db = new AppDatabase(path);
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
});
