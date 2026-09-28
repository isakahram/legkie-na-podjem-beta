import type { Response } from 'express';
import { AUTH_COOKIE_NAME, SESSION_DURATION_HOURS, type AuthContextRequest } from '../../auth.ts';
import { db, type AppDatabase } from '../../db.ts';
import type { UserDto } from '../../../src/types.ts';
import type { UserRow } from '../../db.ts';

export function getDatabase(req: AuthContextRequest): AppDatabase {
  return req.database || db;
}

export function getClientIp(req: AuthContextRequest): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded)) return forwarded[0] ?? null;
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.ip || null;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DURATION_HOURS * 3600 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, { httpOnly: true, sameSite: 'lax', path: '/' });
}

/** Единое представление пользователя для клиента кабинета. */
export function toUserDto(user: UserRow): UserDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organization_id,
    organizationName: user.organization_name ?? null,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    displayName: user.display_name ?? null,
    clinicName: user.clinic_name ?? null,
    contactEmail: user.contact_email ?? null,
    contactPhone: user.contact_phone ?? null,
  };
}

/** Строковый параметр маршрута (Express типизирует params как string | string[]). */
export function routeParam(req: AuthContextRequest, name: string): string {
  const value = (req.params as Record<string, string | string[] | undefined>)[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return typeof value === 'string' ? value : '';
}
