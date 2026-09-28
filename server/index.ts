import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { calculatePatientAnalytics } from './analytics.ts';
import { db } from './db.ts';

const app = express();
const port = Number(process.env.PORT || 3001);

app.disable('x-powered-by');
app.use(cors({ origin: true }));
app.use(express.json({ limit: '32kb' }));

const codeSchema = z.object({ code: z.string().trim().min(3).max(12) });
const calibrationSchema = z.object({
  childId: z.string().min(1),
  ambientRms: z.number().min(0).max(1),
  breathRms: z.number().min(0).max(1),
  breathZcr: z.number().min(0).max(1),
  breathCentroid: z.number().min(0).max(24_000),
  breathFlatness: z.number().min(0).max(1),
  quality: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
});
const sessionSchema = z.object({
  childId: z.string().min(1),
  startedAt: z.string().datetime(),
  durationSeconds: z.number().int().min(1).max(60 * 30),
  breathCount: z.number().int().min(0).max(500),
  averageStrength: z.number().min(0).max(1),
  averageBreathDuration: z.number().min(0).max(120).nullable(),
  bestDuration: z.number().min(0).max(120).nullable().optional(),
  averageStability: z.number().min(0).max(100).nullable(),
  correctBreathPercent: z.number().min(0).max(100),
  completedBreaths: z.number().int().min(0).max(20).optional(),
  targetBreaths: z.number().int().min(4).max(20).optional(),
  completedCycles: z.number().int().min(0).max(20).optional(),
  targetCycles: z.number().int().min(4).max(20).optional(),
  coinsCollected: z.number().int().min(0).max(10_000),
  averageLatencyMs: z.number().min(0).max(10_000).nullable(),
  maxLatencyMs: z.number().min(0).max(10_000).nullable(),
  technicalPauses: z.number().int().min(0).max(500),
  status: z.enum(['completed', 'stopped']),
  inputMode: z.enum(['microphone', 'demo']),
});

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'legkie-na-podjem-api' });
});

app.post('/api/child/access', (request, response) => {
  const { code } = codeSchema.parse(request.body);
  const child = db.findChildByCode(code);
  if (!child) return response.status(404).json({ error: 'Не нашли такой код. Проверьте буквы и цифры.' });
  return response.json(child);
});

app.get('/api/children/:id', (request, response) => {
  const child = db.getChild(request.params.id);
  if (!child) return response.status(404).json({ error: 'Профиль не найден' });
  return response.json(child);
});

app.post('/api/calibrations', (request, response) => {
  const parsed = calibrationSchema.parse(request.body);
  const { childId, ...profile } = parsed;
  if (!db.getChild(childId)) return response.status(404).json({ error: 'Профиль не найден' });
  db.saveCalibration(childId, profile);
  return response.status(201).json({ ok: true });
});

app.get('/api/children/:id/calibration', (request, response) => {
  if (!db.getChild(request.params.id)) return response.status(404).json({ error: 'Профиль не найден' });
  return response.json(db.latestCalibration(request.params.id));
});

app.post('/api/sessions', (request, response) => {
  const parsedPayload = sessionSchema.parse(request.body);
  const payload = { ...parsedPayload, completedBreaths: parsedPayload.completedBreaths ?? parsedPayload.completedCycles ?? 0, targetBreaths: parsedPayload.targetBreaths ?? parsedPayload.targetCycles ?? 8 } as const;
  if (!db.getChild(payload.childId)) return response.status(404).json({ error: 'Профиль не найден' });
  const session = db.insertSession(payload);
  // Demo controls are useful for previewing but must not grant rewards or affect summaries.
  const balance =
    payload.inputMode === 'microphone'
      ? db.rewardSession(payload.childId, payload.coinsCollected)
      : db.getChild(payload.childId)!.balance;
  return response.status(201).json({ session, balance });
});

app.post('/api/shop/purchase', (request, response) => {
  const parsed = z.object({ childId: z.string(), skinId: z.string() }).parse(request.body);
  return response.json(db.buySkin(parsed.childId, parsed.skinId));
});

app.put('/api/children/:id/skin', (request, response) => {
  const { skinId } = z.object({ skinId: z.string() }).parse(request.body);
  return response.json(db.selectSkin(request.params.id, skinId));
});

app.get('/api/clinician/children', (_request, response) => {
  const children = db.listChildren().map((child) => ({
    ...child,
    summary: calculatePatientAnalytics(db.listSessions(child.id), child.assignment).summary,
  }));
  return response.json(children);
});

app.get('/api/clinician/children/:id', (request, response) => {
  const child = db.listChildren().find((item) => item.id === request.params.id);
  if (!child) return response.status(404).json({ error: 'Пациент не найден' });
  const sessions = db.listSessions(child.id);
  const analytics = calculatePatientAnalytics(sessions, child.assignment);
  return response.json({
    child: { ...child, summary: analytics.summary },
    weekly: analytics.weekly,
    sessions,
  });
});

app.get('/api/clinician/sessions', (request, response) => {
  const childId = typeof request.query.childId === 'string' ? request.query.childId : undefined;
  return response.json(db.listSessions(childId));
});

// The production process can serve the compiled client as a single local service.
const distPath = join(process.cwd(), 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((request, response, next) => {
    if (request.path.startsWith('/api/')) return next();
    return response.sendFile(join(distPath, 'index.html'));
  });
}

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    return response.status(400).json({
      error: 'Проверьте введённые данные',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  const message = error instanceof Error ? error.message : 'Внутренняя ошибка сервера';
  console.error(error);
  return response.status(500).json({ error: message });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`API ready at http://0.0.0.0:${port}`);
});
