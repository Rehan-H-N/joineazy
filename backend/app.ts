import express from 'express';
import { rejectMongoOperators } from './middleware/auth.js';
import { analyticsRouter } from './routes/analyticsRoutes.js';
import { assignmentRouter } from './routes/assignmentRoutes.js';
import { authRouter } from './routes/authRoutes.js';
import { groupRouter } from './routes/groupRoutes.js';
import { studentRouter } from './routes/studentRoutes.js';
import { submissionRouter } from './routes/submissionRoutes.js';
import { db } from './db/repository.js';

export function createApiApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(rejectMongoOperators);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, storage: db.getStorageMode() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/students', studentRouter);
  app.use('/api/assignments', assignmentRouter);
  app.use('/api/groups', groupRouter);
  app.use('/api/submissions', submissionRouter);
  app.use('/api/analytics', analyticsRouter);

  return app;
}
