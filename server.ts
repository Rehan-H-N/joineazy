import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './backend/app.js';
import { db } from './backend/db/repository.js';
import { realtimeHub } from './backend/realtime/wsServer.js';

async function bootstrap() {
  const storageMode = await db.init();
  console.log(`[Joineazy] Storage initialized (${storageMode})`);

  const app = createApiApp();
  const server = http.createServer(app);
  realtimeHub.attach(server);

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProd || !fs.existsSync(distDir)) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`[Joineazy] Full-stack server running on http://0.0.0.0:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Joineazy] Fatal server startup error:', err);
  process.exit(1);
});
