import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { SKIN_CATALOG } from '../src/skins/catalog.ts';
import type {
  CalibrationProfile,
  ChildProfile,
  SessionPayload,
  SessionRecord,
  Skin,
} from '../src/types.ts';
import { runMigrations } from './migrations.ts';
import { seedDatabase } from './seedData.ts';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'specialist' | 'demo_specialist';
  organization_id: string | null;
  organization_name?: string | null;
  created_at: string;
  last_login_at: string | null;
  display_name: string | null;
  clinic_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

export interface AuthSessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  last_active_at: string;
  user_agent: string | null;
  ip: string | null;
  user_email?: string;
  user_role?: 'admin' | 'specialist' | 'demo_specialist';
  organization_id?: string | null;
  organization_name?: string | null;
}

export interface PatientRow {
  id: string;
  code: string;
  pseudonym: string;
  age: number;
  gender: string | null;
  avatar: string;
  balance: number;
  selected_skin: string;
  created_at: string;
  sessions_per_week: number;
  target_breaths: number;
  min_completed_breath_seconds: number;
  target_breath_duration_min: number | null;
  target_breath_duration_max: number | null;
  valid_from: string;
  note: string | null;
}

export interface AssignmentVersionRow {
  id: string;
  patient_id: string;
  created_by_user_id: string | null;
  sessions_per_week: number;
  target_breaths: number;
  min_completed_breath_seconds: number;
  target_breath_duration_min: number | null;
  target_breath_duration_max: number | null;
  valid_from: string;
  valid_until: string | null;
  note: string | null;
  created_at: string;
}

export interface AuditEventRow {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: string | null;
  ip: string | null;
  created_at: string;
}

const defaultPath = join(process.cwd(), 'data', 'legkie.sqlite');

export class AppDatabase {
  readonly db: DatabaseSync;

  constructor(path = defaultPath) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    runMigrations(this.db);
    seedDatabase(this.db);
  }

  /**
   * Явно закрывает SQLite-соединение. Обязательно вызывать в тестах перед
   * удалением файла базы: Windows не позволяет удалить файл с открытым дескриптором.
   */
  close(): void {
    if (this.db.isOpen) {
      this.db.close();
    }
  }

  // ==========================================
  // АУТЕНТИФИКАЦИЯ И ПОЛЬЗОВАТЕЛИ
  // ==========================================

  findUserByEmail(email: string): UserRow | null {
    const row = this.db
      .prepare(
        `SELECT u.id, u.email, u.password_hash, u.role, u.organization_id,
                o.name AS organization_name, u.created_at, u.last_login_at,
                u.display_name, u.clinic_name, u.contact_email, u.contact_phone
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE LOWER(u.email) = LOWER(?)`,
      )
      .get(email.trim()) as UserRow | undefined;
    return row ?? null;
  }

  findUserById(id: string): UserRow | null {
    const row = this.db
      .prepare(
        `SELECT u.id, u.email, u.password_hash, u.role, u.organization_id,
                o.name AS organization_name, u.created_at, u.last_login_at,
                u.display_name, u.clinic_name, u.contact_email, u.contact_phone
         FROM users u
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE u.id = ?`,
      )
      .get(id) as UserRow | undefined;
    return row ?? null;
  }

  updateUserLastLogin(userId: string, timestamp = new Date().toISOString()): void {
    this.db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(timestamp, userId);
  }

  updateUserPassword(userId: string, passwordHash: string): void {
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  }

  createAuthSession(params: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
    userAgent?: string | null;
    ip?: string | null;
  }): { id: string } {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO auth_sessions
          (id, user_id, token_hash, expires_at, created_at, last_active_at, user_agent, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        params.userId,
        params.tokenHash,
        params.expiresAt,
        now,
        now,
        params.userAgent ?? null,
        params.ip ?? null,
      );
    return { id };
  }

  getAuthSessionByTokenHash(tokenHash: string, now = new Date().toISOString()): (AuthSessionRow & { user: UserRow }) | null {
    const row = this.db
      .prepare(
        `SELECT s.id, s.user_id, s.token_hash, s.expires_at, s.created_at, s.last_active_at,
                s.user_agent, s.ip,
                u.email AS user_email, u.role AS user_role, u.password_hash,
                u.organization_id, o.name AS organization_name,
                u.created_at AS user_created_at, u.last_login_at AS user_last_login_at,
                u.display_name, u.clinic_name, u.contact_email, u.contact_phone
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN organizations o ON o.id = u.organization_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, now) as
      | (AuthSessionRow & {
          password_hash: string;
          user_created_at: string;
          user_last_login_at?: string | null;
          display_name: string | null;
          clinic_name: string | null;
          contact_email: string | null;
          contact_phone: string | null;
        })
      | undefined;

    if (!row) return null;
    return {
      id: row.id,
      user_id: row.user_id,
      token_hash: row.token_hash,
      expires_at: row.expires_at,
      created_at: row.created_at,
      last_active_at: row.last_active_at,
      user_agent: row.user_agent,
      ip: row.ip,
      user: {
        id: row.user_id,
        email: row.user_email!,
        password_hash: row.password_hash,
        role: row.user_role!,
        organization_id: row.organization_id ?? null,
        organization_name: row.organization_name ?? null,
        created_at: row.user_created_at,
        last_login_at: row.user_last_login_at ?? null,
        display_name: row.display_name ?? null,
        clinic_name: row.clinic_name ?? null,
        contact_email: row.contact_email ?? null,
        contact_phone: row.contact_phone ?? null,
      },
    };
  }

  touchAuthSession(sessionId: string): void {
    this.db
      .prepare("UPDATE auth_sessions SET last_active_at = datetime('now') WHERE id = ?")
      .run(sessionId);
  }

  deleteAuthSession(sessionId: string): void {
    this.db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(sessionId);
  }

  deleteUserAuthSessions(userId: string): void {
    this.db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
  }

  // ==========================================
  // ДОСТУП СПЕЦИАЛИСТА К ПАЦИЕНТАМ
  // ==========================================

  hasPatientAccess(userId: string, patientId: string): boolean {
    const user = this.findUserById(userId);
    if (!user) return false;
    if (user.role === 'admin') return true;
    const access = this.db
      .prepare('SELECT 1 FROM patient_access WHERE user_id = ? AND patient_id = ?')
      .get(userId, patientId);
    return Boolean(access);
  }

  listPatientsForUser(userId: string): Array<{
    id: string;
    pseudonym: string;
    code: string;
    age: number;
    gender: string | null;
    avatar: string;
    balance: number;
    selectedSkin: string;
    createdAt: string;
    assignment: {
      sessionsPerWeek: number;
      targetBreaths: number;
      minCompletedBreathSeconds: number;
      targetBreathDurationMin: number | null;
      targetBreathDurationMax: number | null;
      validFrom: string;
      note: string | null;
    };
  }> {
    const user = this.findUserById(userId);
    if (!user) return [];

    let rows: PatientRow[];
    if (user.role === 'admin') {
      rows = this.db
        .prepare(
          `SELECT p.id, p.pseudonym, p.age, p.gender, p.avatar, p.balance, p.selected_skin, p.created_at,
                  COALESCE(gac.code, '') AS code,
                  COALESCE(av.sessions_per_week, 3) AS sessions_per_week,
                  COALESCE(av.target_breaths, 8) AS target_breaths,
                  COALESCE(av.min_completed_breath_seconds, 1.5) AS min_completed_breath_seconds,
                  av.target_breath_duration_min,
                  av.target_breath_duration_max,
                  COALESCE(av.valid_from, '2026-01-01T00:00:00.000Z') AS valid_from,
                  av.note
           FROM patients p
           LEFT JOIN game_access_codes gac ON gac.patient_id = p.id AND gac.is_active = 1
           LEFT JOIN assignment_versions av ON av.id = (
             SELECT av2.id FROM assignment_versions av2
             WHERE av2.patient_id = p.id
             ORDER BY av2.valid_from DESC, av2.created_at DESC
             LIMIT 1
           )
           ORDER BY p.pseudonym`,
        )
        .all() as unknown as PatientRow[];
    } else {
      rows = this.db
        .prepare(
          `SELECT p.id, p.pseudonym, p.age, p.gender, p.avatar, p.balance, p.selected_skin, p.created_at,
                  COALESCE(gac.code, '') AS code,
                  COALESCE(av.sessions_per_week, 3) AS sessions_per_week,
                  COALESCE(av.target_breaths, 8) AS target_breaths,
                  COALESCE(av.min_completed_breath_seconds, 1.5) AS min_completed_breath_seconds,
                  av.target_breath_duration_min,
                  av.target_breath_duration_max,
                  COALESCE(av.valid_from, '2026-01-01T00:00:00.000Z') AS valid_from,
                  av.note
           FROM patients p
           JOIN patient_access pa ON pa.patient_id = p.id AND pa.user_id = ?
           LEFT JOIN game_access_codes gac ON gac.patient_id = p.id AND gac.is_active = 1
           LEFT JOIN assignment_versions av ON av.id = (
             SELECT av2.id FROM assignment_versions av2
             WHERE av2.patient_id = p.id
             ORDER BY av2.valid_from DESC, av2.created_at DESC
             LIMIT 1
           )
           ORDER BY p.pseudonym`,
        )
        .all(userId) as unknown as PatientRow[];
    }

    return rows.map((row) => ({
      id: row.id,
      pseudonym: row.pseudonym,
      code: row.code,
      age: row.age,
      gender: row.gender,
      avatar: row.avatar,
      balance: row.balance,
      selectedSkin: row.selected_skin,
      createdAt: row.created_at,
      assignment: {
        sessionsPerWeek: row.sessions_per_week,
        targetBreaths: row.target_breaths,
        minCompletedBreathSeconds: row.min_completed_breath_seconds,
        targetBreathDurationMin: row.target_breath_duration_min,
        targetBreathDurationMax: row.target_breath_duration_max,
        validFrom: row.valid_from,
        note: row.note,
      },
    }));
  }

  // ==========================================
  // НАЗНАЧЕНИЯ (ASSIGNMENTS)
  // ==========================================

  getPatientAssignments(patientId: string): AssignmentVersionRow[] {
    return this.db
      .prepare(
        `SELECT id, patient_id, created_by_user_id, sessions_per_week, target_breaths,
                min_completed_breath_seconds, target_breath_duration_min, target_breath_duration_max,
                valid_from, valid_until, note, created_at
         FROM assignment_versions
         WHERE patient_id = ?
         ORDER BY valid_from DESC, created_at DESC`,
      )
      .all(patientId) as unknown as AssignmentVersionRow[];
  }

  createAssignmentVersion(params: {
    patientId: string;
    createdByUserId: string | null;
    sessionsPerWeek: number;
    targetBreaths: number;
    minCompletedBreathSeconds: number;
    targetBreathDurationMin: number | null;
    targetBreathDurationMax: number | null;
    validFrom: string;
    note: string | null;
  }): AssignmentVersionRow {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO assignment_versions (
          id, patient_id, created_by_user_id, sessions_per_week, target_breaths,
          min_completed_breath_seconds, target_breath_duration_min, target_breath_duration_max,
          valid_from, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        params.patientId,
        params.createdByUserId,
        params.sessionsPerWeek,
        params.targetBreaths,
        params.minCompletedBreathSeconds,
        params.targetBreathDurationMin,
        params.targetBreathDurationMax,
        params.validFrom,
        params.note,
        now,
      );

    return {
      id,
      patient_id: params.patientId,
      created_by_user_id: params.createdByUserId,
      sessions_per_week: params.sessionsPerWeek,
      target_breaths: params.targetBreaths,
      min_completed_breath_seconds: params.minCompletedBreathSeconds,
      target_breath_duration_min: params.targetBreathDurationMin,
      target_breath_duration_max: params.targetBreathDurationMax,
      valid_from: params.validFrom,
      valid_until: null,
      note: params.note,
      created_at: now,
    };
  }

  /** Завершение текущей версии назначения: проставляем valid_until. */
  closeAssignmentVersion(assignmentId: string, validUntil = new Date().toISOString()): boolean {
    const result = this.db
      .prepare('UPDATE assignment_versions SET valid_until = ? WHERE id = ? AND valid_until IS NULL')
      .run(validUntil, assignmentId);
    return Number(result.changes) > 0;
  }

  // ==========================================
  // СОЗДАНИЕ ПАЦИЕНТА СПЕЦИАЛИСТОМ
  // ==========================================

  /** Генерация уникального кода доступа к игре (кириллица + цифра, как у демо-профилей). */
  private generateAccessCode(): string {
    const alphabet = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ';
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let code = '';
      for (let index = 0; index < 5; index += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      code += String(Math.floor(Math.random() * 10));
      const exists = this.db.prepare('SELECT 1 FROM game_access_codes WHERE code = ?').get(code);
      if (!exists) return code;
    }
    return `КОД${Date.now().toString().slice(-6)}`;
  }

  createPatient(params: {
    pseudonym: string;
    age: number;
    gender: 'male' | 'female' | 'unspecified';
    ownerUserId: string;
    sessionsPerWeek: number;
    targetBreaths: number;
    minCompletedBreathSeconds: number;
    note?: string | null;
  }): { id: string; code: string } {
    const id = randomUUID();
    const now = new Date().toISOString();
    const code = this.generateAccessCode();
    const avatar = params.pseudonym
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || 'ПЦ';

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO patients (id, pseudonym, age, gender, avatar, balance, selected_skin, created_at)
           VALUES (?, ?, ?, ?, ?, 0, 'berry', ?)`,
        )
        .run(id, params.pseudonym, params.age, params.gender, avatar, now);

      this.db
        .prepare(
          `INSERT INTO game_access_codes (id, patient_id, code, created_at, is_active)
           VALUES (?, ?, ?, ?, 1)`,
        )
        .run(randomUUID(), id, code, now);

      this.db
        .prepare('INSERT INTO patient_skins (patient_id, skin_id, unlocked_at) VALUES (?, ?, ?)')
        .run(id, 'berry', now);

      this.db
        .prepare(
          `INSERT INTO patient_access (id, user_id, patient_id, granted_at, granted_by_user_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(randomUUID(), params.ownerUserId, id, now, params.ownerUserId);

      this.db
        .prepare(
          `INSERT INTO assignment_versions (
             id, patient_id, created_by_user_id, sessions_per_week, target_breaths,
             min_completed_breath_seconds, target_breath_duration_min, target_breath_duration_max,
             valid_from, note, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, 2.0, 4.0, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          id,
          params.ownerUserId,
          params.sessionsPerWeek,
          params.targetBreaths,
          params.minCompletedBreathSeconds,
          now,
          params.note ?? 'Первичное назначение',
          now,
        );

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return { id, code };
  }

  // ==========================================
  // ПРОФИЛЬ И НАСТРОЙКИ СПЕЦИАЛИСТА
  // ==========================================

  updateUserProfile(
    userId: string,
    profile: { displayName: string | null; clinicName: string | null; contactEmail: string | null; contactPhone: string | null },
  ): void {
    this.db
      .prepare(
        'UPDATE users SET display_name = ?, clinic_name = ?, contact_email = ?, contact_phone = ? WHERE id = ?',
      )
      .run(profile.displayName, profile.clinicName, profile.contactEmail, profile.contactPhone, userId);
  }

  getSpecialistSettings(userId: string): { thresholds: unknown; notifications: unknown; updatedAt: string | null } {
    const row = this.db
      .prepare(
        'SELECT default_thresholds_json, notification_prefs_json, updated_at FROM specialist_settings WHERE user_id = ?',
      )
      .get(userId) as
      | { default_thresholds_json: string | null; notification_prefs_json: string | null; updated_at: string }
      | undefined;

    const parse = (value: string | null): unknown => {
      if (!value) return null;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return null;
      }
    };

    return {
      thresholds: parse(row?.default_thresholds_json ?? null),
      notifications: parse(row?.notification_prefs_json ?? null),
      updatedAt: row?.updated_at ?? null,
    };
  }

  saveSpecialistSettings(userId: string, patch: { thresholds?: unknown; notifications?: unknown }): void {
    const current = this.getSpecialistSettings(userId);
    const thresholds = patch.thresholds === undefined ? current.thresholds : patch.thresholds;
    const notifications = patch.notifications === undefined ? current.notifications : patch.notifications;
    this.db
      .prepare(
        `INSERT INTO specialist_settings (id, user_id, default_thresholds_json, notification_prefs_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           default_thresholds_json = excluded.default_thresholds_json,
           notification_prefs_json = excluded.notification_prefs_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        randomUUID(),
        userId,
        thresholds === null ? null : JSON.stringify(thresholds),
        notifications === null ? null : JSON.stringify(notifications),
        new Date().toISOString(),
      );
  }

  /** Активные сессии входа пользователя — для раздела «Безопасность». */
  listAuthSessionsForUser(userId: string, now = new Date().toISOString()): AuthSessionRow[] {
    return this.db
      .prepare(
        `SELECT id, user_id, token_hash, expires_at, created_at, last_active_at, user_agent, ip
         FROM auth_sessions
         WHERE user_id = ? AND expires_at > ?
         ORDER BY last_active_at DESC`,
      )
      .all(userId, now) as unknown as AuthSessionRow[];
  }

  /** Сессии всех доступных специалисту пациентов (глобальная таблица занятий). */
  listSessionsForUser(userId: string): SessionRecord[] {
    const patientIds = this.listPatientsForUser(userId).map((patient) => patient.id);
    if (patientIds.length === 0) return [];
    const allowed = new Set(patientIds);
    return this.listSessions().filter((session) => allowed.has(session.childId));
  }

  // ==========================================
  // АУДИТ-ЛОГ
  // ==========================================

  logAuditEvent(event: {
    userId: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    details?: string | null;
    ip?: string | null;
  }): void {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO audit_events (id, user_id, action, resource_type, resource_id, details, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        event.userId,
        event.action,
        event.resourceType,
        event.resourceId ?? null,
        event.details ?? null,
        event.ip ?? null,
        now,
      );
  }

  listAuditEvents(limit = 100): AuditEventRow[] {
    return this.db
      .prepare(
        `SELECT id, user_id, action, resource_type, resource_id, details, ip, created_at
         FROM audit_events ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as unknown as AuditEventRow[];
  }

  // ==========================================
  // ИГРОВЫЕ МЕТОДЫ И ОБРАТНАЯ СОВМЕСТИМОСТЬ
  // ==========================================

  private mapChild(row: {
    id: string;
    nickname: string;
    age: number;
    avatar: string;
    balance: number;
    selected_skin: string;
    sessions_per_week: number;
    cycles_per_session: number;
    recommended_duration_seconds: number;
  }): ChildProfile {
    const skinRows = this.db
      .prepare(
        `SELECT s.id, s.name, s.color, s.accent, s.price,
                CASE WHEN ps.patient_id IS NULL THEN 0 ELSE 1 END AS owned
         FROM skins s
         LEFT JOIN patient_skins ps ON ps.skin_id = s.id AND ps.patient_id = ?
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
        targetBreaths: row.cycles_per_session,
        cyclesPerSession: row.cycles_per_session,
        recommendedDurationSeconds: row.recommended_duration_seconds,
      },
      skins: skinRows.map((skin) => ({ ...skin, owned: Boolean(skin.owned) })),
    };
  }

  findChildByCode(code: string): ChildProfile | null {
    const row = this.db
      .prepare(
        `SELECT c.id, c.code, c.nickname, c.age, c.avatar, c.balance, c.selected_skin,
                a.sessions_per_week, a.cycles_per_session, a.recommended_duration_seconds
         FROM children c
         JOIN assignments a ON a.child_id = c.id
         WHERE UPPER(c.code) = ?`,
      )
      .get(code.trim().toUpperCase()) as
      | {
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
      | undefined;

    return row ? this.mapChild(row) : null;
  }

  getChild(id: string): ChildProfile | null {
    const row = this.db
      .prepare(
        `SELECT c.id, c.code, c.nickname, c.age, c.avatar, c.balance, c.selected_skin,
                a.sessions_per_week, a.cycles_per_session, a.recommended_duration_seconds
         FROM children c
         JOIN assignments a ON a.child_id = c.id
         WHERE c.id = ?`,
      )
      .get(id) as
      | {
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
      | undefined;

    return row ? this.mapChild(row) : null;
  }

  listChildren(): Array<ChildProfile & { code: string }> {
    const rows = this.db
      .prepare(
        `SELECT c.id, c.code, c.nickname, c.age, c.avatar, c.balance, c.selected_skin,
                a.sessions_per_week, a.cycles_per_session, a.recommended_duration_seconds
         FROM children c
         JOIN assignments a ON a.child_id = c.id
         ORDER BY c.nickname`,
      )
      .all() as unknown as Array<{
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
      }>;

    return rows.map((row) => ({ ...this.mapChild(row), code: row.code }));
  }

  saveCalibration(childId: string, profile: CalibrationProfile): void {
    this.db
      .prepare(
        `INSERT INTO calibrations
         (id, patient_id, ambient_rms, breath_rms, breath_zcr, breath_centroid, breath_flatness, quality, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
        `SELECT ambient_rms, breath_rms, breath_zcr, breath_centroid, breath_flatness, quality, created_at
         FROM calibrations WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1`,
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
    const completed = payload.completedBreaths ?? payload.completedCycles ?? 0;
    const target = payload.targetBreaths ?? payload.targetCycles ?? 8;

    this.db
      .prepare(
        `INSERT INTO training_sessions
         (id, patient_id, started_at, duration_seconds, breath_count, average_strength,
          average_breath_duration, best_duration_seconds, average_stability, correct_breath_percent,
          completed_cycles, target_cycles, coins_collected, average_latency_ms, max_latency_ms,
          obstacles_avoided, bird_bumps, suspicious_events, status, input_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        payload.childId,
        payload.startedAt,
        payload.durationSeconds,
        payload.breathCount,
        payload.averageStrength,
        payload.averageBreathDuration,
        payload.bestDuration ?? null,
        payload.averageStability,
        payload.correctBreathPercent,
        completed,
        target,
        payload.coinsCollected,
        payload.averageLatencyMs,
        payload.maxLatencyMs,
        0,
        0,
        payload.technicalPauses,
        payload.status,
        payload.inputMode,
      );

    return {
      ...payload,
      id,
      completedBreaths: completed,
      targetBreaths: target,
      completedCycles: completed,
      targetCycles: target,
    };
  }

  rewardSession(childId: string, coins: number): number {
    this.db.prepare('UPDATE patients SET balance = balance + ? WHERE id = ?').run(coins, childId);
    return this.getChild(childId)?.balance ?? 0;
  }

  computeProgress(childId: string): { streakDays: number; totalBreaths: number; completedSessions: number } {
    const rows = this.db
      .prepare(
        `SELECT started_at, completed_cycles FROM training_sessions
         WHERE patient_id = ? AND status = 'completed' AND input_mode = 'microphone'
         ORDER BY started_at DESC`,
      )
      .all(childId) as Array<{ started_at: string; completed_cycles: number }>;

    const completedSessions = rows.length;
    const totalBreaths = rows.reduce((sum, row) => sum + row.completed_cycles, 0);

    const uniqueDays = Array.from(new Set(rows.map((row) => row.started_at.slice(0, 10))))
      .map((day) => parseISO(day))
      .sort((a, b) => b.getTime() - a.getTime());

    let streakDays = 0;
    if (uniqueDays.length > 0 && differenceInCalendarDays(new Date(), uniqueDays[0]) <= 1) {
      streakDays = 1;
      for (let index = 1; index < uniqueDays.length; index += 1) {
        if (differenceInCalendarDays(uniqueDays[index - 1], uniqueDays[index]) === 1) {
          streakDays += 1;
        } else {
          break;
        }
      }
    }

    return { streakDays, totalBreaths, completedSessions };
  }

  grantProgressSkins(childId: string): void {
    const progress = this.computeProgress(childId);
    const owned = new Set(
      (
        this.db.prepare('SELECT skin_id FROM patient_skins WHERE patient_id = ?').all(childId) as Array<{
          skin_id: string;
        }>
      ).map((row) => row.skin_id),
    );
    const progressByUnlock: Record<string, number> = {
      streak: progress.streakDays,
      breaths: progress.totalBreaths,
      sessions: progress.completedSessions,
    };
    SKIN_CATALOG.forEach((skin) => {
      if (!skin.unlock || skin.unlockTarget === undefined || owned.has(skin.id)) return;
      if ((progressByUnlock[skin.unlock] ?? 0) >= skin.unlockTarget) {
        this.db
          .prepare('INSERT OR IGNORE INTO patient_skins (patient_id, skin_id, unlocked_at) VALUES (?, ?, ?)')
          .run(childId, skin.id, new Date().toISOString());
      }
    });
  }

  listSessions(childId?: string): SessionRecord[] {
    const rows = (
      childId
        ? this.db
            .prepare(
              `SELECT s.id, s.patient_id AS child_id, s.started_at, s.duration_seconds, s.breath_count,
                      s.average_strength, s.average_breath_duration, s.best_duration_seconds, s.average_stability,
                      s.correct_breath_percent, s.completed_cycles, s.target_cycles,
                      s.coins_collected, s.average_latency_ms, s.max_latency_ms,
                      s.suspicious_events, s.status, s.input_mode,
                      p.pseudonym AS child_nickname
               FROM training_sessions s
               JOIN patients p ON p.id = s.patient_id
               WHERE s.patient_id = ?
               ORDER BY s.started_at DESC`,
            )
            .all(childId)
        : this.db
            .prepare(
              `SELECT s.id, s.patient_id AS child_id, s.started_at, s.duration_seconds, s.breath_count,
                      s.average_strength, s.average_breath_duration, s.best_duration_seconds, s.average_stability,
                      s.correct_breath_percent, s.completed_cycles, s.target_cycles,
                      s.coins_collected, s.average_latency_ms, s.max_latency_ms,
                      s.suspicious_events, s.status, s.input_mode,
                      p.pseudonym AS child_nickname
               FROM training_sessions s
               JOIN patients p ON p.id = s.patient_id
               ORDER BY s.started_at DESC`,
            )
            .all()
    ) as unknown as Array<{
      id: string;
      child_id: string;
      child_nickname?: string;
      started_at: string;
      duration_seconds: number;
      breath_count: number;
      average_strength: number;
      average_breath_duration: number | null;
      best_duration_seconds: number | null;
      average_stability: number | null;
      correct_breath_percent: number;
      completed_cycles: number;
      target_cycles: number;
      coins_collected: number;
      average_latency_ms: number | null;
      max_latency_ms: number | null;
      suspicious_events: number;
      status: 'completed' | 'stopped';
      input_mode: 'microphone' | 'demo';
    }>;

    return rows.map((row) => ({
      id: row.id,
      childId: row.child_id,
      childNickname: row.child_nickname,
      startedAt: row.started_at,
      durationSeconds: row.duration_seconds,
      breathCount: row.breath_count,
      averageStrength: row.average_strength,
      averageBreathDuration: row.average_breath_duration ?? null,
      bestDuration: row.best_duration_seconds ?? null,
      averageStability: row.average_stability ?? null,
      correctBreathPercent: row.correct_breath_percent,
      completedBreaths: row.completed_cycles,
      targetBreaths: row.target_cycles,
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
    if (skin.category === 'effect' || skin.price === 0) {
      throw new Error('открывается за серию занятий, а не за монеты');
    }
    if (child.balance < skin.price) throw new Error('Пока не хватает монет');

    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE patients SET balance = balance - ? WHERE id = ?').run(skin.price, childId);
      this.db
        .prepare('INSERT INTO patient_skins (patient_id, skin_id, unlocked_at) VALUES (?, ?, ?)')
        .run(childId, skinId, new Date().toISOString());
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
    this.db.prepare('UPDATE patients SET selected_skin = ? WHERE id = ?').run(skinId, childId);
    return this.getChild(childId)!;
  }
}

export const db = new AppDatabase(process.env.DATABASE_PATH || defaultPath);
