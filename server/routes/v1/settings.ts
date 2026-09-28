import express, { type Response, type Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireMutationAllowed, type AuthContextRequest } from '../../auth.ts';
import { DEFAULT_ATTENTION_THRESHOLDS, resolveThresholds } from '../../insights/attention.ts';
import { buildPatientViews } from '../../insights/patients.ts';
import type { AssignmentDefaults, AuthSessionDto, NotificationPrefs } from '../../../src/types.ts';
import { getClientIp, getDatabase, routeParam, toUserDto } from './shared.ts';

const profileSchema = z.object({
  displayName: z.string().trim().max(120).nullable().optional(),
  clinicName: z.string().trim().max(160).nullable().optional(),
  contactEmail: z.string().trim().email().nullable().optional().or(z.literal('')),
  contactPhone: z.string().trim().max(40).nullable().optional(),
});

const notificationsSchema = z.object({
  emailAlerts: z.boolean(),
  weeklyReport: z.boolean(),
  missedDaysThreshold: z.number().int().min(1).max(30),
  declineTrendPercent: z.number().min(-100).max(0),
});

const defaultsSchema = z.object({
  sessionsPerWeek: z.number().int().min(1).max(7),
  targetBreaths: z.number().int().min(4).max(30),
  minCompletedBreathSeconds: z.number().min(0.5).max(10),
});

const DEFAULT_ASSIGNMENT_DEFAULTS: AssignmentDefaults = {
  sessionsPerWeek: 3,
  targetBreaths: 8,
  minCompletedBreathSeconds: 1.5,
};

/** Настройки уведомлений с подстановкой значений по умолчанию. */
function readNotifications(raw: unknown): NotificationPrefs {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const thresholds = resolveThresholds(raw);
  return {
    emailAlerts: source.emailAlerts !== false,
    weeklyReport: source.weeklyReport !== false,
    missedDaysThreshold: thresholds.missedDays,
    declineTrendPercent: thresholds.declinePercent,
  };
}

/** Параметры назначений по умолчанию с подстановкой значений по умолчанию. */
function readDefaults(raw: unknown): AssignmentDefaults {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  return {
    sessionsPerWeek: pick(source.sessionsPerWeek, DEFAULT_ASSIGNMENT_DEFAULTS.sessionsPerWeek),
    targetBreaths: pick(source.targetBreaths, DEFAULT_ASSIGNMENT_DEFAULTS.targetBreaths),
    minCompletedBreathSeconds: pick(
      source.minBreathSeconds ?? source.minCompletedBreathSeconds,
      DEFAULT_ASSIGNMENT_DEFAULTS.minCompletedBreathSeconds,
    ),
  };
}

export function createSettingsRouter(): Router {
  const router = express.Router();

  // GET /api/v1/settings — профиль, уведомления, параметры назначений
  router.get('/settings', requireAuth, (req: AuthContextRequest, res: Response) => {
    const database = getDatabase(req);
    const user = database.findUserById(req.user!.id);
    const stored = database.getSpecialistSettings(req.user!.id);

    res.json({
      profile: {
        displayName: user?.display_name ?? null,
        clinicName: user?.clinic_name ?? null,
        contactEmail: user?.contact_email ?? null,
        contactPhone: user?.contact_phone ?? null,
      },
      notifications: readNotifications(stored.notifications),
      assignmentDefaults: readDefaults(stored.thresholds),
      attentionThresholds: DEFAULT_ATTENTION_THRESHOLDS,
      updatedAt: stored.updatedAt,
    });
  });

  // PUT /api/v1/settings/profile
  router.put(
    '/settings/profile',
    requireAuth,
    requireMutationAllowed,
    (req: AuthContextRequest, res: Response) => {
      const database = getDatabase(req);
      const payload = profileSchema.parse(req.body);

      database.updateUserProfile(req.user!.id, {
        displayName: payload.displayName?.trim() || null,
        clinicName: payload.clinicName?.trim() || null,
        contactEmail: payload.contactEmail?.trim() || null,
        contactPhone: payload.contactPhone?.trim() || null,
      });

      database.logAuditEvent({
        userId: req.user!.id,
        action: 'update_profile',
        resourceType: 'user',
        resourceId: req.user!.id,
        ip: getClientIp(req),
      });

      const updated = database.findUserById(req.user!.id);
      res.json({ user: updated ? toUserDto(updated) : req.user });
    },
  );

  // PUT /api/v1/settings/notifications
  router.put(
    '/settings/notifications',
    requireAuth,
    requireMutationAllowed,
    (req: AuthContextRequest, res: Response) => {
      const database = getDatabase(req);
      const payload = notificationsSchema.parse(req.body);
      database.saveSpecialistSettings(req.user!.id, { notifications: payload });
      database.logAuditEvent({
        userId: req.user!.id,
        action: 'update_notifications',
        resourceType: 'settings',
        resourceId: req.user!.id,
        ip: getClientIp(req),
      });
      res.json(payload);
    },
  );

  // PUT /api/v1/settings/defaults
  router.put(
    '/settings/defaults',
    requireAuth,
    requireMutationAllowed,
    (req: AuthContextRequest, res: Response) => {
      const database = getDatabase(req);
      const payload = defaultsSchema.parse(req.body);
      database.saveSpecialistSettings(req.user!.id, {
        thresholds: {
          sessionsPerWeek: payload.sessionsPerWeek,
          targetBreaths: payload.targetBreaths,
          minBreathSeconds: payload.minCompletedBreathSeconds,
        },
      });
      database.logAuditEvent({
        userId: req.user!.id,
        action: 'update_assignment_defaults',
        resourceType: 'settings',
        resourceId: req.user!.id,
        ip: getClientIp(req),
      });
      res.json(payload);
    },
  );

  // GET /api/v1/settings/export — выгрузка данных своих пациентов
  router.get('/settings/export', requireAuth, (req: AuthContextRequest, res: Response) => {
    const database = getDatabase(req);
    const views = buildPatientViews(database, req.user!.id);

    database.logAuditEvent({
      userId: req.user!.id,
      action: 'export_data',
      resourceType: 'patient',
      details: JSON.stringify({ patients: views.length }),
      ip: getClientIp(req),
    });

    res.json({
      generatedAt: new Date().toISOString(),
      patients: views.map((view) => ({
        pseudonym: view.pseudonym,
        age: view.item.age,
        assignment: view.item.assignment,
        summary: view.summary,
        sessions: view.sessions.map((session) => ({
          startedAt: session.startedAt,
          durationSeconds: session.durationSeconds,
          completedBreaths: session.completedBreaths,
          targetBreaths: session.targetBreaths,
          averageBreathDuration: session.averageBreathDuration,
          averageStability: session.averageStability,
          status: session.status,
          inputMode: session.inputMode,
        })),
      })),
    });
  });

  // GET /api/v1/auth/sessions — активные входы
  router.get('/auth/sessions', requireAuth, (req: AuthContextRequest, res: Response) => {
    const database = getDatabase(req);
    const sessions: AuthSessionDto[] = database.listAuthSessionsForUser(req.user!.id).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
      expiresAt: row.expires_at,
      userAgent: row.user_agent,
      ip: row.ip,
      current: row.id === req.sessionId,
    }));
    res.json(sessions);
  });

  // DELETE /api/v1/auth/sessions/:sessionId — завершить один вход
  router.delete(
    '/auth/sessions/:sessionId',
    requireAuth,
    requireMutationAllowed,
    (req: AuthContextRequest, res: Response) => {
      const database = getDatabase(req);
      const sessionId = routeParam(req, 'sessionId');
      const owned = database.listAuthSessionsForUser(req.user!.id).some((row) => row.id === sessionId);

      if (!owned) {
        res.status(404).json({ error: 'Сессия не найдена' });
        return;
      }

      database.deleteAuthSession(sessionId);
      database.logAuditEvent({
        userId: req.user!.id,
        action: 'revoke_session',
        resourceType: 'auth',
        resourceId: sessionId,
        ip: getClientIp(req),
      });
      res.json({ ok: true });
    },
  );

  // POST /api/v1/auth/sessions/revoke-all — выход из всех устройств
  router.post(
    '/auth/sessions/revoke-all',
    requireAuth,
    requireMutationAllowed,
    (req: AuthContextRequest, res: Response) => {
      const database = getDatabase(req);
      database.deleteUserAuthSessions(req.user!.id);
      database.logAuditEvent({
        userId: req.user!.id,
        action: 'revoke_all_sessions',
        resourceType: 'auth',
        ip: getClientIp(req),
      });
      res.json({ ok: true });
    },
  );

  return router;
}
