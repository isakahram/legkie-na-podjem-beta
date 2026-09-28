import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../server/auth.ts';
import { AppDatabase } from '../server/db.ts';

let directory = '';
let dbPath = '';
const openDatabases: AppDatabase[] = [];

/** Открывает БД и регистрирует её для закрытия в afterEach (важно для Windows). */
const openDatabase = (file: string): AppDatabase => {
  const db = new AppDatabase(file);
  openDatabases.push(db);
  return db;
};

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'legkie-iso-'));
  dbPath = join(directory, 'test.sqlite');
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

describe('Изоляция пациентов и разграничение прав (RBAC)', () => {
  it('специалист видит только тех пациентов, к которым ему выдан доступ', () => {
    const db = openDatabase(dbPath);

    // Создаём двух разных специалистов
    const spec1Id = 'user-spec-1';
    const spec2Id = 'user-spec-2';
    const pwdHash = hashPassword('Pass123!');

    db.db.prepare(`
      INSERT INTO users (id, email, password_hash, role, organization_id, created_at)
      VALUES (?, ?, ?, 'specialist', 'org-demo', '2026-01-01')
    `).run(spec1Id, 'spec1@hospital.local', pwdHash);

    db.db.prepare(`
      INSERT INTO users (id, email, password_hash, role, organization_id, created_at)
      VALUES (?, ?, ?, 'specialist', 'org-demo', '2026-01-01')
    `).run(spec2Id, 'spec2@hospital.local', pwdHash);

    // Пациент 1 и Пациент 2
    const p1 = 'patient-progress';
    const p2 = 'patient-skips';

    // Даём доступ Spec 1 -> P1, Spec 2 -> P2
    db.db.prepare('DELETE FROM patient_access WHERE user_id IN (?, ?)').run(spec1Id, spec2Id);
    db.db.prepare('INSERT INTO patient_access (id, user_id, patient_id, granted_at) VALUES (?, ?, ?, ?)').run('a1', spec1Id, p1, '2026-01-01');
    db.db.prepare('INSERT INTO patient_access (id, user_id, patient_id, granted_at) VALUES (?, ?, ?, ?)').run('a2', spec2Id, p2, '2026-01-01');

    // Проверка hasPatientAccess
    expect(db.hasPatientAccess(spec1Id, p1)).toBe(true);
    expect(db.hasPatientAccess(spec1Id, p2)).toBe(false);

    expect(db.hasPatientAccess(spec2Id, p2)).toBe(true);
    expect(db.hasPatientAccess(spec2Id, p1)).toBe(false);

    // Проверка listPatientsForUser
    const spec1Patients = db.listPatientsForUser(spec1Id);
    expect(spec1Patients.map((p) => p.id)).toContain(p1);
    expect(spec1Patients.map((p) => p.id)).not.toContain(p2);

    const spec2Patients = db.listPatientsForUser(spec2Id);
    expect(spec2Patients.map((p) => p.id)).toContain(p2);
    expect(spec2Patients.map((p) => p.id)).not.toContain(p1);
  });

  it('администратор имеет доступ ко всем пациентам', () => {
    const db = openDatabase(dbPath);
    const admin = db.findUserByEmail('admin@legkie.local')!;
    expect(admin.role).toBe('admin');

    expect(db.hasPatientAccess(admin.id, 'patient-progress')).toBe(true);
    expect(db.hasPatientAccess(admin.id, 'patient-skips')).toBe(true);
    expect(db.hasPatientAccess(admin.id, 'patient-decline')).toBe(true);

    const all = db.listPatientsForUser(admin.id);
    expect(all.length).toBeGreaterThanOrEqual(9);
  });

  it('создание версий назначений сохраняет историю и привязку к создателю', () => {
    const db = openDatabase(dbPath);
    const patientId = 'patient-progress';
    const doctor = db.findUserByEmail('doctor@legkie.local')!;

    const newAssignment = db.createAssignmentVersion({
      patientId,
      createdByUserId: doctor.id,
      sessionsPerWeek: 4,
      targetBreaths: 10,
      minCompletedBreathSeconds: 2.0,
      targetBreathDurationMin: 2.5,
      targetBreathDurationMax: 4.5,
      validFrom: '2026-10-01T00:00:00.000Z',
      note: 'Увеличение нагрузки в связи с хорошей динамикой',
    });

    expect(newAssignment.id).toBeTruthy();
    expect(newAssignment.sessions_per_week).toBe(4);
    expect(newAssignment.target_breaths).toBe(10);
    expect(newAssignment.min_completed_breath_seconds).toBe(2.0);

    const history = db.getPatientAssignments(patientId);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].id).toBe(newAssignment.id);
    expect(history[0].created_by_user_id).toBe(doctor.id);
  });

  it('аудит-лог не содержит персональных данных (email, псевдоним, диагноз) в details', () => {
    const db = openDatabase(dbPath);
    const doctor = db.findUserByEmail('doctor@legkie.local')!;

    db.logAuditEvent({
      userId: doctor.id,
      action: 'view_patient_card',
      resourceType: 'patient',
      resourceId: 'patient-progress',
      details: JSON.stringify({ section: 'analytics', period: '8weeks' }),
      ip: '127.0.0.1',
    });

    const [event] = db.listAuditEvents(1);
    expect(event.user_id).toBe(doctor.id);
    expect(event.action).toBe('view_patient_card');
    expect(event.resource_type).toBe('patient');
    expect(event.resource_id).toBe('patient-progress');

    // Проверяем отсутствие PII
    expect(event.details).not.toMatch(/@/); // нет email
    expect(event.details).not.toMatch(/Тимофей/); // нет имени/псевдонима
    expect(event.details).not.toMatch(/астма|диагноз/i); // нет диагнозов
  });
});
