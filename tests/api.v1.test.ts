import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authMiddleware } from '../server/auth.ts';
import { AppDatabase } from '../server/db.ts';
import { createV1Router } from '../server/routes/v1.ts';

let server: Server;
let baseUrl = '';
let testDb: AppDatabase;
let directory = '';

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'legkie-api-v1-'));
  const dbPath = join(directory, 'api.sqlite');
  testDb = new AppDatabase(dbPath);

  const testApp = express();
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    (req as any).database = testDb;
    next();
  });
  testApp.use(authMiddleware);
  testApp.use('/api/v1', createV1Router(testDb));

  await new Promise<void>((resolve) => {
    server = createServer(testApp).listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(directory, { recursive: true, force: true });
});

describe('API v1: Аутентификация и безопасность', () => {
  let doctorToken = '';
  let demoToken = '';

  it('POST /api/v1/auth/login — успешный вход специалиста', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'doctor@legkie.local', password: 'DoctorPass123!' }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.user.email).toBe('doctor@legkie.local');
    expect(data.user.role).toBe('specialist');
    expect(data.token).toBeTruthy();
    doctorToken = data.token;

    // Cookie legkie_session выставлена
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain('legkie_session');
  });

  it('POST /api/v1/auth/login — отказ при неверном пароле', async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'doctor@legkie.local', password: 'WrongPassword' }),
    });

    expect(res.status).toBe(401);
  });

  it('GET /api/v1/auth/me — возвращает текущего пользователя по токену', async () => {
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.user.email).toBe('doctor@legkie.local');
  });

  it('GET /api/v1/auth/me — 401 без авторизации', async () => {
    const res = await fetch(`${baseUrl}/auth/me`);
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/demo/session — создаёт сессию demo_specialist', async () => {
    const res = await fetch(`${baseUrl}/demo/session`, { method: 'POST' });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.user.role).toBe('demo_specialist');
    expect(data.isDemo).toBe(true);
    demoToken = data.token;
    expect(demoToken).toBeTruthy();
  });

  it('POST /api/v1/auth/change-password — смена пароля и проверка входа', async () => {
    // 1. Ошибка при неверном старом пароле
    const failRes = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({ oldPassword: 'WrongOldPassword', newPassword: 'NewDoctorPass456!' }),
    });
    expect(failRes.status).toBe(400);

    // 2. Успешная смена пароля
    const okRes = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({ oldPassword: 'DoctorPass123!', newPassword: 'NewDoctorPass456!' }),
    });
    expect(okRes.status).toBe(200);

    // 3. Вход с новым паролем
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'doctor@legkie.local', password: 'NewDoctorPass456!' }),
    });
    expect(loginRes.status).toBe(200);
  });
});

describe('API v1: Изоляция пациентов и назначения', () => {
  let doctorToken = '';
  let demoToken = '';
  let foreignDoctorToken = '';

  beforeAll(async () => {
    // Вход основного доктора
    const docRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'doctor@legkie.local', password: 'NewDoctorPass456!' }),
    });
    doctorToken = ((await docRes.json()) as any).token;

    // Демо-доктор
    const demoRes = await fetch(`${baseUrl}/demo/session`, { method: 'POST' });
    demoToken = ((await demoRes.json()) as any).token;

    // Создаём стороннего врача без доступа к patient-progress
    testDb.db.prepare(`
      INSERT INTO users (id, email, password_hash, role, organization_id, created_at)
      VALUES ('user-foreign', 'foreign@legkie.local', 'dummy', 'specialist', 'org-demo', '2026-01-01')
    `).run();
    const { token, tokenHash } = (await import('../server/auth.ts')).generateSessionToken();
    testDb.createAuthSession({
      userId: 'user-foreign',
      tokenHash,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    foreignDoctorToken = token;
  });

  it('GET /api/v1/patients — список пациентов с агрегированной аналитикой', async () => {
    const res = await fetch(`${baseUrl}/patients`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    expect(res.status).toBe(200);
    const patients = (await res.json()) as any[];
    expect(Array.isArray(patients)).toBe(true);
    expect(patients.length).toBeGreaterThanOrEqual(5);

    const first = patients[0];
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('pseudonym');
    expect(first).toHaveProperty('summary');
    expect(first.summary).toHaveProperty('adherencePercent');
  });

  it('GET /api/v1/patients/:id — доступ разрешён для своего пациента', async () => {
    const res = await fetch(`${baseUrl}/patients/patient-progress`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    expect(res.status).toBe(200);
    const detail = (await res.json()) as any;
    expect(detail.patient.id).toBe('patient-progress');
    expect(detail.weekly).toHaveLength(8);
    expect(detail.sessions.length).toBeGreaterThan(0);
    expect(detail.assignments.length).toBeGreaterThan(0);
  });

  it('GET /api/v1/patients/:id — 403 Forbidden для врача без доступа', async () => {
    const res = await fetch(`${baseUrl}/patients/patient-progress`, {
      headers: { Authorization: `Bearer ${foreignDoctorToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('POST /api/v1/patients/:id/assignments — создание назначения врачом', async () => {
    const res = await fetch(`${baseUrl}/patients/patient-progress/assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${doctorToken}`,
      },
      body: JSON.stringify({
        sessionsPerWeek: 4,
        targetBreaths: 12,
        minCompletedBreathSeconds: 2.0,
        targetBreathDurationMin: 2.0,
        targetBreathDurationMax: 4.5,
        note: 'Новая цель по выдохам',
      }),
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as any;
    expect(created.sessions_per_week).toBe(4);
    expect(created.target_breaths).toBe(12);
  });

  it('POST /api/v1/patients/:id/assignments — 403 Forbidden для demo_specialist (read-only)', async () => {
    const res = await fetch(`${baseUrl}/patients/patient-progress/assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${demoToken}`,
      },
      body: JSON.stringify({
        sessionsPerWeek: 4,
        targetBreaths: 12,
        minCompletedBreathSeconds: 2.0,
      }),
    });

    expect(res.status).toBe(403);
    const err = (await res.json()) as any;
    expect(err.error).toMatch(/только для чтения/i);
  });
});
