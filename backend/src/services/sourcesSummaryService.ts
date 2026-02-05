import db from '../db';
import { getSourceAliasMap, normalizeSourceKey, resolveSourceLabel } from './sourceAliasService';

type DbRow = Record<string, any>;

type SourcesSummary = {
  generatedAt: string;
  totals: {
    signups: number;
    last7d: number;
    prev7d: number;
  };
  unmapped: {
    total: number;
    unknown: number;
    coveragePct: number;
    top: Array<{
      name: string;
      count: number;
    }>;
    trend7d: {
      labels: string[];
      counts: number[];
    };
    trend30d: {
      labels: string[];
      counts: number[];
    };
  };
  sources: Array<{
    name: string;
    total: number;
    last7d: number;
    prev7d: number;
  }>;
};

const CACHE_ID = 'sources-summary';
const normalizeLabel = (value?: string | null) =>
  (typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '') || 'unknown';
const buildDayLabels = (days: number) => {
  const labels: string[] = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset)
    );
    labels.push(date.toISOString().slice(0, 10));
  }
  return labels;
};

const parsePayload = (value: string | null): SourcesSummary | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as SourcesSummary;
  } catch {
    return null;
  }
};

export const computeSourcesSummary = async (): Promise<SourcesSummary> => {
  const now = new Date();
  const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const start14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const rows = await db.many<DbRow>(
    `SELECT source, createdAt
     FROM leads
     WHERE isUnsubscribed = 0 AND emailInvalid = 0`
  );

  const dayLabels7d = buildDayLabels(7);
  const dayLabels30d = buildDayLabels(30);
  const start30d = `${dayLabels30d[0]}T00:00:00.000Z`;

  const aliasMap = await getSourceAliasMap();
  const canonicalKeys = new Set<string>();
  aliasMap.forEach((canonical) => {
    canonicalKeys.add(normalizeLabel(canonical));
  });
  const sourceStats = new Map<string, { label: string; total: number; last7d: number; prev7d: number }>();
  const unmappedCounts = new Map<string, number>();
  const unmappedTrend = new Map<string, number>();
  let unknownCount = 0;
  rows.forEach((row) => {
    const rawSource = typeof row.source === 'string' ? row.source.trim() : '';
    const rawLabel = rawSource || 'Unknown';
    const rawKey = normalizeLabel(rawLabel);
    const createdAt = typeof row.createdAt === 'string' ? row.createdAt : '';
    const createdDay = createdAt ? createdAt.slice(0, 10) : '';
    if (rawKey === 'unknown') {
      unknownCount += 1;
    }
    const isUnmapped = rawKey !== 'unknown' && !aliasMap.has(rawKey) && !canonicalKeys.has(rawKey);
    if (isUnmapped) {
      unmappedCounts.set(rawLabel, (unmappedCounts.get(rawLabel) || 0) + 1);
    }
    const isUnknownOrUnmapped = rawKey === 'unknown' || isUnmapped;
    if (isUnknownOrUnmapped && createdAt >= start30d && createdDay) {
      unmappedTrend.set(createdDay, (unmappedTrend.get(createdDay) || 0) + 1);
    }
    const key = normalizeSourceKey(row.source, aliasMap);
    const label = resolveSourceLabel(row.source, aliasMap);
    const entry = sourceStats.get(key) || { label, total: 0, last7d: 0, prev7d: 0 };
    entry.total += 1;
    if (createdAt >= start7d) {
      entry.last7d += 1;
    } else if (createdAt >= start14d) {
      entry.prev7d += 1;
    }
    sourceStats.set(key, entry);
  });

  const sources = [...sourceStats.entries()]
    .map(([, stats]) => ({
      name: stats.label,
      total: stats.total,
      last7d: stats.last7d,
      prev7d: stats.prev7d
    }))
    .sort((a, b) => b.total - a.total);

  const totalSignups = sources.reduce((acc, item) => acc + item.total, 0);
  const totalLast7d = sources.reduce((acc, item) => acc + item.last7d, 0);
  const totalPrev7d = sources.reduce((acc, item) => acc + item.prev7d, 0);
  const unmappedTop = [...unmappedCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const unmappedTotal = [...unmappedCounts.values()].reduce((acc, value) => acc + value, 0) + unknownCount;
  const coveragePct = totalSignups > 0 ? Math.round(((totalSignups - unmappedTotal) / totalSignups) * 100) : 100;
  const trend30d = dayLabels30d.map((label) => unmappedTrend.get(label) || 0);
  const trend7d = dayLabels7d.map((label) => unmappedTrend.get(label) || 0);

  return {
    generatedAt: now.toISOString(),
    totals: {
      signups: totalSignups,
      last7d: totalLast7d,
      prev7d: totalPrev7d
    },
    unmapped: {
      total: unmappedTotal,
      unknown: unknownCount,
      coveragePct,
      top: unmappedTop,
      trend7d: {
        labels: dayLabels7d,
        counts: trend7d
      },
      trend30d: {
        labels: dayLabels30d,
        counts: trend30d
      }
    },
    sources
  };
};

const writeCache = async (payload: SourcesSummary) => {
  const now = new Date().toISOString();
  const payloadJson = JSON.stringify(payload);
  const existing = await db.one<DbRow>(
    'SELECT id FROM sources_summary_cache WHERE id = ?',
    [CACHE_ID]
  );
  if (existing) {
    await db.exec(
      `UPDATE sources_summary_cache
       SET payloadJson = @payloadJson,
           updatedAt = @updatedAt
       WHERE id = @id`,
      { id: CACHE_ID, payloadJson, updatedAt: now }
    );
    return;
  }
  await db.exec(
    `INSERT INTO sources_summary_cache (id, payloadJson, updatedAt)
     VALUES (@id, @payloadJson, @updatedAt)`,
    { id: CACHE_ID, payloadJson, updatedAt: now }
  );
};

export const getSourcesSummaryCached = async (maxAgeMs = 60000): Promise<SourcesSummary> => {
  const row = await db.one<DbRow>(
    'SELECT payloadJson, updatedAt FROM sources_summary_cache WHERE id = ?',
    [CACHE_ID]
  );
  if (row?.updatedAt) {
    const updatedAtMs = new Date(row.updatedAt).getTime();
    if (updatedAtMs + maxAgeMs > Date.now()) {
      const cached = parsePayload(row.payloadJson);
      if (cached) return cached;
    }
  }
  const fresh = await computeSourcesSummary();
  await writeCache(fresh);
  return fresh;
};

export const refreshSourcesSummaryCache = async () => {
  const fresh = await computeSourcesSummary();
  await writeCache(fresh);
};

export const startSourcesSummaryScheduler = (intervalMs = 120000) => {
  void refreshSourcesSummaryCache();
  return setInterval(() => {
    void refreshSourcesSummaryCache();
  }, intervalMs);
};
