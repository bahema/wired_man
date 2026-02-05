import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import mediaRoutes from './routes/media.routes';
import publicRoutes, { handleTrackedAutomationClick, handleTrackedClick } from './routes/public.routes';
import adminRoutes from './routes/admin.routes';
import publicActionsRoutes from './routes/public.actions.routes';
import {
  PUBLIC_URL,
  UPLOAD_DIR,
  R2_PUBLIC_BASE_URL,
  validateConfig
} from './config/env';

try {
  validateConfig();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Invalid configuration.';
  console.error(`Backend config error: ${message}`);
  process.exit(1);
}

const app = express();

app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json());

const useLocalUploads = !process.env.NETLIFY && !R2_PUBLIC_BASE_URL;
if (useLocalUploads) {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(path.resolve(UPLOAD_DIR))
  );
}
app.use('/api/media', mediaRoutes);
app.use('/api/public', publicRoutes);
app.use('/api', publicActionsRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/unsubscribe', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  res.redirect(302, `${PUBLIC_URL}/unsubscribe${qs}`);
});

app.get('/preferences', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  res.redirect(302, `${PUBLIC_URL}/preferences${qs}`);
});

// Click tracking redirect endpoint for rewritten email links.
app.get('/t/c/:campaignId/:token', handleTrackedClick);
app.get('/t/a/:automationId/:token', handleTrackedAutomationClick);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err.message || 'Upload error';
  if (message.toLowerCase().includes('file too large')) {
    return res.status(413).json({ error: 'File too large' });
  }
  if (message.toLowerCase().includes('unsupported')) {
    return res.status(415).json({ error: message });
  }
  return res.status(400).json({ error: message });
});

export default app;
