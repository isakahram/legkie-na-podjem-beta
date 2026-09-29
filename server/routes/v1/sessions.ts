import express, { type Response, type Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePatientAccess, type AuthContextRequest } from '../../auth.ts';
import { filterSessions, paginateSessions } from '../../insights/patientAnalytics.ts';
import { getClientIp, getDatabase, routeParam } from './shared.ts';

const sessionsQuerySchema = z.object({
  patientId: z.string().trim().min(1).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  minDurationSeconds: z.coerce.number().min(0).max(7200).optional(),
  maxDurationSeconds: z.coerce.number().min(0).max(7200).optional(),
  minBreaths: z.coerce.number().int().min(0).max(500).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(500).optional(),
});

export function createSessionsRouter(): Router {
  const router = express.Router();

  // GET /api/v1/sessions — глобальный журнал занятий специалиста
  router.get('/sessions', requireAuth, (req: AuthContextRequest, res: Response) => {
    const database = getDatabase(req);
    const query = sessionsQuerySchema.parse(req.query);

    // Доступ ограничен пациентами, привязанными к специалисту.
    if (query.patientId && !database.hasPatientAccess(req.user!.id, query.patientId)) {
      res.status(403).json({ error: 'Доступ к данному пациенту запрещён' });
      return;
    }

    const all = database.listSessionsForUser(req.user!.id);
    const filtered = filterSessions(all, query);
    const result = paginateSessions(filtered, query.page ?? 1, query.pageSize ?? 20);

    database.logAuditEvent({
      userId: req.user!.id,
      action: 'list_sessions',
      resourceType: 'session',
      details: JSON.stringify({ count: result.total, scoped: Boolean(query.patientId) }),
      ip: getClientIp(req),
    });

    res.json(result);
  });

  // GET /api/v1/patients/:id/sessions — журнал занятий одного ребёнка
  router.get(
    '/patients/:id/sessions',
    requireAuth,
    requirePatientAccess,
    (req: AuthContextRequest, res: Response) => {
      const database = getDatabase(req);
      const query = sessionsQuerySchema.parse(req.query);
      const sessions = database.listSessions(routeParam(req, 'id'));
      const filtered = filterSessions(sessions, query);
      res.json(paginateSessions(filtered, query.page ?? 1, query.pageSize ?? 20));
    },
  );

  // GET /api/v1/sessions/:sessionId — агрегаты одного занятия
  router.get('/sessions/:sessionId', requireAuth, (req: AuthContextRequest, res: Response) => {
    const database = getDatabase(req);
    const sessionId = routeParam(req, 'sessionId');
    const session = database.listSessionsForUser(req.user!.id).find((item) => item.id === sessionId);

    if (!session) {
      res.status(404).json({ error: 'Занятие не найдено' });
      return;
    }

    res.json(session);
  });

  return router;
}
