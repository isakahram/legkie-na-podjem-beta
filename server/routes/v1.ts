import express, { type Response, type Router } from 'express';
import { z } from 'zod';
import { calculatePatientAnalytics } from '../analytics.ts';
import {
  AUTH_COOKIE_NAME,
  generateSessionToken,
  hashPassword,
  loginRateLimiter,
  requireAuth,
  requireMutationAllowed,
  requirePatientAccess,
  SESSION_DURATION_HOURS,
  verifyPassword,
  type AuthContextRequest,
} from '../auth.ts';
import { db, type AppDatabase } from '../db.ts';

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Пароль должен содержать не менее 8 символов'),
});

const assignmentSchema = z.object({
  sessionsPerWeek: z.number().int().min(1).max(7),
  targetBreaths: z.number().int().min(4).max(30),
  minCompletedBreathSeconds: z.number().min(0.5).max(10).default(1.5),
  targetBreathDurationMin: z.number().min(0.5).max(15).nullable().optional(),
  targetBreathDurationMax: z.number().min(0.5).max(20).nullable().optional(),
  validFrom: z.string().datetime().optional(),
  note: z.string().max(500).nullable().optional(),
});

function getClientIp(req: AuthContextRequest): string | null {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || null;
}

function setSessionCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  const maxAge = SESSION_DURATION_HOURS * 3600 * 1000;
  // Express res.cookie
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge,
    path: '/',
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
}

export function createV1Router(customDb?: AppDatabase): Router {
  const router = express.Router();

  // Middleware для внедрения кастомной БД в запросы (полезно для тестов)
  router.use((req: AuthContextRequest, _res, next) => {
    req.database = customDb || db;
    next();
  });

  // ==========================================
  // АУТЕНТИФИКАЦИЯ
  // ==========================================

  // POST /api/v1/auth/login
  router.post('/auth/login', (req: AuthContextRequest, res: Response) => {
    const database = req.database || db;
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
    const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600 * 1000).toISOString();

    database.createAuthSession({
      userId: user.id,
      tokenHash,
      expiresAt,
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
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organization_id,
        organizationName: user.organization_name ?? null,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
      },
      token,
    });
  });

  // POST /api/v1/auth/logout
  router.post('/auth/logout', requireAuth, (req: AuthContextRequest, res: Response) => {
    const database = req.database || db;
    if (req.sessionId) {
      database.deleteAuthSession(req.sessionId);
    }
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
      const database = req.database || db;
      const { oldPassword, newPassword } = changePasswordSchema.parse(req.body);
      const user = database.findUserById(req.user!.id);

      if (!user || !verifyPassword(oldPassword, user.password_hash)) {
        res.status(400).json({ error: 'Неверный текущий пароль' });
        return;
      }

      const newHash = hashPassword(newPassword);
      database.updateUserPassword(user.id, newHash);
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

  // POST /api/v1/demo/session
  router.post('/demo/session', (req: AuthContextRequest, res: Response) => {
    const database = req.database || db;
    const demoUser = database.findUserByEmail('demo@legkie.local');

    if (!demoUser) {
      res.status(500).json({ error: 'Демо-пользователь не найден' });
      return;
    }

    const { token, tokenHash } = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 3600 * 1000).toISOString();

    database.createAuthSession({
      userId: demoUser.id,
      tokenHash,
      expiresAt,
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
    res.json({
      user: {
        id: demoUser.id,
        email: demoUser.email,
        role: demoUser.role,
        organizationId: demoUser.organization_id,
        organizationName: demoUser.organization_name ?? null,
        createdAt: demoUser.created_at,
        lastLoginAt: demoUser.last_login_at,
      },
      token,
      isDemo: true,
    });
  });

  // ==========================================
  // ПАЦИЕНТЫ И НАЗНАЧЕНИЯ
  // ==========================================

  // GET /api/v1/patients
  router.get('/patients', requireAuth, (req: AuthContextRequest, res: Response) => {
    const database = req.database || db;
    const patients = database.listPatientsForUser(req.user!.id);

    const result = patients.map((patient) => {
      const sessions = database.listSessions(patient.id);
      const analytics = calculatePatientAnalytics(sessions, {
        sessionsPerWeek: patient.assignment.sessionsPerWeek,
        targetBreaths: patient.assignment.targetBreaths,
        cyclesPerSession: patient.assignment.targetBreaths,
        recommendedDurationSeconds: 600,
      });

      return {
        ...patient,
        summary: analytics.summary,
      };
    });

    database.logAuditEvent({
      userId: req.user!.id,
      action: 'list_patients',
      resourceType: 'patient',
      details: JSON.stringify({ count: result.length }),
      ip: getClientIp(req),
    });

    res.json(result);
  });

  // GET /api/v1/patients/:id
  router.get('/patients/:id', requireAuth, requirePatientAccess, (req: AuthContextRequest, res: Response) => {
    const database = req.database || db;
    const patientId = req.params.id;
    const patients = database.listPatientsForUser(req.user!.id);
    const patient = patients.find((p) => p.id === patientId);

    if (!patient) {
      res.status(404).json({ error: 'Пациент не найден' });
      return;
    }

    const sessions = database.listSessions(patient.id);
    const analytics = calculatePatientAnalytics(sessions, {
      sessionsPerWeek: patient.assignment.sessionsPerWeek,
      targetBreaths: patient.assignment.targetBreaths,
      cyclesPerSession: patient.assignment.targetBreaths,
      recommendedDurationSeconds: 600,
    });

    const assignments = database.getPatientAssignments(patient.id);

    database.logAuditEvent({
      userId: req.user!.id,
      action: 'view_patient_detail',
      resourceType: 'patient',
      resourceId: patient.id,
      ip: getClientIp(req),
    });

    res.json({
      patient: { ...patient, summary: analytics.summary },
      weekly: analytics.weekly,
      sessions,
      assignments,
    });
  });

  // GET /api/v1/patients/:id/assignments
  router.get(
    '/patients/:id/assignments',
    requireAuth,
    requirePatientAccess,
    (req: AuthContextRequest, res: Response) => {
      const database = req.database || db;
      const patientId = typeof req.params.id === 'string' ? req.params.id : '';
      const assignments = database.getPatientAssignments(patientId);
      res.json(assignments);
    },
  );

  // POST /api/v1/patients/:id/assignments
  router.post(
    '/patients/:id/assignments',
    requireAuth,
    requirePatientAccess,
    requireMutationAllowed,
    (req: AuthContextRequest, res: Response) => {
      const database = req.database || db;
      const patientId = typeof req.params.id === 'string' ? req.params.id : '';
      const payload = assignmentSchema.parse(req.body);
      const validFrom = payload.validFrom ?? new Date().toISOString();

      const created = database.createAssignmentVersion({
        patientId,
        createdByUserId: req.user!.id,
        sessionsPerWeek: payload.sessionsPerWeek,
        targetBreaths: payload.targetBreaths,
        minCompletedBreathSeconds: payload.minCompletedBreathSeconds,
        targetBreathDurationMin: payload.targetBreathDurationMin ?? null,
        targetBreathDurationMax: payload.targetBreathDurationMax ?? null,
        validFrom,
        note: payload.note ?? null,
      });

      database.logAuditEvent({
        userId: req.user!.id,
        action: 'create_assignment',
        resourceType: 'assignment',
        resourceId: created.id,
        details: JSON.stringify({
          patientId,
          sessionsPerWeek: payload.sessionsPerWeek,
          targetBreaths: payload.targetBreaths,
        }),
        ip: getClientIp(req),
      });

      res.status(201).json(created);
    },
  );

  return router;
}
