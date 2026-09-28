import express, { type Response, type Router } from 'express';
import { requireAuth, type AuthContextRequest } from '../../auth.ts';
import { resolveThresholds } from '../../insights/attention.ts';
import { buildDashboard, parsePeriod } from '../../insights/dashboard.ts';
import { buildPatientViews } from '../../insights/patients.ts';
import { getClientIp, getDatabase } from './shared.ts';

export function createAnalyticsRouter(): Router {
  const router = express.Router();

  // GET /api/v1/dashboard?period=week|month|8weeks
  router.get('/dashboard', requireAuth, (req: AuthContextRequest, res: Response) => {
    const database = getDatabase(req);
    const thresholds = resolveThresholds(database.getSpecialistSettings(req.user!.id).notifications);
    const views = buildPatientViews(database, req.user!.id, { thresholds });
    const dashboard = buildDashboard(views, {
      period: parsePeriod(req.query.period),
      thresholds,
    });

    database.logAuditEvent({
      userId: req.user!.id,
      action: 'view_dashboard',
      resourceType: 'analytics',
      details: JSON.stringify({ period: dashboard.period, patients: views.length }),
      ip: getClientIp(req),
    });

    res.json(dashboard);
  });

  return router;
}
