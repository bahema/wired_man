import { Request, Response, NextFunction } from 'express';
import db from '../db';
import { ADMIN_TOKEN } from '../config/env';

export const requireAdminToken = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.headers['x-admin-token'];
  const token = Array.isArray(header) ? header[0] : header;
  const queryToken = typeof req.query.adminToken === 'string' ? req.query.adminToken : '';
  if (ADMIN_TOKEN && token && token === ADMIN_TOKEN) {
    return next();
  }
  if (ADMIN_TOKEN && queryToken && queryToken === ADMIN_TOKEN) {
    return next();
  }
  const sessionHeader = req.headers['x-admin-session'];
  const sessionToken = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
  const querySession = typeof req.query.adminSession === 'string' ? req.query.adminSession : '';
  const sessionValue = sessionToken || querySession;
  if (!sessionValue) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const session = await db.one<{ id?: string; expiresAt?: string; lastSeen?: string }>(
    'SELECT id, expiresAt, lastSeen FROM admin_sessions WHERE token = ? LIMIT 1',
    [sessionValue]
  );
  if (!session?.expiresAt) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    if (session.id) {
      await db.exec('DELETE FROM admin_sessions WHERE id = ?', [session.id]);
    }
    return res.status(401).json({ error: 'Session expired' });
  }
  const settings = await db.one<{ sessionIdleMins?: number }>(
    'SELECT sessionIdleMins FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  const idleMinutes = Math.min(240, Math.max(5, Number(settings?.sessionIdleMins || 20)));
  if (session.lastSeen) {
    const lastSeen = new Date(session.lastSeen).getTime();
    if (lastSeen + idleMinutes * 60 * 1000 <= Date.now()) {
      if (session.id) {
        await db.exec('DELETE FROM admin_sessions WHERE id = ?', [session.id]);
      }
      return res.status(401).json({ error: 'Session expired' });
    }
  }
  if (session.id) {
    await db.exec('UPDATE admin_sessions SET lastSeen = ? WHERE id = ?', [
      new Date().toISOString(),
      session.id
    ]);
  }
  return next();
};
