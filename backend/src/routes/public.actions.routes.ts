import { Router } from 'express';
import crypto from 'crypto';
import db from '../db';
import { emitContentUpdate } from '../events';
import { DEBUG_LOGS_ENABLED } from '../config/env';
import { handlePublicSubscribe } from './public.routes';

type DbRow = Record<string, any>;

const router = Router();

router.post('/subscribe', async (req, res) => {
  if (DEBUG_LOGS_ENABLED) {
    const requestId = crypto.randomUUID();
    const line = JSON.stringify({
      at: new Date().toISOString(),
      route: '/api/subscribe',
      requestId
    });
    console.warn(`[deprecated] ${line}`);
  }
  return handlePublicSubscribe(req, res);
});

router.post('/track/click', async (req, res) => {
  const { productId, leadId, sessionId, source, campaignId, url } = req.body as {
    productId?: string;
    leadId?: string;
    sessionId?: string;
    source?: string;
    campaignId?: string;
    url?: string;
  };
  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ success: false, error: 'productId is required' });
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const resolvedUrl = typeof url === 'string' && url.trim()
    ? url.trim()
    : (await db.one<DbRow>('SELECT affiliateLink FROM products WHERE id = ? LIMIT 1', [productId]))?.affiliateLink || null;
  const metaParts: string[] = [];
  if (productId) metaParts.push(`product=${encodeURIComponent(productId)}`);
  if (source) metaParts.push(`source=${encodeURIComponent(source)}`);
  if (sessionId) metaParts.push(`session=${encodeURIComponent(sessionId)}`);
  const metaSuffix = metaParts.length ? `#${metaParts.join('&')}` : '';
  const trackedUrl = resolvedUrl ? `${resolvedUrl}${metaSuffix}` : `product:${productId}${metaSuffix}`;
  await db.exec(
    `INSERT INTO email_events (id, eventType, subscriberId, campaignId, automationId, url, userAgent, ip, createdAt)
     VALUES (@id, @eventType, @subscriberId, @campaignId, @automationId, @url, @userAgent, @ip, @createdAt)`,
    {
    id: crypto.randomUUID(),
    eventType: 'click',
    subscriberId: leadId || null,
    campaignId: typeof campaignId === 'string' ? campaignId : null,
    automationId: null,
    url: trackedUrl,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    ip: req.ip,
    createdAt: now
    }
  );
  emitContentUpdate('click', {
    campaignId: typeof campaignId === 'string' ? campaignId : null,
    subscriberId: leadId || null,
    url: trackedUrl,
    createdAt: now
  });
  return res.json({ success: true });
});

router.get('/track/open/:campaignId/:token.png', async (req, res) => {
  const { campaignId, token } = req.params;
  const isPreview = campaignId === 'preview' || token === 'preview' || campaignId === 'test' || token === 'test';
  const campaign = await db.one<DbRow>('SELECT id FROM email_campaigns WHERE id = ? LIMIT 1', [campaignId]);
  if (!campaign) {
    res.status(404);
  } else if (token && !isPreview) {
    const lead = await db.one<DbRow>('SELECT id FROM leads WHERE unsubscribeToken = ? LIMIT 1', [token]);
    const now = new Date().toISOString();
    await db.exec(
      `INSERT INTO email_events (id, eventType, subscriberId, campaignId, automationId, url, userAgent, ip, createdAt)
       VALUES (@id, @eventType, @subscriberId, @campaignId, @automationId, @url, @userAgent, @ip, @createdAt)`,
      {
      id: crypto.randomUUID(),
      eventType: 'open',
      subscriberId: lead?.id || null,
      campaignId,
      automationId: null,
      url: null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      ip: req.ip,
      createdAt: now
      }
    );
    emitContentUpdate('open', {
      campaignId,
      subscriberId: lead?.id || null,
      createdAt: now
    });
  }

  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
    'base64'
  );
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Content-Length', pixel.length);
  res.status(200).end(pixel);
});

router.get('/track/open/automation/:automationId/:token.png', async (req, res) => {
  const { automationId, token } = req.params;
  const isPreview = automationId === 'preview' || token === 'preview' || automationId === 'test' || token === 'test';
  const automation = await db.one<DbRow>('SELECT id FROM email_automations WHERE id = ? LIMIT 1', [automationId]);
  if (!automation) {
    res.status(404);
  } else if (token && !isPreview) {
    const lead = await db.one<DbRow>('SELECT id FROM leads WHERE unsubscribeToken = ? LIMIT 1', [token]);
    const now = new Date().toISOString();
    await db.exec(
      `INSERT INTO email_events (id, eventType, subscriberId, campaignId, automationId, url, userAgent, ip, createdAt)
       VALUES (@id, @eventType, @subscriberId, @campaignId, @automationId, @url, @userAgent, @ip, @createdAt)`,
      {
      id: crypto.randomUUID(),
      eventType: 'open',
      subscriberId: lead?.id || null,
      campaignId: null,
      automationId,
      url: null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      ip: req.ip,
      createdAt: now
      }
    );
    emitContentUpdate('open', {
      automationId,
      subscriberId: lead?.id || null,
      createdAt: now
    });
  }

  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
    'base64'
  );
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Content-Length', pixel.length);
  res.status(200).end(pixel);
});

export default router;
