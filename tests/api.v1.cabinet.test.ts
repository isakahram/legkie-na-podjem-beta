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
let testDb: AppDatabase;
let directory = '';

/** Токены живут весь файл: логин выполняется один раз в beforeAll. */
let mariaToken = '';
let doctorToken = '';
let demoToken = '';

const login = async (email: string, password: string): Promise<string> => {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json()) as { token: string };
  return data.token;
};

const authed = (token: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
});

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'legkie-cabinet-'));
  testDb = new AppDatabase(join(directory, 'cabinet.sqlite'));

  const testApp = express();
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    (req as AuthContextRequest).database = testDb;
    next();
  });
  testApp.use(authMiddleware);
  testApp.use('/api/v1', createV1Router(testDb));

  await new Promise<void>((resolve) => {
    server = createServer(testApp).listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
      resolve();
    });
  });

  mariaToken = await login('maria@legkie.local', 'SpecialistPass123!');
  doctorToken = await login('doctor@legkie.local', 'DoctorPass123!');

  const demoRes = await fetch(`${baseUrl}/demo/session`, { method: 'POST' });
  demoToken = ((await demoRes.json()) as { token: string }).token;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  try {
    testDb.close();
  } catch {
    // соединение уже закрыто
  }
  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // уборка временного каталога не должна ронять тесты
  }
});

describe('GET /api/v1/dashboard', () => {
  it('возвращает KPI, ряды, список внимания и ленту занятий', async () => {
    const res = await fetch(`${baseUrl}/dashboard?period=week`, authed(mariaToken));
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.period).toBe('week');
    expect(data.kpi.totalPatients).toBe(4);
    expect(data.kpi.targetSessionsInPeriod).toBeGreaterThan(0);
    expect(Array.isArray(data.series)).toBe(true);
    expect(data.series.length).toBe(8);
    expect(Array.isArray(data.attention)).toBe(true);
    expect(Array.isArray(data.recentSessions)).toBe(true);
  });

  it('период влияет на плановое число занятий', async () => {
    const week = (await (await fetch(`${baseUrl}/dashboard?period=week`, authed(mariaToken))).json()) as any;
    const long = (await (await fetch(`${baseUrl}/dashboard?period=8weeks`, authed(mariaToken))).json()) as any;
    expect(long.kpi.targetSessionsInPeriod).toBe(week.kpi.targetSessionsInPeriod * 8);
  });

  it('видит только своих пациентов: у разных специалистов разные сводки', async () => {
    const maria = (await (await fetch(`${baseUrl}/dashboard`, authed(mariaToken))).json()) as any;
    const doctor = (await (await fetch(`${baseUrl}/dashboard`, authed(doctorToken))).json()) as any;
    expect(maria.kpi.totalPatients).toBe(4);
    expect(doctor.kpi.totalPatients).toBe(9);
  });

  it('401 без авторизации', async () => {
    const res = await fetch(`${baseUrl}/dashboard`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/patients — поиск, фильтры, пагинация', () => {
  it('возвращает страницу с метаданными и меткой внимания', async () => {
    const res = await fetch(`${baseUrl}/patients?pageSize=2`, authed(mariaToken));
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.items).toHaveLength(2);
    expect(data.total).toBe(4);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(2);
    expect(data.items[0]).toHaveProperty('attention.needsAttention');
  });

  it('pageSize=200 (как запрашивает фильтр «Ребёнок» на странице «Занятия») — 200, не 400', async () => {
    const res = await fetch(`${baseUrl}/patients?pageSize=200`, authed(mariaToken));
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.pageSize).toBe(200);
    expect(data.items.length).toBeLessThanOrEqual(200);
  });

  it('поиск по псевдониму', async () => {
    const res = await fetch(`${baseUrl}/patients?search=${encodeURIComponent('Артём')}`, authed(mariaToken));
    const data = (await res.json()) as any;
    expect(data.total).toBe(1);
    expect(data.items[0].pseudonym).toContain('Артём');
  });

  it('фильтр «Требуют внимания» уменьшает выборку', async () => {
    const all = (await (await fetch(`${baseUrl}/patients?pageSize=50`, authed(mariaToken))).json()) as any;
    const flagged = (await (
      await fetch(`${baseUrl}/patients?filter=attention&pageSize=50`, authed(mariaToken))
    ).json()) as any;

    expect(flagged.total).toBeLessThanOrEqual(all.total);
    for (const patient of flagged.items) {
      expect(patient.attention.needsAttention).toBe(true);
    }
  });

  it('сортировка по возрасту работает в обе стороны', async () => {
    const asc = (await (
      await fetch(`${baseUrl}/patients?sort=age&direction=asc&pageSize=50`, authed(mariaToken))
    ).json()) as any;
    const desc = (await (
      await fetch(`${baseUrl}/patients?sort=age&direction=desc&pageSize=50`, authed(mariaToken))
    ).json()) as any;

    const ages = asc.items.map((patient: any) => patient.age);
    expect([...ages].sort((a: number, b: number) => a - b)).toEqual(ages);
    expect(desc.items[0].age).toBeGreaterThanOrEqual(asc.items[0].age);
  });

  it('пациенты другого специалиста в выдачу не попадают', async () => {
    const res = await fetch(`${baseUrl}/patients?pageSize=50`, authed(mariaToken));
    const data = (await res.json()) as any;
    const ids = data.items.map((patient: any) => patient.id);
    expect(ids).not.toContain('patient-progress');
    expect(ids.every((id: string) => id.startsWith('patient-maria-'))).toBe(true);
  });
});

describe('POST /api/v1/patients — создание профиля', () => {
  it('создаёт пациента, выдаёт код и открывает доступ автору', async () => {
    const res = await fetch(
      `${baseUrl}/patients`,
      authed(mariaToken, {
        method: 'POST',
        body: JSON.stringify({ pseudonym: 'Новый Н.', age: 9, gender: 'female' }),
      }),
    );

    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; code: string };
    expect(created.code).toMatch(/^[А-Я]{5}\d$/);

    const detail = await fetch(`${baseUrl}/patients/${created.id}`, authed(mariaToken));
    expect(detail.status).toBe(200);

    const body = (await detail.json()) as any;
    expect(body.patient.pseudonym).toBe('Новый Н.');
    expect(body.assignments).toHaveLength(1);
    expect(body.assignments[0].sessions_per_week).toBeGreaterThan(0);
  });

  it('чужой специалист нового пациента не видит', async () => {
    const list = (await (await fetch(`${baseUrl}/patients?pageSize=50`, authed(doctorToken))).json()) as any;
    expect(list.items.some((patient: any) => patient.pseudonym === 'Новый Н.')).toBe(false);
  });

  it('отклоняет некорректный возраст', async () => {
    const res = await fetch(
      `${baseUrl}/patients`,
      authed(mariaToken, {
        method: 'POST',
        body: JSON.stringify({ pseudonym: 'Взрослый В.', age: 33, gender: 'male' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('Демо-режим доступен только для чтения', () => {
  it('видит девять синтетических профилей', async () => {
    const res = await fetch(`${baseUrl}/patients?pageSize=50`, authed(demoToken));
    const data = (await res.json()) as any;
    expect(data.total).toBe(9);
  });

  it('создание пациента возвращает 403', async () => {
    const res = await fetch(
      `${baseUrl}/patients`,
      authed(demoToken, {
        method: 'POST',
        body: JSON.stringify({ pseudonym: 'Демо Д.', age: 7, gender: 'male' }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('смена пароля возвращает 403', async () => {
    const res = await fetch(
      `${baseUrl}/auth/change-password`,
      authed(demoToken, {
        method: 'POST',
        body: JSON.stringify({ oldPassword: 'DemoPass123!', newPassword: 'AnotherPass123!' }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe('Версионирование назначений', () => {
  it('новая версия закрывает предыдущую', async () => {
    const patientId = 'patient-maria-stable';

    const created = await fetch(
      `${baseUrl}/patients/${patientId}/assignments`,
      authed(mariaToken, {
        method: 'POST',
        body: JSON.stringify({
          sessionsPerWeek: 4,
          targetBreaths: 10,
          minCompletedBreathSeconds: 1.8,
          note: 'Увеличили нагрузку',
        }),
      }),
    );
    expect(created.status).toBe(201);

    const versions = (await (
      await fetch(`${baseUrl}/patients/${patientId}/assignments`, authed(mariaToken))
    ).json()) as any[];

    expect(versions.length).toBeGreaterThanOrEqual(2);
    expect(versions.filter((version) => version.valid_until === null)).toHaveLength(1);
  });

  it('завершение назначения проставляет дату окончания', async () => {
    const patientId = 'patient-maria-growth';
    const versions = (await (
      await fetch(`${baseUrl}/patients/${patientId}/assignments`, authed(mariaToken))
    ).json()) as any[];
    const activeVersion = versions.find((version) => version.valid_until === null);

    const closed = await fetch(
      `${baseUrl}/patients/${patientId}/assignments/${activeVersion.id}/close`,
      authed(mariaToken, { method: 'POST' }),
    );
    expect(closed.status).toBe(200);

    const repeated = await fetch(
      `${baseUrl}/patients/${patientId}/assignments/${activeVersion.id}/close`,
      authed(mariaToken, { method: 'POST' }),
    );
    expect(repeated.status).toBe(409);
  });

  it('демо-роль не может завершить назначение', async () => {
    const versions = (await (
      await fetch(`${baseUrl}/patients/patient-progress/assignments`, authed(demoToken))
    ).json()) as any[];

    const res = await fetch(
      `${baseUrl}/patients/patient-progress/assignments/${versions[0].id}/close`,
      authed(demoToken, { method: 'POST' }),
    );
    expect(res.status).toBe(403);
  });
});

describe('Аналитика, журнал занятий и отчёты карточки', () => {
  const patientId = 'patient-maria-stable';

  it('GET /patients/:id/analytics — ряды, план/факт и сравнение периодов', async () => {
    const res = await fetch(`${baseUrl}/patients/${patientId}/analytics`, authed(mariaToken));
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.weekly).toHaveLength(8);
    expect(data.planFact).toHaveLength(8);
    expect(data.planFact[0].planSessions).toBeGreaterThan(0);
    expect(data.comparison.current).toHaveProperty('adherencePercent');
    expect(data.comparison.previous).toHaveProperty('sessions');
  });

  it('GET /patients/:id/analytics — 403 для чужого пациента', async () => {
    const res = await fetch(`${baseUrl}/patients/patient-progress/analytics`, authed(mariaToken));
    expect(res.status).toBe(403);
  });

  it('GET /patients/:id/sessions — страница журнала с фильтрами', async () => {
    const all = (await (
      await fetch(`${baseUrl}/patients/${patientId}/sessions?pageSize=100`, authed(mariaToken))
    ).json()) as any;
    expect(all.total).toBeGreaterThan(0);

    const filtered = (await (
      await fetch(`${baseUrl}/patients/${patientId}/sessions?minBreaths=8&pageSize=100`, authed(mariaToken))
    ).json()) as any;
    expect(filtered.total).toBeLessThanOrEqual(all.total);
    for (const item of filtered.items) {
      expect(item.completedBreaths).toBeGreaterThanOrEqual(8);
    }
  });

  it('GET /sessions/:sessionId — агрегаты одного занятия своего пациента', async () => {
    const page = (await (
      await fetch(`${baseUrl}/patients/${patientId}/sessions?pageSize=1`, authed(mariaToken))
    ).json()) as any;
    const sessionId = page.items[0].id;

    const mine = await fetch(`${baseUrl}/sessions/${sessionId}`, authed(mariaToken));
    expect(mine.status).toBe(200);

    const foreign = await fetch(`${baseUrl}/sessions/${sessionId}`, authed(doctorToken));
    expect(foreign.status).toBe(404);
  });

  it('POST /patients/:id/reports — создаёт снимок и кладёт его в историю', async () => {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 8 * 7 * 86_400_000);

    const created = await fetch(
      `${baseUrl}/patients/${patientId}/reports`,
      authed(mariaToken, {
        method: 'POST',
        body: JSON.stringify({ periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() }),
      }),
    );
    expect(created.status).toBe(201);

    const report = (await created.json()) as any;
    expect(report.data.sessions).toBeGreaterThan(0);
    expect(report.data).toHaveProperty('averageAdherencePercent');

    const history = (await (
      await fetch(`${baseUrl}/patients/${patientId}/reports`, authed(mariaToken))
    ).json()) as any[];
    expect(history.some((item) => item.id === report.id)).toBe(true);
  });

  it('POST /patients/:id/reports — 403 в демо-режиме', async () => {
    const res = await fetch(
      `${baseUrl}/patients/patient-progress/reports`,
      authed(demoToken, { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(403);
  });

  it('GET /sessions — глобальный журнал ограничен своими пациентами', async () => {
    const res = await fetch(`${baseUrl}/sessions?pageSize=200`, authed(mariaToken));
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.total).toBeGreaterThan(0);
    const ids = new Set(data.items.map((item: any) => item.childId));
    for (const id of ids) {
      expect(String(id).startsWith('patient-maria-') || String(id).length === 36).toBe(true);
    }
    expect(ids.has('patient-progress')).toBe(false);
  });

  it('pageSize=500 (как запрашивает кнопка «Выгрузить CSV») — 200, не 400', async () => {
    const res = await fetch(`${baseUrl}/sessions?page=1&pageSize=500`, authed(mariaToken));
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.pageSize).toBe(500);
    expect(data.page).toBe(1);
    expect(data.items.length).toBeLessThanOrEqual(500);
  });

  it('GET /sessions?patientId=чужой — 403', async () => {
    const res = await fetch(`${baseUrl}/sessions?patientId=patient-progress`, authed(mariaToken));
    expect(res.status).toBe(403);
  });
});

describe('Настройки кабинета', () => {
  it('GET /settings — профиль, уведомления и параметры по умолчанию', async () => {
    const res = await fetch(`${baseUrl}/settings`, authed(mariaToken));
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.profile).toHaveProperty('displayName');
    expect(data.notifications.missedDaysThreshold).toBeGreaterThan(0);
    expect(data.assignmentDefaults.targetBreaths).toBeGreaterThan(0);
  });

  it('PUT /settings/profile — сохраняет профиль и возвращает пользователя', async () => {
    const res = await fetch(
      `${baseUrl}/settings/profile`,
      authed(mariaToken, {
        method: 'PUT',
        body: JSON.stringify({
          displayName: 'Мария Орлова',
          clinicName: 'Центр дыхательной реабилитации',
          contactEmail: 'maria.orlova@legkie.local',
          contactPhone: '+7 900 000-00-00',
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).user.displayName).toBe('Мария Орлова');

    const settings = (await (await fetch(`${baseUrl}/settings`, authed(mariaToken))).json()) as any;
    expect(settings.profile.clinicName).toBe('Центр дыхательной реабилитации');
  });

  it('PUT /settings/profile — 400 при неверной почте', async () => {
    const res = await fetch(
      `${baseUrl}/settings/profile`,
      authed(mariaToken, { method: 'PUT', body: JSON.stringify({ contactEmail: 'не-почта' }) }),
    );
    expect(res.status).toBe(400);
  });

  it('PUT /settings/notifications и /settings/defaults — сохраняются между запросами', async () => {
    const notifications = {
      emailAlerts: false,
      weeklyReport: true,
      missedDaysThreshold: 5,
      declineTrendPercent: -20,
    };
    const defaults = { sessionsPerWeek: 4, targetBreaths: 10, minCompletedBreathSeconds: 2 };

    expect(
      (
        await fetch(
          `${baseUrl}/settings/notifications`,
          authed(mariaToken, { method: 'PUT', body: JSON.stringify(notifications) }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(
          `${baseUrl}/settings/defaults`,
          authed(mariaToken, { method: 'PUT', body: JSON.stringify(defaults) }),
        )
      ).status,
    ).toBe(200);

    const settings = (await (await fetch(`${baseUrl}/settings`, authed(mariaToken))).json()) as any;
    expect(settings.notifications).toMatchObject(notifications);
    expect(settings.assignmentDefaults).toMatchObject(defaults);
  });

  it('PUT /settings/* — 403 в демо-режиме', async () => {
    for (const path of ['/settings/profile', '/settings/notifications', '/settings/defaults']) {
      const res = await fetch(`${baseUrl}${path}`, authed(demoToken, { method: 'PUT', body: JSON.stringify({}) }));
      expect(res.status).toBe(403);
    }
  });

  it('GET /settings/export — выгружает только своих детей', async () => {
    const res = await fetch(`${baseUrl}/settings/export`, authed(mariaToken));
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.patients.length).toBeGreaterThan(0);
    expect(data.patients[0]).toHaveProperty('sessions');

    const doctorExport = (await (await fetch(`${baseUrl}/settings/export`, authed(doctorToken))).json()) as any;
    const mine = new Set(data.patients.map((item: any) => item.pseudonym));
    const theirs = new Set(doctorExport.patients.map((item: any) => item.pseudonym));
    expect([...mine].some((name) => theirs.has(name))).toBe(false);
  });
});

describe('Активные входы', () => {
  it('GET /auth/sessions — помечает текущий вход', async () => {
    const res = await fetch(`${baseUrl}/auth/sessions`, authed(mariaToken));
    expect(res.status).toBe(200);

    const sessions = (await res.json()) as any[];
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.filter((item) => item.current)).toHaveLength(1);
  });

  it('DELETE /auth/sessions/:id — завершает только свой вход', async () => {
    const extraToken = await login('maria@legkie.local', 'SpecialistPass123!');
    const sessions = (await (await fetch(`${baseUrl}/auth/sessions`, authed(mariaToken))).json()) as any[];
    const other = sessions.find((item) => !item.current);
    expect(other).toBeTruthy();

    const foreign = await fetch(`${baseUrl}/auth/sessions/${other.id}`, authed(doctorToken, { method: 'DELETE' }));
    expect(foreign.status).toBe(404);

    const removed = await fetch(`${baseUrl}/auth/sessions/${other.id}`, authed(mariaToken, { method: 'DELETE' }));
    expect(removed.status).toBe(200);

    const afterRemove = await fetch(`${baseUrl}/settings`, authed(extraToken));
    expect(afterRemove.status).toBe(401);
  });

  it('POST /auth/sessions/revoke-all — завершает все входы пользователя', async () => {
    const token = await login('doctor@legkie.local', 'DoctorPass123!');
    expect((await fetch(`${baseUrl}/auth/sessions/revoke-all`, authed(token, { method: 'POST' }))).status).toBe(200);
    expect((await fetch(`${baseUrl}/settings`, authed(token))).status).toBe(401);

    doctorToken = await login('doctor@legkie.local', 'DoctorPass123!');
  });
});
