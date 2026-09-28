import express, { type Response, type Router } from 'express';
import { z } from 'zod';
import {
  generateSessionToken,
  hashPassword,
  loginRateLimiter,
  requireAuth,
  requireMutationAllowed,
  SESSION_DURATION_HOURS,
  verifyPassword,
  type AuthContextRequest,
} from '../../auth.ts';
import {
  clearSessionCookie,
  getClientIp,
  getDatabase,
  setSessionCookie,
  toUserDto,
} from './shared.ts';

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Пароль должен содержать не менее 8 символов'),
});

const expiresAtFromNow = (): string =>
  new Date(Date.now() + SESSION_DURATION_HOURS * 3600 * 1000).toISOString();

export function createAuthRouter(): Router {
  const router = express.Router();

  // POST /api/v1/auth/login
  router.post('/auth/login', (req: AuthContextRequest, res: Response) => {
    const database = getDatabase(req);
    const ip = getClientIp(req);
    const limiterKey = `${ip || 'unknown'}:${req.body?.email || ''}`;

    if (!loginRateLimiter.isAllowed(limiterKey)) {
      res.status(429).json({ error: 'Слишком много неудачных попыток входа. Попробуйте через 15 минут.' });
      return;
    }

    const { email, password } = loginSchema.parse(req.body);
    const user = database.findUserByEmail(email);

    if (!user || !verifyPassword(password, user.password_hash)) {
      loginRateLimiter.recordAttempt(limiterKey, false);
      database.logAuditEvent({
        userId: user?.id ?? null,
        action: 'failed_login_attempt',
        resourceType: 'auth',
        details: JSON.stringify({ reason: 'invalid_credentials' }),
        ip,
      });
      res.status(401).json({ error: 'Неверный email или пароль' });
      return;
    }

    loginRateLimiter.recordAttempt(limiterKey, true);

    const { token, tokenHash } = generateSessionToken();
    database.createAuthSession({
      userId: user.id,
      tokenHash,
      expiresAt: expiresAtFromNow(),
      userAgent: req.headers['user-agent'] ?? null,
      ip,
    });
    database.updateUserLastLogin(user.id);
    database.logAuditEvent({
      userId: user.id,
      action: 'login',
      resourceType: 'auth',
      details: JSON.stringify({ role: user.role }),
      ip,
    });

    setSessionCookie(res, token);
    res.json({ user: toUserDto(user), token });
  });

  // POST /api/v1/auth/logout
  router.post('/auth/logout', requireAuth, (req: AuthContextRequest, res: Response) => {
    const database = getDatabase(req);
    if (req.sessionId) database.deleteAuthSession(req.sessionId);
    database.logAuditEvent({
      userId: req.user?.id ?? null,
      action: 'logout',
      resourceType: 'auth',
      ip: getClientIp(req),
    });
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // GET /api/v1/auth/me
  router.get('/auth/me', requireAuth, (req: AuthContextRequest, res: Response) => {
    res.json({ user: req.user });
  });

  // POST /api/v1/auth/change-password
  router.post(
    '/auth/change-password',
    requireAuth,
    requireMutationAllowed,
    (req: AuthContextRequest, res: Response) => {
      const database = getDatabase(req);
      const { oldPassword, newPassword } = changePasswordSchema.parse(req.body);
      const user = database.findUserById(req.user!.id);

      if (!user || !verifyPassword(oldPassword, user.password_hash)) {
        res.status(400).json({ error: 'Неверный текущий пароль' });
        return;
      }

      database.updateUserPassword(user.id, hashPassword(newPassword));
      database.logAuditEvent({
        userId: user.id,
        action: 'change_password',
        resourceType: 'user',
        resourceId: user.id,
        ip: getClientIp(req),
      });
      res.json({ ok: true });
    },
  );

  // POST /api/v1/demo/session — вход в ознакомительный режим без пароля.
  router.post('/demo/session', (req: AuthContextRequest, res: Response) => {
    const database = getDatabase(req);
    const demoUser = database.findUserByEmail('demo@legkie.local');

    if (!demoUser) {
      res.status(500).json({ error: 'Демо-пользователь не найден' });
      return;
    }

    const { token, tokenHash } = generateSessionToken();
    database.createAuthSession({
      userId: demoUser.id,
      tokenHash,
      expiresAt: expiresAtFromNow(),
      userAgent: req.headers['user-agent'] ?? null,
      ip: getClientIp(req),
    });
    database.logAuditEvent({
      userId: demoUser.id,
      action: 'demo_session_start',
      resourceType: 'auth',
      ip: getClientIp(req),
    });

    setSessionCookie(res, token);
    res.json({ user: toUserDto(demoUser), token, isDemo: true });
  });

  return router;
}
