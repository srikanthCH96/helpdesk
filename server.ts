import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApiRouter } from './server/routes.ts';
import { runSlaMonitorCycle } from './server/slaEngine.ts';

async function bootstrap() {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '4mb' }));

  // Mount enterprise REST API
  app.use('/api', createApiRouter());

  // Error handler for Multer / JSON syntax / unhandled API errors
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error('[API Error]', err.message);
      res.status(400).json({
        success: false,
        message: err.message || 'An unexpected server error occurred.',
      });
    }
  );

  // Run automated SLA monitor check on startup & every 60 seconds
  runSlaMonitorCycle();
  setInterval(() => {
    try {
      runSlaMonitorCycle();
    } catch (err) {
      console.error('[SLA Monitor Error]', err);
    }
  }, 60_000);

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`HelpDesk Pro Enterprise server running on http://0.0.0.0:${port}`);
  });
}

bootstrap();
