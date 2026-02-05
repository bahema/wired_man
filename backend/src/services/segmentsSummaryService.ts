import db from '../db';

type DbRow = Record<string, any>;

type SegmentsSummary = {
  generatedAt: string;
  totals: { active: number };
  continents: Array<{ name: string; count: number }>;
  sources: Array<{ name: string; count: number }>;
  segments: Array<{
    continent: string;
    source: string;
    total: number;
    engaged30d: number;
    inactive30d: number;
    lastUpdated: string;
  }>;
};

const CACHE_ID = 'segments-summary';

const parsePayload = (value: string | null): SegmentsSummary | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as SegmentsSummary;
  } catch {
    return null;
  }
};

export const computeSegmentsSummary = async (): Promise<SegmentsSummary> => {
  const now = new Date();
  const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const leads = await db.many<DbRow>(
    `SELECT id, continent, source, createdAt
     FROM leads
     WHERE isUnsubscribed = 0 AND emailInvalid = 0`
  );

  const engagedRows = await db.many<DbRow>(
    `SELECT DISTINCT subscriberId
     FROM email_events
     WHERE eventType IN ('open','click') AND subscriberId IS NOT NULL AND createdAt >= @start`,
    { start: start30d }
  );
  const engagedSet = new Set(engagedRows.map((row) => String(row.subscriberId)));

  const continentCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const segmentMap = new Map<
    string,
    { continent: string; source: string; total: number; engaged30d: number; lastUpdated: string }
  >();

  leads.forEach((lead) => {
    const continent = typeof lead.continent === 'string' && lead.continent.trim() ? lead.continent.trim() : 'Unknown';
    const source = typeof lead.source === 'string' && lead.source.trim() ? lead.source.trim() : 'Unknown';
    continentCounts.set(continent, (continentCounts.get(continent) || 0) + 1);
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);

    const key = `${continent}||${source}`;
    const existing = segmentMap.get(key);
    const createdAt = typeof lead.createdAt === 'string' ? lead.createdAt : '';
    const engaged = engagedSet.has(String(lead.id));
    if (!existing) {
      segmentMap.set(key, {
        continent,
        source,
        total: 1,
        engaged30d: engaged ? 1 : 0,
        lastUpdated: createdAt
      });
      return;
    }
    existing.total += 1;
    if (engaged) {
      existing.engaged30d += 1;
    }
    if (createdAt && (!existing.lastUpdated || createdAt > existing.lastUpdated)) {
      existing.lastUpdated = createdAt;
    }
  });

  const segments = [...segmentMap.values()]
    .map((segment) => ({
      ...segment,
      inactive30d: Math.max(segment.total - segment.engaged30d, 0)
    }))
    .sort((a, b) => b.total - a.total);

  return {
    generatedAt: now.toISOString(),
    totals: {
      active: leads.length
    },
    continents: [...continentCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    sources: [...sourceCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    segments
  };
};

const writeCache = async (payload: SegmentsSummary) => {
  const now = new Date().toISOString();
  const payloadJson = JSON.stringify(payload);
  const existing = await db.one<DbRow>('SELECT id FROM segments_summary_cache WHERE id = ?', [CACHE_ID]);
  if (existing) {
    await db.exec(
      `UPDATE segments_summary_cache
       SET payloadJson = @payloadJson,
           updatedAt = @updatedAt
       WHERE id = @id`,
      { id: CACHE_ID, payloadJson, updatedAt: now }
    );
    return;
  }
  await db.exec(
    `INSERT INTO segments_summary_cache (id, payloadJson, updatedAt)
     VALUES (@id, @payloadJson, @updatedAt)`,
    { id: CACHE_ID, payloadJson, updatedAt: now }
  );
};

export const getSegmentsSummaryCached = async (maxAgeMs = 60000): Promise<SegmentsSummary> => {
  const row = await db.one<DbRow>('SELECT payloadJson, updatedAt FROM segments_summary_cache WHERE id = ?', [CACHE_ID]);
  if (row?.updatedAt) {
    const updatedAtMs = new Date(row.updatedAt).getTime();
    if (updatedAtMs + maxAgeMs > Date.now()) {
      const cached = parsePayload(row.payloadJson);
      if (cached) return cached;
    }
  }
  const fresh = await computeSegmentsSummary();
  await writeCache(fresh);
  return fresh;
};

export const refreshSegmentsSummaryCache = async () => {
  const fresh = await computeSegmentsSummary();
  await writeCache(fresh);
};

export const startSegmentsSummaryScheduler = (intervalMs = 120000) => {
  void refreshSegmentsSummaryCache();
  return setInterval(() => void refreshSegmentsSummaryCache(), intervalMs);
};
