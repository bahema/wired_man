import db from '../db';

type DbRow = Record<string, any>;

const buildClickUrl = (productId: string, source?: string | null, sessionId?: string | null) => {
  const metaParts: string[] = [];
  if (productId) metaParts.push(`product=${encodeURIComponent(productId)}`);
  if (source) metaParts.push(`source=${encodeURIComponent(source)}`);
  if (sessionId) metaParts.push(`session=${encodeURIComponent(sessionId)}`);
  const metaSuffix = metaParts.length ? `#${metaParts.join('&')}` : '';
  return `product:${productId}${metaSuffix}`;
};

export const runClickBackfill = async () => {
  const rows = await db.many<DbRow>(
    `SELECT c.id, c.productId, c.leadId, c.sessionId, c.source, c.createdAt
     FROM clicks c
     LEFT JOIN click_migrations m ON m.clickId = c.id
     WHERE m.clickId IS NULL`
  );

  if (!rows.length) {
    return { migrated: 0 };
  }

  const now = new Date().toISOString();
  let migrated = 0;

  for (const row of rows) {
    const productId = typeof row.productId === 'string' ? row.productId : '';
    if (!productId) continue;
    await db.exec(
      `INSERT INTO email_events
        (id, eventType, subscriberId, campaignId, automationId, url, userAgent, ip, createdAt)
       VALUES
        (@id, @eventType, @subscriberId, @campaignId, @automationId, @url, @userAgent, @ip, @createdAt)
       ON CONFLICT (id) DO NOTHING`,
      {
        id: row.id,
        eventType: 'click',
        subscriberId: typeof row.leadId === 'string' ? row.leadId : null,
        campaignId: null,
        automationId: null,
        url: buildClickUrl(
          productId,
          typeof row.source === 'string' ? row.source : null,
          typeof row.sessionId === 'string' ? row.sessionId : null
        ),
        userAgent: null,
        ip: null,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : now
      }
    );
    await db.exec(
      `INSERT INTO click_migrations (clickId, migratedAt)
       VALUES (@clickId, @migratedAt)
       ON CONFLICT (clickId) DO UPDATE SET migratedAt = EXCLUDED.migratedAt`,
      { clickId: row.id, migratedAt: now }
    );
    migrated += 1;
  }
  return { migrated };
};

export const dropClicksTable = async () => {
  await db.exec('DROP TABLE IF EXISTS clicks');
};
