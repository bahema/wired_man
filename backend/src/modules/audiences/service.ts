import db from '../../db';

type DbRow = Record<string, any>;

const parseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getAudiencesSummary = async () => {
  const now = new Date();
  const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const totalRow = await db.one<DbRow>('SELECT COUNT(*) as count FROM leads');
  const activeRow = await db.one<DbRow>(
    'SELECT COUNT(*) as count FROM leads WHERE isUnsubscribed = 0 AND emailInvalid = 0'
  );
  const unsubscribedRow = await db.one<DbRow>(
    'SELECT COUNT(*) as count FROM leads WHERE isUnsubscribed = 1'
  );
  const new7dRow = await db.one<DbRow>(
    'SELECT COUNT(*) as count FROM leads WHERE createdAt >= @start',
    { start: start7d }
  );

  const continentRows = await db.many<DbRow>(
    `SELECT continent, COUNT(*) as count
     FROM leads
     WHERE isUnsubscribed = 0 AND emailInvalid = 0
     GROUP BY continent`
  );

  const interestRows = await db.many<DbRow>(
    'SELECT interests FROM leads WHERE isUnsubscribed = 0 AND emailInvalid = 0'
  );
  const topicCounts = new Map<string, number>();
  interestRows.forEach((row) => {
    const list = typeof row.interests === 'string' ? parseJsonArray(row.interests) : [];
    list.forEach((topic) => {
      const key = String(topic || '').trim();
      if (!key) return;
      topicCounts.set(key, (topicCounts.get(key) || 0) + 1);
    });
  });

  const opens7dRow = await db.one<DbRow>(
    `SELECT COUNT(DISTINCT subscriberId) as count
     FROM email_events
     WHERE eventType = 'open' AND subscriberId IS NOT NULL AND createdAt >= @start`,
    { start: start7d }
  );
  const clicks7dRow = await db.one<DbRow>(
    `SELECT COUNT(DISTINCT subscriberId) as count
     FROM email_events
     WHERE eventType = 'click' AND subscriberId IS NOT NULL AND createdAt >= @start`,
    { start: start7d }
  );
  const engaged7dRow = await db.one<DbRow>(
    `SELECT COUNT(DISTINCT subscriberId) as count
     FROM email_events
     WHERE eventType IN ('open','click') AND subscriberId IS NOT NULL AND createdAt >= @start`,
    { start: start7d }
  );
  const engaged30dRow = await db.one<DbRow>(
    `SELECT COUNT(DISTINCT subscriberId) as count
     FROM email_events
     WHERE eventType IN ('open','click') AND subscriberId IS NOT NULL AND createdAt >= @start`,
    { start: start30d }
  );

  const activeCount = Number(activeRow?.count || 0);
  const engaged30d = Number(engaged30dRow?.count || 0);
  const inactive30d = Math.max(activeCount - engaged30d, 0);

  return {
    totals: {
      subscribers: Number(totalRow?.count || 0),
      active: activeCount,
      unsubscribed: Number(unsubscribedRow?.count || 0),
      newLast7Days: Number(new7dRow?.count || 0)
    },
    engagement: {
      engaged7d: Number(engaged7dRow?.count || 0),
      opens7d: Number(opens7dRow?.count || 0),
      clicks7d: Number(clicks7dRow?.count || 0),
      inactive30d
    },
    continents: continentRows
      .map((row) => ({
        name: typeof row.continent === 'string' && row.continent.trim() ? row.continent.trim() : 'Unknown',
        count: Number(row.count || 0)
      }))
      .sort((a, b) => b.count - a.count),
    topics: [...topicCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
  };
};
