import { DatabaseSync } from 'node:sqlite';

export interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_specialist_cabinet_data_model',
    up: (db: DatabaseSync) => {
      // 1. Создание основных сущностей пользователей и организаций
      db.exec(`
        CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('admin', 'specialist', 'demo_specialist')),
          organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          last_login_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

        CREATE TABLE IF NOT EXISTS auth_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT UNIQUE NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_active_at TEXT NOT NULL,
          user_agent TEXT,
          ip TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash);
        CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

        CREATE TABLE IF NOT EXISTS patients (
          id TEXT PRIMARY KEY,
          pseudonym TEXT NOT NULL,
          age INTEGER NOT NULL CHECK(age BETWEEN 5 AND 12),
          gender TEXT CHECK(gender IN ('male', 'female', 'unspecified')),
          avatar TEXT NOT NULL,
          balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
          selected_skin TEXT NOT NULL DEFAULT 'berry',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS game_access_codes (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
          code TEXT UNIQUE NOT NULL,
          created_at TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_game_access_codes_code ON game_access_codes(code);
        CREATE INDEX IF NOT EXISTS idx_game_access_codes_patient ON game_access_codes(patient_id);

        CREATE TABLE IF NOT EXISTS skins (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          color TEXT NOT NULL,
          accent TEXT NOT NULL,
          price INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS patient_skins (
          patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
          skin_id TEXT NOT NULL REFERENCES skins(id) ON DELETE CASCADE,
          unlocked_at TEXT NOT NULL,
          PRIMARY KEY (patient_id, skin_id)
        );

        CREATE TABLE IF NOT EXISTS calibrations (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
          ambient_rms REAL NOT NULL,
          breath_rms REAL NOT NULL,
          breath_zcr REAL NOT NULL,
          breath_centroid REAL NOT NULL,
          breath_flatness REAL NOT NULL,
          quality REAL NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_calibrations_patient_date ON calibrations(patient_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS assignment_versions (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
          created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          sessions_per_week INTEGER NOT NULL,
          target_breaths INTEGER NOT NULL,
          min_completed_breath_seconds REAL NOT NULL DEFAULT 1.5,
          target_breath_duration_min REAL,
          target_breath_duration_max REAL,
          valid_from TEXT NOT NULL,
          valid_until TEXT,
          note TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_assignment_versions_patient ON assignment_versions(patient_id, valid_from DESC);

        CREATE TABLE IF NOT EXISTS training_sessions (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
          started_at TEXT NOT NULL,
          duration_seconds INTEGER NOT NULL,
          breath_count INTEGER NOT NULL,
          average_strength REAL NOT NULL,
          average_breath_duration REAL,
          best_duration_seconds REAL,
          average_stability REAL,
          correct_breath_percent REAL NOT NULL,
          completed_cycles INTEGER NOT NULL,
          target_cycles INTEGER NOT NULL,
          coins_collected INTEGER NOT NULL,
          average_latency_ms REAL,
          max_latency_ms REAL,
          obstacles_avoided INTEGER DEFAULT 0,
          bird_bumps INTEGER DEFAULT 0,
          suspicious_events INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL CHECK(status IN ('completed', 'stopped')),
          input_mode TEXT NOT NULL CHECK(input_mode IN ('microphone', 'demo'))
        );
        CREATE INDEX IF NOT EXISTS idx_training_sessions_patient_date ON training_sessions(patient_id, started_at DESC);

        CREATE TABLE IF NOT EXISTS patient_access (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
          granted_at TEXT NOT NULL,
          granted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          UNIQUE(user_id, patient_id)
        );
        CREATE INDEX IF NOT EXISTS idx_patient_access_user ON patient_access(user_id);
        CREATE INDEX IF NOT EXISTS idx_patient_access_patient ON patient_access(patient_id);

        CREATE TABLE IF NOT EXISTS audit_events (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          resource_type TEXT NOT NULL,
          resource_id TEXT,
          details TEXT,
          ip TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id);

        CREATE TABLE IF NOT EXISTS specialist_settings (
          id TEXT PRIMARY KEY,
          user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          default_thresholds_json TEXT,
          notification_prefs_json TEXT,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS report_snapshots (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
          created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          period_start TEXT NOT NULL,
          period_end TEXT NOT NULL,
          data_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_report_snapshots_patient ON report_snapshots(patient_id, created_at DESC);
      `);

      // 2. Миграция данных из legacy-таблиц (если они существовали до миграции)
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((t) => t.name);

      // Если существовала старая таблица children:
      if (tables.includes('children')) {
        db.exec(`
          INSERT OR IGNORE INTO patients (id, pseudonym, age, gender, avatar, balance, selected_skin, created_at)
          SELECT id, nickname, age, 'unspecified', avatar, balance, selected_skin, '2026-01-01T00:00:00.000Z'
          FROM children;

          INSERT OR IGNORE INTO game_access_codes (id, patient_id, code, created_at, is_active)
          SELECT 'code-' || id, id, code, '2026-01-01T00:00:00.000Z', 1
          FROM children;
        `);
      }

      // Если существовала старая таблица child_skins:
      if (tables.includes('child_skins')) {
        db.exec(`
          INSERT OR IGNORE INTO patient_skins (patient_id, skin_id, unlocked_at)
          SELECT child_id, skin_id, '2026-01-01T00:00:00.000Z'
          FROM child_skins;
        `);
      }

      // Если существовала старая таблица assignments:
      if (tables.includes('assignments')) {
        db.exec(`
          INSERT OR IGNORE INTO assignment_versions (
            id, patient_id, sessions_per_week, target_breaths, min_completed_breath_seconds,
            valid_from, created_at
          )
          SELECT
            'assign-' || child_id, child_id, sessions_per_week, cycles_per_session, 1.5,
            '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
          FROM assignments;
        `);
      }

      // Если существовала старая таблица calibrations (со старым именем колонки child_id):
      if (tables.includes('calibrations')) {
        const calCols = (db.prepare('PRAGMA table_info(calibrations)').all() as Array<{ name: string }>).map((c) => c.name);
        if (calCols.includes('child_id') && !calCols.includes('patient_id')) {
          db.exec(`
            ALTER TABLE calibrations RENAME COLUMN child_id TO patient_id;
          `);
        }
      }

      // Если существовала старая таблица sessions:
      if (tables.includes('sessions')) {
        const sessCols = (db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>).map((c) => c.name);
        const hasStability = sessCols.includes('average_stability');
        const hasBestDuration = sessCols.includes('best_duration_seconds');
        const hasLatency = sessCols.includes('average_latency_ms');
        const hasObstacles = sessCols.includes('obstacles_avoided');

        // Переносим данные в training_sessions
        db.exec(`
          INSERT OR IGNORE INTO training_sessions (
            id, patient_id, started_at, duration_seconds, breath_count, average_strength,
            average_breath_duration, best_duration_seconds, average_stability, correct_breath_percent,
            completed_cycles, target_cycles, coins_collected, average_latency_ms, max_latency_ms,
            obstacles_avoided, bird_bumps, suspicious_events, status, input_mode
          )
          SELECT
            id,
            child_id,
            started_at,
            duration_seconds,
            breath_count,
            average_strength,
            average_breath_duration,
            ${hasBestDuration ? 'best_duration_seconds' : 'NULL'},
            ${hasStability ? 'average_stability' : 'NULL'},
            correct_breath_percent,
            completed_cycles,
            target_cycles,
            coins_collected,
            ${hasLatency ? 'average_latency_ms' : 'NULL'},
            ${hasLatency ? 'max_latency_ms' : 'NULL'},
            ${hasObstacles ? 'obstacles_avoided' : '0'},
            0,
            suspicious_events,
            status,
            input_mode
          FROM sessions;
        `);

        // Дропаем старую таблицу sessions, чтобы пересоздать как VIEW
        db.exec('DROP TABLE sessions;');
      }

      // 3. Создание обратной совместимости (VIEWs и Clinicians table)
      // Если существовали старые таблицы, удаляем их, чтобы создать VIEW
      const existingTables = (db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view')").all() as Array<{ name: string; type: string }>);
      const tableNames = new Set(existingTables.filter((t) => t.type === 'table').map((t) => t.name));

      if (tableNames.has('child_skins')) db.exec('DROP TABLE child_skins;');
      if (tableNames.has('assignments')) db.exec('DROP TABLE assignments;');
      if (tableNames.has('children')) db.exec('DROP TABLE children;');

      db.exec(`
        CREATE TABLE IF NOT EXISTS clinicians (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL
        );

        DROP VIEW IF EXISTS sessions;
        CREATE VIEW sessions AS
          SELECT
            id,
            patient_id AS child_id,
            started_at,
            duration_seconds,
            breath_count,
            average_strength,
            average_breath_duration,
            best_duration_seconds,
            average_stability,
            correct_breath_percent,
            completed_cycles,
            target_cycles,
            coins_collected,
            average_latency_ms,
            max_latency_ms,
            obstacles_avoided,
            bird_bumps,
            suspicious_events,
            status,
            input_mode
          FROM training_sessions;

        CREATE TRIGGER IF NOT EXISTS trg_sessions_insert INSTEAD OF INSERT ON sessions
        BEGIN
          INSERT INTO training_sessions (
            id, patient_id, started_at, duration_seconds, breath_count, average_strength,
            average_breath_duration, best_duration_seconds, average_stability, correct_breath_percent,
            completed_cycles, target_cycles, coins_collected, average_latency_ms, max_latency_ms,
            obstacles_avoided, bird_bumps, suspicious_events, status, input_mode
          ) VALUES (
            NEW.id, NEW.child_id, NEW.started_at, NEW.duration_seconds, NEW.breath_count, NEW.average_strength,
            NEW.average_breath_duration, NEW.best_duration_seconds, NEW.average_stability, NEW.correct_breath_percent,
            NEW.completed_cycles, NEW.target_cycles, NEW.coins_collected, NEW.average_latency_ms, NEW.max_latency_ms,
            COALESCE(NEW.obstacles_avoided, 0), 0, NEW.suspicious_events, NEW.status, NEW.input_mode
          );
        END;

        DROP VIEW IF EXISTS children;
        CREATE VIEW children AS
          SELECT
            p.id,
            'clinician-demo' AS clinician_id,
            COALESCE((SELECT code FROM game_access_codes WHERE patient_id = p.id AND is_active = 1 LIMIT 1), '') AS code,
            p.pseudonym AS nickname,
            p.age,
            p.avatar,
            p.balance,
            p.selected_skin
          FROM patients p;

        DROP VIEW IF EXISTS assignments;
        CREATE VIEW assignments AS
          SELECT
            av.patient_id AS child_id,
            av.sessions_per_week,
            av.target_breaths AS cycles_per_session,
            600 AS recommended_duration_seconds
          FROM assignment_versions av
          WHERE av.id IN (
            SELECT id FROM assignment_versions av2
            WHERE av2.patient_id = av.patient_id
            ORDER BY av2.valid_from DESC, av2.created_at DESC
            LIMIT 1
          );

        DROP VIEW IF EXISTS child_skins;
        CREATE VIEW child_skins AS
          SELECT patient_id AS child_id, skin_id
          FROM patient_skins;
      `);
    },
  },
  {
    version: 2,
    name: '002_specialist_profile_fields',
    up: (db: DatabaseSync) => {
      // Профиль специалиста для раздела «Настройки»: имя, клиника, контакты.
      const columns = (db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map(
        (column) => column.name,
      );
      const addColumn = (name: string, definition: string): void => {
        if (!columns.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition};`);
      };

      addColumn('display_name', 'TEXT');
      addColumn('clinic_name', 'TEXT');
      addColumn('contact_email', 'TEXT');
      addColumn('contact_phone', 'TEXT');

      // Бэкфилл легаси-врача, чтобы кабинет не показывал пустую шапку.
      db.prepare(
        `UPDATE users
            SET display_name = COALESCE(display_name, ?),
                clinic_name = COALESCE(clinic_name, ?)
          WHERE id = 'user-doctor'`,
      ).run('Анна Викторовна', 'Детский пульмонологический центр');
    },
  },
];

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>;
  const appliedVersions = new Set(appliedRows.map((r) => r.version));

  for (const migration of MIGRATIONS) {
    if (!appliedVersions.has(migration.version)) {
      db.exec('BEGIN');
      try {
        migration.up(db);
        db.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        ).run(migration.version, migration.name, new Date().toISOString());
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  }
}
