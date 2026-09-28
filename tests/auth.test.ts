import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  generateSessionToken,
  hashPassword,
  RateLimiter,
  verifyPassword,
} from '../server/auth.ts';
import { AppDatabase } from '../server/db.ts';

let directory = '';
let dbPath = '';

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'legkie-auth-'));
  dbPath = join(directory, 'test.sqlite');
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('Хэширование паролей (scrypt)', () => {
  it('генерирует хэш в формате salt:hash и успешно верифицирует правильный пароль', () => {
    const password = 'CorrectPassword123!';
    const hash = hashPassword(password);

    expect(hash).toContain(':');
    const [saltHex, keyHex] = hash.split(':');
    expect(saltHex).toHaveLength(32); // 16 байт в hex
    expect(keyHex).toHaveLength(128); // 64 байта в hex

    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword('WrongPassword123!', hash)).toBe(false);
  });

  it('возвращает false при повреждённом или пустом хэше', () => {
    expect(verifyPassword('test', '')).toBe(false);
    expect(verifyPassword('test', 'invalid')).toBe(false);
    expect(verifyPassword('test', '12:34')).toBe(false);
  });

  it('два одинаковых пароля дают разные хэши из-за случайной соли', () => {
    const hash1 = hashPassword('MyPassword123');
    const hash2 = hashPassword('MyPassword123');
    expect(hash1).not.toBe(hash2);
    expect(verifyPassword('MyPassword123', hash1)).toBe(true);
    expect(verifyPassword('MyPassword123', hash2)).toBe(true);
  });
});

describe('Сессии и токены в БД', () => {
  it('создаёт сессию, находит по токену и удаляет при выходе', () => {
    const db = new AppDatabase(dbPath);
    const user = db.findUserByEmail('doctor@legkie.local')!;
    expect(user).not.toBeNull();

    const { token, tokenHash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    expect(token).toBeTruthy();
    const created = db.createAuthSession({
      userId: user.id,
      tokenHash,
      expiresAt,
      userAgent: 'Vitest/TestAgent',
      ip: '127.0.0.1',
    });
    expect(created.id).toBeTruthy();

    const session = db.getAuthSessionByTokenHash(tokenHash);
    expect(session).not.toBeNull();
    expect(session!.user.email).toBe('doctor@legkie.local');
    expect(session!.user.role).toBe('specialist');

    // Проверка обновления активности
    db.touchAuthSession(session!.id);

    // Удаление сессии
    db.deleteAuthSession(session!.id);
    expect(db.getAuthSessionByTokenHash(tokenHash)).toBeNull();
  });

  it('истекшая сессия не возвращается из БД', () => {
    const db = new AppDatabase(dbPath);
    const user = db.findUserByEmail('doctor@legkie.local')!;
    const { tokenHash } = generateSessionToken();
    const expiredAt = new Date(Date.now() - 3600 * 1000).toISOString();

    db.createAuthSession({
      userId: user.id,
      tokenHash,
      expiresAt: expiredAt,
    });

    expect(db.getAuthSessionByTokenHash(tokenHash)).toBeNull();
  });
});

describe('RateLimiter', () => {
  it('блокирует после превышения лимита неудачных попыток и сбрасывается при успехе', () => {
    const limiter = new RateLimiter(3, 10000);
    const ip = '192.168.1.100';

    expect(limiter.isAllowed(ip)).toBe(true);
    limiter.recordAttempt(ip, false); // 1
    expect(limiter.isAllowed(ip)).toBe(true);
    limiter.recordAttempt(ip, false); // 2
    expect(limiter.isAllowed(ip)).toBe(true);
    limiter.recordAttempt(ip, false); // 3
    expect(limiter.isAllowed(ip)).toBe(false);

    // Успешный вход сбрасывает счётчик
    limiter.recordAttempt(ip, true);
    expect(limiter.isAllowed(ip)).toBe(true);
  });
});
