import type { Request, Response } from 'express';
import { getAnalyticsPayload, resetAnalyticsData } from './service';
import { DEBUG_LOGS_ENABLED } from '../../config/env';
import { emitContentUpdate } from '../../events';
import { appendLogLine } from '../../storage/logStore';

const shouldLogDebug = () => DEBUG_LOGS_ENABLED === true;

const redactIp = (value: unknown) => {
  if (typeof value !== 'string') return value;
  if (value.includes(':')) {
    const parts = value.split(':');
    return `${parts.slice(0, 2).join(':')}:****`;
  }
  const parts = value.split('.');
  if (parts.length !== 4) return value;
  return `${parts[0]}.${parts[1]}.***.***`;
};

const logAnalyticsCompat = async (req: Request) => {
  if (!shouldLogDebug()) return;
  try {
    const schemaHeader = req.headers['x-analytics-schema'];
    const schema = Array.isArray(schemaHeader) ? schemaHeader[0] : schemaHeader;
    if (schema && schema.trim() === 'v2') return;
    const line = JSON.stringify({
      at: new Date().toISOString(),
      ip: redactIp(req.ip),
      ua: req.headers['user-agent'] ? 'present' : 'missing',
      schema: schema || 'missing'
    });
    await appendLogLine('analytics-compat.log', line, 1000);
  } catch {
    // ignore logging errors
  }
};

export const getAnalytics = async (req: Request, res: Response) => {
  void logAnalyticsCompat(req);
  const includeUnsubscribed = req.query.includeUnsubscribed === 'true';
  return res.json(await getAnalyticsPayload({ includeUnsubscribed }));
};

export const resetAnalytics = async (_req: Request, res: Response) => {
  await resetAnalyticsData();
  emitContentUpdate('analytics');
  return res.json({ success: true, resetAt: new Date().toISOString() });
};
