import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { z } from 'zod';
import type { AuthContextRequest } from '../../auth.ts';
import { db, type AppDatabase } from '../../db.ts';
import { createAnalyticsRouter } from './analytics.ts';
import { createAuthRouter } from './auth.ts';
import { createPatientsRouter } from './patients.ts';

/**
 * Сборка версионированного API кабинета специалиста.
 * Каждый раздел вынесен в свой модуль, чтобы файлы оставались обозримыми.
 */
export function createV1Router(customDb?: AppDatabase): Router {
  const router = express.Router();

  // Подмена БД для тестов и изолированных окружений.
  router.use((req: AuthContextRequest, _res, next) => {
    req.database = customDb || db;
    next();
  });

  router.use(createAuthRouter());
  router.use(createAnalyticsRouter());
  router.use(createPatientsRouter());

  // Ошибки валидации обрабатываются внутри роутера: поведение API не зависит
  // от того, в какое приложение он смонтирован (прод, тесты, изолированный стенд).
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Проверьте введённые данные',
        details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }
    return next(error);
  });

  return router;
}
