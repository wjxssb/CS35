import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';
import { ScheduleParseError } from '../src/scheduleParser.js';

import authRoutes from './routes/auth.routes.js';
import meRoutes from './routes/me.routes.js';
import courseRoutes from './routes/course.routes.js';
import scheduleRoutes from './routes/schedule.routes.js';
import discoverRoutes from './routes/discover.routes.js';
import userRoutes from './routes/user.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

/** Build the Express app (no listening). Used by index.js and tests. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // Health check.
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // API routes.
  app.use('/api/auth', authRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/courses', courseRoutes);
  app.use('/api/schedule', scheduleRoutes);
  app.use('/api/discover', discoverRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/dashboard', dashboardRoutes);

  // 404 for unknown API routes.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // Uploaded files (avatars + pending schedule images).
  app.use('/uploads', express.static(path.join(config.dataDir, 'uploads'), { index: false, maxAge: '1h' }));

  // Static frontend + SPA fallback (only when the build exists).
  if (fs.existsSync(FRONTEND_DIST)) {
    app.use(express.static(FRONTEND_DIST));
    app.get(/^(?!\/(api|uploads)\/).*/, (req, res) => {
      res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
  }

  // Centralized error handler — never leak stack traces to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ScheduleParseError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }
    console.error('unhandled error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

export default createApp;
