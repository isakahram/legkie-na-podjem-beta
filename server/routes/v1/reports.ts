import { subWeeks } from 'date-fns';
import express, { type Response, type Router } from 'express';
import { z } from 'zod';
import {
  requireAuth,
  requireMutationAllowed,
  requirePatientAccess,
  type AuthContextRequest,
} from '../../auth.ts';
import { buildPlanFact, buildReportSummary, compareRecentPeriods } from '../../insights/patientAnalytics.ts';
import { buildPatientViews } from '../../insights/patients.ts';
import type { ReportSummary } from '../../../src/types.ts';
import { getClientIp, getDatabase, routeParam } from './shared.ts';

const analyticsQuerySchema = z.object({
  period: z.enum(['month', '8weeks']).optional(),
});

const reportSchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

/** Загружает карточку пациента вместе с посчитанной аналитикой. */
function loadView(req: AuthContextRequest, patientId: string) {
  const database = getDatabase(req);
  return buildPatientViews(database, req.user!.id).find((view) => view.id === patientId) ?? null;
}

export function createReportsRouter(): Router {
  const router = express.Router();

  // GET /api/v1/patients/:id/analytics — ряды, план/факт, сравнение периодов
  router.get(
    '/patients/:id/analytics',
    requireAuth,
    requirePatientAccess,
    (req: AuthContextRequest, res: Response) => {
      analyticsQuerySchema.parse(req.query);
      const view = loadView(req, routeParam(req, 'id'));

      if (!view) {
        res.status(404).json({ error: 'Пациент не найден' });
        return;
      }

      res.json({
        weekly: view.weekly,
        planFact: buildPlanFact(view.weekly, view.sessionsPerWeek, view.targetBreaths),
        comparison: compareRecentPeriods(view.sessions, view.sessionsPerWeek),
      });
    },
  );

  // GET /api/v1/patients/:id/reports — история сформированных отчётов
  router.get(
    '/patients/:id/reports',
    requireAuth,
    requirePatientAccess,
    (req: AuthContextRequest, res: Response) => {
      const database = getDatabase(req);
      const rows = database.listReportSnapshots(routeParam(req, 'id'));

      res.json(
        rows.map((row) => ({
          id: row.id,
          patientId: row.patient_id,
          createdByUserId: row.created_by_user_id,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          createdAt: row.created_at,
          data: JSON.parse(row.data_json) as ReportSummary,
        })),
      );
    },
  );

  // POST /api/v1/patients/:id/reports — формирование отчёта за период
  router.post(
    '/patients/:id/reports',
    requireAuth,
    requirePatientAccess,
    requireMutationAllowed,
    (req: AuthContextRequest, res: Response) => {
      const database = getDatabase(req);
      const patientId = routeParam(req, 'id');
      const body = req.body && Object.keys(req.body).length > 0 ? reportSchema.parse(req.body) : null;
      const view = loadView(req, patientId);

      if (!view) {
        res.status(404).json({ error: 'Пациент не найден' });
        return;
      }

      const to = body ? new Date(body.periodEnd) : new Date();
      const from = body ? new Date(body.periodStart) : subWeeks(to, 8);

      if (from.getTime() >= to.getTime()) {
        res.status(400).json({ error: 'Начало периода должно быть раньше окончания' });
        return;
      }

      const summary = buildReportSummary(view.sessions, view.weekly, {
        from,
        to,
        sessionsPerWeek: view.sessionsPerWeek,
        trendPercent: view.summary.trendPercent,
      });

      const created = database.createReportSnapshot({
        patientId,
        createdByUserId: req.user!.id,
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
        data: summary,
      });

      database.logAuditEvent({
        userId: req.user!.id,
        action: 'create_report',
        resourceType: 'report',
        resourceId: created.id,
        details: JSON.stringify({ patientId, sessions: summary.sessions }),
        ip: getClientIp(req),
      });

      res.status(201).json({
        id: created.id,
        patientId,
        createdByUserId: req.user!.id,
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
        createdAt: created.createdAt,
        data: summary,
      });
    },
  );

  return router;
}
