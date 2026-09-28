import express, { type Response, type Router } from 'express';
import { z } from 'zod';
import {
  requireAuth,
  requireMutationAllowed,
  requirePatientAccess,
  type AuthContextRequest,
} from '../../auth.ts';
import { resolveThresholds } from '../../insights/attention.ts';
import { buildPatientViews, queryPatients } from '../../insights/patients.ts';
import { getClientIp, getDatabase, routeParam } from './shared.ts';

const assignmentSchema = z.object({
  sessionsPerWeek: z.number().int().min(1).max(7),
  targetBreaths: z.number().int().min(4).max(30),
  minCompletedBreathSeconds: z.number().min(0.5).max(10).default(1.5),
  targetBreathDurationMin: z.number().min(0.5).max(15).nullable().optional(),
  targetBreathDurationMax: z.number().min(0.5).max(20).nullable().optional(),
  validFrom: z.string().datetime().optional(),
  note: z.string().max(500).nullable().optional(),
});

const createPatientSchema = z.object({
  pseudonym: z.string().trim().min(2, 'Укажите псевдоним').max(60),
  age: z.number().int().min(5).max(12),
  gender: z.enum(['male', 'female', 'unspecified']).default('unspecified'),
});

const listQuerySchema = z.object({
  search: z.string().trim().max(60).optional(),
  filter: z.enum(['all', 'active', 'missed', 'declining', 'attention']).optional(),
  sort: z.enum(['lastSession', 'adherence', 'age', 'pseudonym']).optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/** Пороги «Требуют внимания» из настроек уведомлений специалиста. */
function thresholdsFor(req: AuthContextRequest) {
  const database = getDatabase(req);
  return resolveThresholds(database.getSpecialistSettings(req.user!.id).notifications);
}

export function createPatientsRouter(): Router {
  const router = express.Router();

  // GET /api/v1/patients — поиск, фильтры, сортировка, пагинация
  router.get('/patients', requireAuth, (req: AuthContextRequest, res: Response) => {
    const database = getDatabase(req);
    const query = listQuerySchema.parse(req.query);
    const views = buildPatientViews(database, req.user!.id, { thresholds: thresholdsFor(req) });
    const result = queryPatients(
      views.map((view) => view.item),
      query,
    );

    database.logAuditEvent({
      userId: req.user!.id,
      action: 'list_patients',
      resourceType: 'patient',
      details: JSON.stringify({ count: result.total, filter: query.filter ?? 'all' }),
      ip: getClientIp(req),
    });

    res.json(result);
  });

  // POST /api/v1/patients — создание пациента специалистом
  router.post('/patients', requireAuth, requireMutationAllowed, (req: AuthContextRequest, res: Response) => {
    const database = getDatabase(req);
    const payload = createPatientSchema.parse(req.body);
    const defaults = database.getSpecialistSettings(req.user!.id).thresholds as
      | { sessionsPerWeek?: number; targetBreaths?: number; minBreathSeconds?: number }
      | null;

    const created = database.createPatient({
      pseudonym: payload.pseudonym,
      age: payload.age,
      gender: payload.gender,
      ownerUserId: req.user!.id,
      sessionsPerWeek: defaults?.sessionsPerWeek ?? 3,
      targetBreaths: defaults?.targetBreaths ?? 8,
      minCompletedBreathSeconds: defaults?.minBreathSeconds ?? 1.5,
    });

    database.logAuditEvent({
      userId: req.user!.id,
      action: 'create_patient',
      resourceType: 'patient',
      resourceId: created.id,
      details: JSON.stringify({ age: payload.age, gender: payload.gender }),
      ip: getClientIp(req),
    });

    res.status(201).json({ id: created.id, code: created.code });
  });

  // GET /api/v1/patients/:id — карточка ребёнка
  router.get(
    '/patients/:id',
    requireAuth,
    requirePatientAccess,
    (req: AuthContextRequest, res: Response) => {
      const database = getDatabase(req);
      const view = buildPatientViews(database, req.user!.id, { thresholds: thresholdsFor(req) }).find(
        (candidate) => candidate.id === routeParam(req, 'id'),
      );

      if (!view) {
        res.status(404).json({ error: 'Пациент не найден' });
        return;
      }

      database.logAuditEvent({
        userId: req.user!.id,
        action: 'view_patient_detail',
        resourceType: 'patient',
        resourceId: view.id,
        ip: getClientIp(req),
      });

      res.json({
        patient: view.item,
        weekly: view.weekly,
        sessions: view.sessions,
        assignments: database.getPatientAssignments(view.id),
      });
    },
  );

  // GET /api/v1/patients/:id/assignments
  router.get(
    '/patients/:id/assignments',
    requireAuth,
    requirePatientAccess,
    (req: AuthContextRequest, res: Response) => {
      const database = getDatabase(req);
      res.json(database.getPatientAssignments(routeParam(req, 'id')));
    },
  );

  // POST /api/v1/patients/:id/assignments — новая версия назначения
  router.post(
    '/patients/:id/assignments',
    requireAuth,
    requirePatientAccess,
    requireMutationAllowed,
    (req: AuthContextRequest, res: Response) => {
      const database = getDatabase(req);
      const patientId = routeParam(req, 'id');
      const payload = assignmentSchema.parse(req.body);
      const validFrom = payload.validFrom ?? new Date().toISOString();

      // Версионирование: предыдущее активное назначение закрывается новой датой.
      const active = database
        .getPatientAssignments(patientId)
        .find((assignment) => assignment.valid_until === null);
      if (active) database.closeAssignmentVersion(active.id, validFrom);

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

  // POST /api/v1/patients/:id/assignments/:versionId/close — завершение назначения
  router.post(
    '/patients/:id/assignments/:versionId/close',
    requireAuth,
    requirePatientAccess,
    requireMutationAllowed,
    (req: AuthContextRequest, res: Response) => {
      const database = getDatabase(req);
      const belongs = database
        .getPatientAssignments(routeParam(req, 'id'))
        .some((assignment) => assignment.id === routeParam(req, 'versionId'));

      if (!belongs) {
        res.status(404).json({ error: 'Назначение не найдено' });
        return;
      }

      const closed = database.closeAssignmentVersion(routeParam(req, 'versionId'));
      if (!closed) {
        res.status(409).json({ error: 'Назначение уже завершено' });
        return;
      }

      database.logAuditEvent({
        userId: req.user!.id,
        action: 'close_assignment',
        resourceType: 'assignment',
        resourceId: routeParam(req, 'versionId'),
        ip: getClientIp(req),
      });

      res.json({ ok: true });
    },
  );

  return router;
}
