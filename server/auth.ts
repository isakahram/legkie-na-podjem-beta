import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, type AppDatabase } from './db.ts';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'admin' | 'specialist' | 'demo_specialist';
  organizationId: string | null;
  organizationName?: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface SessionInfo {
  id: string;
  userId: string;
  expiresAt: string;
  user: AuthenticatedUser;
}

export const AUTH_COOKIE_NAME = 'legkie_session';
export const SESSION_DURATION_HOURS = 24 * 7; // 7 дней

/**
 * Хэширование пароля через scrypt (N=16384, r=8, p=1, keylen=64, salt 16 байт).
 * Результат возвращается в формате salt:hash (hex).
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  });
  return `${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

/**
 * Проверка пароля со сгенерированным хэшем через timingSafeEqual.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [saltHex, keyHex] = storedHash.split(':');
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expectedKey = Buffer.from(keyHex, 'hex');
  if (salt.length !== 16 || expectedKey.length !== 64) return false;
  const derivedKey = scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 32 * 1024 * 1024,
  });
  return timingSafeEqual(expectedKey, derivedKey);
}

/**
 * Генерация токена сессии и его хэша для безопасного хранения в БД.
 */
export function generateSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  return { token, tokenHash };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * In-memory rate limiter для защиты /api/v1/auth/login от brute-force.
 */
export class RateLimiter {
  private attempts = new Map<string, { count: number; firstAttempt: number }>();

  constructor(
    private readonly maxAttempts = 5,
    private readonly windowMs = 15 * 60 * 1000, // 15 минут
  ) {}

  isAllowed(key: string): boolean {
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry) return true;
    if (now - entry.firstAttempt > this.windowMs) {
      this.attempts.delete(key);
      return true;
    }
    return entry.count < this.maxAttempts;
  }

  recordAttempt(key: string, success: boolean): void {
    if (success) {
      this.attempts.delete(key);
      return;
    }
    const now = Date.now();
    const entry = this.attempts.get(key);
    if (!entry || now - entry.firstAttempt > this.windowMs) {
      this.attempts.set(key, { count: 1, firstAttempt: now });
    } else {
      entry.count += 1;
    }
  }

  reset(): void {
    this.attempts.clear();
  }
}

export const loginRateLimiter = new RateLimiter();

export interface AuthContextRequest extends Request {
  user?: AuthenticatedUser;
  sessionId?: string;
  database?: AppDatabase;
}

/**
 * Middleware извлечения аутентификации из cookie.
 */
export function authMiddleware(req: AuthContextRequest, _res: Response, next: NextFunction): void {
  const database = req.database || db;
  const cookieHeader = req.headers.cookie;
  const token = parseCookie(cookieHeader, AUTH_COOKIE_NAME) || (req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? null);

  if (!token) {
    return next();
  }

  const tokenHash = hashToken(token);
  const session = database.getAuthSessionByTokenHash(tokenHash);

  if (session) {
    req.sessionId = session.id;
    req.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
      organizationId: session.user.organization_id,
      organizationName: session.user.organization_name,
      createdAt: session.user.created_at,
      lastLoginAt: session.user.last_login_at,
    };
    database.touchAuthSession(session.id);
  }

  return next();
}

/**
 * Middleware обязательной аутентификации.
 */
export function requireAuth(req: AuthContextRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  next();
}

/**
 * Middleware проверки ролей (RBAC).
 */
export function requireRole(...roles: Array<'admin' | 'specialist' | 'demo_specialist'>) {
  return (req: AuthContextRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Требуется авторизация' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Недостаточно прав для выполнения действия' });
      return;
    }
    next();
  };
}

/**
 * Middleware запрета мутаций для демо-специалиста (read-only).
 */
export function requireMutationAllowed(req: AuthContextRequest, res: Response, next: NextFunction): void {
  if (req.user?.role === 'demo_specialist') {
    const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method.toUpperCase());
    if (isMutation) {
      const database = req.database || db;
      database.logAuditEvent({
        userId: req.user.id,
        action: 'forbidden_mutation_attempt',
        resourceType: 'system',
        details: JSON.stringify({ method: req.method, path: req.baseUrl + req.path }),
        ip: req.ip || (req.headers['x-forwarded-for'] as string) || null,
      });
      res.status(403).json({ error: 'Демо-режим доступен только для чтения' });
      return;
    }
  }
  next();
}

/**
 * Middleware серверной проверки доступа к конкретному пациенту по :id.
 */
export function requirePatientAccess(req: AuthContextRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  const patientId = typeof req.params.id === 'string' ? req.params.id : '';
  if (!patientId) {
    res.status(400).json({ error: 'Не указан идентификатор пациента' });
    return;
  }

  const database = req.database || db;
  const hasAccess = database.hasPatientAccess(req.user.id, patientId);

  if (!hasAccess) {
    const xff = req.headers['x-forwarded-for'];
    const ipStr = Array.isArray(xff) ? xff[0] : (typeof xff === 'string' ? xff.split(',')[0].trim() : (req.ip || null));

    database.logAuditEvent({
      userId: req.user.id,
      action: 'unauthorized_patient_access_attempt',
      resourceType: 'patient',
      resourceId: patientId,
      details: JSON.stringify({ method: req.method }),
      ip: ipStr,
    });
    res.status(403).json({ error: 'Доступ к данному пациенту запрещён' });
    return;
  }

  next();
}
