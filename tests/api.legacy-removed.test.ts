import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let server: Server;
let baseUrl = '';
let directory = '';

beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), 'legkie-legacy-'));
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_PATH = join(directory, 'legacy.sqlite');

  const { app } = await import('../server/index.ts');

  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  try {
    const dbModule = await import('../server/db.ts');
    const closeFn =
      (dbModule as { closeDatabase?: () => void }).closeDatabase ??
      (dbModule as { closeDb?: () => void }).closeDb;
    if (typeof closeFn === 'function') closeFn();
  } catch {
    // модуль БД мог не загрузиться — ничего не делаем
  }

  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Windows может держать файл — не роняем тест из-за уборки
  }
});

describe('Старые маршруты кабинета удалены', () => {
  it.each([
    '/api/clinician/children',
    '/api/clinician/children/child-demo',
    '/api/clinician/sessions',
  ])('%s отвечает 404', async (path) => {
    const res = await fetch(`${baseUrl}${path}`);
    expect(res.status).toBe(404);
  });
});

describe('Игровые маршруты ребёнка продолжают работать', () => {
  it('POST /api/child/access пускает по коду из сида', async () => {
    const res = await fetch(`${baseUrl}/api/child/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'ВЕТЕР7' }),
    });
    expect(res.status).toBe(200);

    const child = (await res.json()) as { id: string; balance: number };
    expect(child.id).toBe('child-luna');
    expect(typeof child.balance).toBe('number');
  });

  it('POST /api/sessions принимает занятие и обновляет баланс', async () => {
    const access = await fetch(`${baseUrl}/api/child/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'ВЕТЕР7' }),
    });
    expect(access.status).toBe(200);

    const child = (await access.json()) as { id: string; balance: number };
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        childId: child.id,
        startedAt: new Date().toISOString(),
        durationSeconds: 300,
        breathCount: 8,
        averageStrength: 0.6,
        averageBreathDuration: 3,
        averageStability: 80,
        correctBreathPercent: 85,
        completedBreaths: 7,
        targetBreaths: 8,
        coinsCollected: 5,
        averageLatencyMs: 50,
        maxLatencyMs: 80,
        technicalPauses: 0,
        status: 'completed',
        inputMode: 'microphone',
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { balance: number };
    expect(body.balance).toBeGreaterThanOrEqual(child.balance);
  });

  it('GET /api/health отвечает', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
  });
});
