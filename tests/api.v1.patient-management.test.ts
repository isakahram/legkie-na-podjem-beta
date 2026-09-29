import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authMiddleware, type AuthContextRequest } from '../server/auth.ts';
import { AppDatabase } from '../server/db.ts';
import { createV1Router } from '../server/routes/v1/index.ts';

let server: Server;
let baseUrl = '';
let directory = '';
let testDb: AppDatabase;
let mariaToken = '';
let doctorToken = '';
let adminToken = '';
let demoToken = '';
let createdPatientId = '';

const authed = (token: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
});

async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return ((await response.json()) as { token: string }).token;
}

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'legkie-patient-management-'));
  testDb = new AppDatabase(join(directory, 'patients.sqlite'));

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as AuthContextRequest).database = testDb;
    next();
  });
  app.use(authMiddleware);
  app.use('/api/v1', createV1Router(testDb));
  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
      resolve();
    });
  });

  [mariaToken, doctorToken, adminToken, demoToken] = await Promise.all([
    login('maria@legkie.local', 'SpecialistPass123!'),
    login('doctor@legkie.local', 'DoctorPass123!'),
    login('admin@legkie.local', 'AdminPass123!'),
    login('demo@legkie.local', 'DemoPass123!'),
  ]);

  const created = await fetch(
    `${baseUrl}/patients`,
    authed(mariaToken, {
      method: 'POST',
      body: JSON.stringify({ pseudonym: 'Профиль для правок', age: 8, gender: 'unspecified' }),
    }),
  );
  createdPatientId = ((await created.json()) as { id: string }).id;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  testDb.close();
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('Управление профилем и архивом пациента', () => {
  it('PATCH обновляет псевдоним, возраст и пол', async () => {
    const response = await fetch(
      `${baseUrl}/patients/${createdPatientId}`,
      authed(mariaToken, {
        method: 'PATCH',
        body: JSON.stringify({ pseudonym: 'Обновлённый профиль', age: 10, gender: 'female' }),
      }),
    );
    expect(response.status).toBe(200);

    const detail = await fetch(`${baseUrl}/patients/${createdPatientId}`, authed(mariaToken));
    const body = (await detail.json()) as { patient: { pseudonym: string; age: number; gender: string } };
    expect(body.patient).toMatchObject({ pseudonym: 'Обновлённый профиль', age: 10, gender: 'female' });
  });

  it('PATCH валидирует возраст и пустой псевдоним', async () => {
    const invalidAge = await fetch(
      `${baseUrl}/patients/${createdPatientId}`,
      authed(mariaToken, {
        method: 'PATCH',
        body: JSON.stringify({ pseudonym: 'Допустимый', age: 13, gender: 'male' }),
      }),
    );
    expect(invalidAge.status).toBe(400);

    const emptyPseudonym = await fetch(
      `${baseUrl}/patients/${createdPatientId}`,
      authed(mariaToken, {
        method: 'PATCH',
        body: JSON.stringify({ pseudonym: '   ', age: 9, gender: 'male' }),
      }),
    );
    expect(emptyPseudonym.status).toBe(400);
  });

  it('demo_specialist не может редактировать или удалять пациента', async () => {
    const patch = await fetch(
      `${baseUrl}/patients/patient-progress`,
      authed(demoToken, {
        method: 'PATCH',
        body: JSON.stringify({ pseudonym: 'Нельзя', age: 8, gender: 'male' }),
      }),
    );
    const remove = await fetch(`${baseUrl}/patients/patient-progress`, authed(demoToken, { method: 'DELETE' }));
    expect(patch.status).toBe(403);
    expect(remove.status).toBe(403);
  });

  it('специалист не может редактировать или удалять чужого пациента', async () => {
    const patch = await fetch(
      `${baseUrl}/patients/${createdPatientId}`,
      authed(doctorToken, {
        method: 'PATCH',
        body: JSON.stringify({ pseudonym: 'Чужой', age: 8, gender: 'male' }),
      }),
    );
    const remove = await fetch(`${baseUrl}/patients/${createdPatientId}`, authed(doctorToken, { method: 'DELETE' }));
    expect(patch.status).toBe(403);
    expect(remove.status).toBe(403);
  });

  it('DELETE архивирует пациента и исключает его из кабинета, KPI и журнала', async () => {
    const archivedId = 'patient-maria-stable';
    const sessionsBefore = testDb.db
      .prepare('SELECT COUNT(*) AS count FROM training_sessions WHERE patient_id = ?')
      .get(archivedId) as { count: number };
    expect(sessionsBefore.count).toBeGreaterThan(0);

    const dashboardBefore = (await (
      await fetch(`${baseUrl}/dashboard?period=week`, authed(mariaToken))
    ).json()) as { kpi: { totalPatients: number } };
    const response = await fetch(`${baseUrl}/patients/${archivedId}`, authed(mariaToken, { method: 'DELETE' }));
    expect(response.status).toBe(200);

    const archived = testDb.db.prepare('SELECT archived_at FROM patients WHERE id = ?').get(archivedId) as {
      archived_at: string | null;
    };
    const audit = testDb.db
      .prepare("SELECT action, details FROM audit_events WHERE resource_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(archivedId) as { action: string; details: string };
    const sessionsAfter = testDb.db
      .prepare('SELECT COUNT(*) AS count FROM training_sessions WHERE patient_id = ?')
      .get(archivedId) as { count: number };
    expect(archived.archived_at).toBeTruthy();
    expect(audit).toMatchObject({ action: 'patient.archived', details: 'soft_delete' });
    expect(sessionsAfter.count).toBe(sessionsBefore.count);

    const list = (await (await fetch(`${baseUrl}/patients?pageSize=50`, authed(mariaToken))).json()) as {
      items: Array<{ id: string }>;
    };
    const sessions = (await (await fetch(`${baseUrl}/sessions?pageSize=500`, authed(mariaToken))).json()) as {
      items: Array<{ childId: string }>;
    };
    const assignments = await fetch(`${baseUrl}/patients/${archivedId}/assignments`, authed(mariaToken));
    const dashboardAfter = (await (
      await fetch(`${baseUrl}/dashboard?period=week`, authed(mariaToken))
    ).json()) as { kpi: { totalPatients: number } };

    expect(list.items.some((patient) => patient.id === archivedId)).toBe(false);
    expect(sessions.items.some((session) => session.childId === archivedId)).toBe(false);
    expect(assignments.status).toBe(403);
    expect(dashboardAfter.kpi.totalPatients).toBe(dashboardBefore.kpi.totalPatients - 1);
  });

  it('архивный пациент доступен только администратору через includeArchived=true', async () => {
    const archivedId = 'patient-maria-stable';
    const adminList = (await (
      await fetch(`${baseUrl}/patients?includeArchived=true&pageSize=50`, authed(adminToken))
    ).json()) as { items: Array<{ id: string; archivedAt?: string | null }> };
    const specialistList = await fetch(`${baseUrl}/patients?includeArchived=true`, authed(mariaToken));

    const archived = adminList.items.find((patient) => patient.id === archivedId);
    expect(archived?.archivedAt).toBeTruthy();
    expect(specialistList.status).toBe(403);
  });
});
