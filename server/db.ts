import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { addDays, setHours, startOfWeek, subWeeks } from 'date-fns';
import type {
  CalibrationProfile,
  ChildProfile,
  SessionPayload,
  SessionRecord,
  Skin,
} from '../src/types.ts';

interface ChildRow {
  id: string;
  code: string;
  nickname: string;
  age: number;
  avatar: string;
  balance: number;
  selected_skin: string;
  sessions_per_week: number;
  cycles_per_session: number;
  recommended_duration_seconds: number;
}

interface SessionRow {
  id: string;
  child_id: string;
  started_at: string;
  duration_seconds: number;
  breath_count: number;
  average_strength: number;
  average_breath_duration: number | null;
  correct_breath_percent: number;
  completed_cycles: number;
  target_cycles: number;
  coins_collected: number;
  average_stability: number | null;
  average_latency_ms: number | null;
  max_latency_ms: number | null;
  suspicious_events: number;
  status: 'completed' | 'stopped';
  input_mode: 'microphone' | 'demo';
  child_nickname?: string;
}

const defaultPath = join(process.cwd(), 'data', 'legkie.sqlite');

/**
 * Актуальная схема сессий. Метрики, которых не было в старых записях,
 * допускают NULL: для таких сессий API возвращает null, а не 0.
 * Колонка obstacles_avoided сохранена ради безопасной миграции, но
 * не читается и не попадает в DTO.
 */
const SESSIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    breath_count INTEGER NOT NULL,
    average_strength REAL NOT NULL,
    average_breath_duration REAL,
    average_stability REAL,
    correct_breath_percent REAL NOT NULL,
    completed_cycles INTEGER NOT NULL,
    target_cycles INTEGER NOT NULL,
    coins_collected INTEGER NOT NULL,
    average_latency_ms REAL,
    max_latency_ms REAL,
    obstacles_avoided INTEGER DEFAULT 0,
    suspicious_events INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('completed', 'stopped')),
    input_mode TEXT NOT NULL CHECK(input_mode IN ('microphone', 'demo'))
  );
`;

/** Поля сессии, читаемые из БД. SELECT * не используется намеренно. */
const SESSION_FIELDS = [
  's.id', 's.child_id', 's.started_at', 's.duration_seconds', 's.breath_count',
  's.average_strength', 's.average_breath_duration', 's.average_stability',
  's.correct_breath_percent', 's.completed_cycles', 's.target_cycles',
  's.coins_collected', 's.average_latency_ms', 's.max_latency_ms',
  's.suspicious_events', 's.status', 's.input_mode',
].join(', ');

const CHILD_FIELDS = [
  'c.id', 'c.code', 'c.nickname', 'c.age', 'c.avatar', 'c.balance', 'c.selected_skin',
].join(', ');



export class AppDatabase {
  private readonly db: DatabaseSync;

  constructor(path = defaultPath) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.migrate();
    this.migrateSessions();
    this.seed();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clinicians (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS children (
        id TEXT PRIMARY KEY,
        clinician_id TEXT NOT NULL REFERENCES clinicians(id),
        code TEXT NOT NULL UNIQUE,
        nickname TEXT NOT NULL,
        age INTEGER NOT NULL CHECK(age BETWEEN 3 AND 17),
        avatar TEXT NOT NULL,
        balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
        selected_skin TEXT NOT NULL DEFAULT 'berry'
      );
      CREATE TABLE IF NOT EXISTS assignments (
        child_id TEXT PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
        sessions_per_week INTEGER NOT NULL,
        cycles_per_session INTEGER NOT NULL,
        recommended_duration_seconds INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS skins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        accent TEXT NOT NULL,
        price INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS child_skins (
        child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        skin_id TEXT NOT NULL REFERENCES skins(id),
        PRIMARY KEY (child_id, skin_id)
      );
      CREATE TABLE IF NOT EXISTS calibrations (
        id TEXT PRIMARY KEY,
        child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        ambient_rms REAL NOT NULL,
        breath_rms REAL NOT NULL,
        breath_zcr REAL NOT NULL,
        breath_centroid REAL NOT NULL,
        breath_flatness REAL NOT NULL,
        quality REAL NOT NULL,
        created_at TEXT NOT NULL
      );
      ${SESSIONS_TABLE_SQL}
      CREATE INDEX IF NOT EXISTS idx_sessions_child_date ON sessions(child_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_calibrations_child_date ON calibrations(child_id, created_at DESC);
    `);
  }


  /**
   * Пересобирает таблицу сессий, если она создана до появления новых метрик.
   * Старые записи переносятся как есть, новые колонки остаются NULL.
   */
  private migrateSessions(): void {
    const columns = this.db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
    if (columns.length === 0 || columns.some((column) => column.name === 'average_stability')) return;
    this.db.exec('BEGIN');
    try {
      this.db.exec('ALTER TABLE sessions RENAME TO sessions_legacy;');
      this.db.exec(SESSIONS_TABLE_SQL);
      this.db.exec(`
        INSERT INTO sessions
          (id, child_id, started_at, duration_seconds, breath_count, average_strength,
           average_breath_duration, correct_breath_percent, completed_cycles, target_cycles,
           coins_collected, obstacles_avoided, suspicious_events, status, input_mode)
        SELECT id, child_id, started_at, duration_seconds, breath_count, average_strength,
           average_breath_duration, correct_breath_percent, completed_cycles, target_cycles,
           coins_collected, obstacles_avoided, suspicious_events, status, input_mode
        FROM sessions_legacy;
      `);
      this.db.exec('DROP TABLE sessions_legacy;');
      this.db.exec(
        'CREATE INDEX IF NOT EXISTS idx_sessions_child_date ON sessions(child_id, started_at DESC);',
      );
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private seed(): void {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM children').get() as { count: number };
    if (count.count > 0) return;

    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO clinicians (id, display_name) VALUES (?, ?)').run(
        'clinician-demo',
        'Анна Викторовна',
      );
      const skins = [
        ['berry', 'Ягодка', '#ff6b8b', '#8f3156', 0],
        ['sunny', 'Солнышко', '#ffbf3f', '#ed6c35', 12],
        ['ocean', 'Океан', '#4ecdc4', '#247aa0', 18],
        ['space', 'Космос', '#6c63d9', '#332879', 25],
      ] as const;
      const skinStatement = this.db.prepare(
        'INSERT INTO skins (id, name, color, accent, price) VALUES (?, ?, ?, ?, ?)',
      );
      skins.forEach((skin) => skinStatement.run(...skin));

      const children = [
        ['child-luna', 'ВЕТЕР7', 'Миша К.', 7, 'МК', 28, 'berry', 3, 8, 60],
        ['child-star', 'ЗВЕЗДА', 'Соня П.', 9, 'СП', 41, 'ocean', 4, 10, 75],
        ['child-rain', 'РАДУГА', 'Лёва М.', 6, 'ЛМ', 16, 'sunny', 3, 7, 55],
      ] as const;
      const childStatement = this.db.prepare(
        `INSERT INTO children
          (id, clinician_id, code, nickname, age, avatar, balance, selected_skin)
         VALUES (?, 'clinician-demo', ?, ?, ?, ?, ?, ?)`,
      );
      const assignmentStatement = this.db.prepare(
        `INSERT INTO assignments
          (child_id, sessions_per_week, cycles_per_session, recommended_duration_seconds)
         VALUES (?, ?, ?, ?)`,
      );
      const ownershipStatement = this.db.prepare(
        'INSERT INTO child_skins (child_id, skin_id) VALUES (?, ?)',
      );
      children.forEach((child) => {
        childStatement.run(...child.slice(0, 7));
        assignmentStatement.run(child[0], child[7], child[8], child[9]);
        ownershipStatement.run(child[0], 'berry');
        if (child[6] !== 'berry') ownershipStatement.run(child[0], child[6]);
      });

      const patterns = [
        [3, 2, 3, 3, 1, 3, 4, 1],
        [3, 4, 4, 3, 4, 4, 3, 1],
        [1, 2, 2, 3, 2, 3, 3, 1],
      ];
      children.forEach((child, childIndex) => {
        patterns[childIndex].forEach((amount, patternIndex) => {
          const weeksAgo = 7 - patternIndex;
          const weekStart = startOfWeek(subWeeks(new Date(), weeksAgo), { weekStartsOn: 1 });
          for (let sessionIndex = 0; sessionIndex < amount; sessionIndex += 1) {
            const date = setHours(addDays(weekStart, Math.min(sessionIndex * 2, 5)), 17);
            if (date > new Date()) continue;
            const correct = Math.min(96, 68 + patternIndex * 3 + childIndex * 2 + sessionIndex);
            const targetCycles = child[8];
            const completedCycles = Math.max(3, targetCycles - ((sessionIndex + childIndex) % 3));
            this.insertSession({
              childId: child[0],
              startedAt: date.toISOString(),
              durationSeconds: child[9] - 8 + sessionIndex * 3,
              breathCount: completedCycles,
              averageStrength: 0.52 + patternIndex * 0.025,
              averageBreathDuration: 2.1 + patternIndex * 0.12 + sessionIndex * 0.08,
              averageStability: 62 + patternIndex * 3 + sessionIndex,
              correctBreathPercent: correct,
              completedCycles,
              targetCycles,
              coinsCollected: 4 + sessionIndex * 2,
              averageLatencyMs: 58 + sessionIndex * 3,
              maxLatencyMs: 96 + sessionIndex * 4,
              technicalPauses: patternIndex < 2 && sessionIndex === 0 ? 1 : 0,
              status: 'completed',
              inputMode: 'microphone',
            });
          }
        });
      });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private childRow(idOrCode: string, byCode = false): ChildRow | undefined {
    const key = byCode ? 'c.code' : 'c.id';
    return this.db
      .prepare(
        `SELECT ${CHILD_FIELDS}, a.sessions_per_week, a.cycles_per_session,
                a.recommended_duration_seconds
         FROM children c JOIN assignments a ON a.child_id = c.id
         WHERE ${key} = ?`,
      )
      .get(idOrCode) as ChildRow | undefined;
  }

  private mapChild(row: ChildRow): ChildProfile {
    const skinRows = this.db
      .prepare(
        `SELECT s.id, s.name, s.color, s.accent, s.price,
                CASE WHEN cs.child_id IS NULL THEN 0 ELSE 1 END AS owned
         FROM skins s LEFT JOIN child_skins cs ON cs.skin_id = s.id AND cs.child_id = ?
         ORDER BY s.price ASC`,
      )
      .all(row.id) as Array<Omit<Skin, 'owned'> & { owned: number }>;
    return {
      id: row.id,
      nickname: row.nickname,
      age: row.age,
      avatar: row.avatar,
      balance: row.balance,
      selectedSkin: row.selected_skin,
      assignment: {
        sessionsPerWeek: row.sessions_per_week,
        cyclesPerSession: row.cycles_per_session,
        recommendedDurationSeconds: row.recommended_duration_seconds,
      },
      skins: skinRows.map((skin) => ({ ...skin, owned: Boolean(skin.owned) })),
    };
  }

  findChildByCode(code: string): ChildProfile | null {
    const row = this.childRow(code.trim().toUpperCase(), true);
    return row ? this.mapChild(row) : null;
  }

  getChild(id: string): ChildProfile | null {
    const row = this.childRow(id);
    return row ? this.mapChild(row) : null;
  }

  listChildren(): Array<ChildProfile & { code: string }> {
    const rows = this.db
      .prepare(
        `SELECT ${CHILD_FIELDS}, a.sessions_per_week, a.cycles_per_session,
                a.recommended_duration_seconds
         FROM children c JOIN assignments a ON a.child_id = c.id ORDER BY c.nickname`,
      )
      .all() as unknown as ChildRow[];
    return rows.map((row) => ({ ...this.mapChild(row), code: row.code }));
  }

  saveCalibration(childId: string, profile: CalibrationProfile): void {
    this.db.prepare(
      `INSERT INTO calibrations
       (id, child_id, ambient_rms, breath_rms, breath_zcr, breath_centroid,
        breath_flatness, quality, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      childId,
      profile.ambientRms,
      profile.breathRms,
      profile.breathZcr,
      profile.breathCentroid,
      profile.breathFlatness,
      profile.quality,
      profile.createdAt,
    );
  }

  latestCalibration(childId: string): CalibrationProfile | null {
    const row = this.db
      .prepare(
        `SELECT ambient_rms, breath_rms, breath_zcr, breath_centroid, breath_flatness,
                quality, created_at
         FROM calibrations WHERE child_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(childId) as
      | {
          ambient_rms: number;
          breath_rms: number;
          breath_zcr: number;
          breath_centroid: number;
          breath_flatness: number;
          quality: number;
          created_at: string;
        }
      | undefined;
    return row
      ? {
          ambientRms: row.ambient_rms,
          breathRms: row.breath_rms,
          breathZcr: row.breath_zcr,
          breathCentroid: row.breath_centroid,
          breathFlatness: row.breath_flatness,
          quality: row.quality,
          createdAt: row.created_at,
        }
      : null;
  }

  insertSession(payload: SessionPayload): SessionRecord {
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO sessions
       (id, child_id, started_at, duration_seconds, breath_count, average_strength,
        average_breath_duration, average_stability, correct_breath_percent, completed_cycles,
        target_cycles, coins_collected, average_latency_ms, max_latency_ms,
        suspicious_events, status, input_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      payload.childId,
      payload.startedAt,
      payload.durationSeconds,
      payload.breathCount,
      payload.averageStrength,
      payload.averageBreathDuration,
      payload.averageStability,
      payload.correctBreathPercent,
      payload.completedCycles,
      payload.targetCycles,
      payload.coinsCollected,
      payload.averageLatencyMs,
      payload.maxLatencyMs,
      payload.technicalPauses,
      payload.status,
      payload.inputMode,
    );
    return { id, ...payload };
  }

  rewardSession(childId: string, coins: number): number {
    this.db.prepare('UPDATE children SET balance = balance + ? WHERE id = ?').run(coins, childId);
    return this.getChild(childId)?.balance ?? 0;
  }

  listSessions(childId?: string): SessionRecord[] {
    const rows = (childId
      ? this.db
          .prepare(
            `SELECT ${SESSION_FIELDS}, c.nickname AS child_nickname FROM sessions s
             JOIN children c ON c.id = s.child_id WHERE s.child_id = ?
             ORDER BY s.started_at DESC`,
          )
          .all(childId)
      : this.db
          .prepare(
            `SELECT ${SESSION_FIELDS}, c.nickname AS child_nickname FROM sessions s
             JOIN children c ON c.id = s.child_id ORDER BY s.started_at DESC`,
          )
          .all()) as unknown as SessionRow[];
    return rows.map((row) => ({
      id: row.id,
      childId: row.child_id,
      childNickname: row.child_nickname,
      startedAt: row.started_at,
      durationSeconds: row.duration_seconds,
      breathCount: row.breath_count,
      averageStrength: row.average_strength,
      // Старые записи не содержат новых метрик: возвращаем null, а не 0.
      averageBreathDuration: row.average_breath_duration ?? null,
      averageStability: row.average_stability ?? null,
      correctBreathPercent: row.correct_breath_percent,
      completedCycles: row.completed_cycles,
      targetCycles: row.target_cycles,
      coinsCollected: row.coins_collected,
      averageLatencyMs: row.average_latency_ms ?? null,
      maxLatencyMs: row.max_latency_ms ?? null,
      technicalPauses: row.suspicious_events,
      status: row.status,
      inputMode: row.input_mode,
    }));
  }

  buySkin(childId: string, skinId: string): ChildProfile {
    const child = this.getChild(childId);
    if (!child) throw new Error('Ребёнок не найден');
    const skin = child.skins.find((item) => item.id === skinId);
    if (!skin) throw new Error('Скин не найден');
    if (skin.owned) return child;
    if (child.balance < skin.price) throw new Error('Пока не хватает монет');
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE children SET balance = balance - ? WHERE id = ?').run(skin.price, childId);
      this.db.prepare('INSERT INTO child_skins (child_id, skin_id) VALUES (?, ?)').run(childId, skinId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.getChild(childId)!;
  }

  selectSkin(childId: string, skinId: string): ChildProfile {
    const child = this.getChild(childId);
    if (!child) throw new Error('Ребёнок не найден');
    if (!child.skins.some((skin) => skin.id === skinId && skin.owned)) {
      throw new Error('Сначала открой этот образ');
    }
    this.db.prepare('UPDATE children SET selected_skin = ? WHERE id = ?').run(skinId, childId);
    return this.getChild(childId)!;
  }
}

export const db = new AppDatabase(process.env.DATABASE_PATH || defaultPath);
