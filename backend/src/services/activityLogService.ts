import crypto from 'crypto';
import db from '../db';

type ActivityMeta = Record<string, unknown>;

export const logAdminActivity = async (action: string, meta?: ActivityMeta, actor?: string | null) => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.exec(
    `INSERT INTO admin_activity (id, action, actor, metaJson, createdAt)
     VALUES (@id, @action, @actor, @metaJson, @createdAt)`,
    {
      id,
      action,
      actor: actor ?? null,
      metaJson: meta ? JSON.stringify(meta) : null,
      createdAt: now
    }
  );
};
