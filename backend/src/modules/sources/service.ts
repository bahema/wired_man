import crypto from 'crypto';
import db from '../../db';
import { logAdminActivity } from '../../services/activityLogService';
import { getSourcesSummaryCached, refreshSourcesSummaryCache } from '../../services/sourcesSummaryService';
import { getSourceAliasMap, normalizeSourceKey, resolveSourceLabel } from '../../services/sourceAliasService';

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

const parseJsonValue = (value: string | null): Record<string, unknown> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeSourceLabel = (value?: string | null) =>
  (typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '') || 'unknown';

const normalizeSuggestionToken = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const scoreCanonicalSuggestions = (alias: string, options: string[]) => {
  const aliasValue = normalizeSuggestionToken(alias);
  if (!aliasValue) return [];
  const scored = new Map<string, number>();
  options.forEach((option) => {
    const optionValue = normalizeSuggestionToken(option);
    let score = 0;
    if (optionValue === aliasValue) score += 10;
    if (optionValue.includes(aliasValue) || aliasValue.includes(optionValue)) score += 4;
    const aliasTokens = new Set(aliasValue.split(/\s+/));
    const optionTokens = new Set(optionValue.split(/\s+/));
    let shared = 0;
    aliasTokens.forEach((token) => {
      if (optionTokens.has(token)) shared += 1;
    });
    score += shared;
    const current = scored.get(option) || 0;
    if (score > current) scored.set(option, score);
  });
  return [...scored.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([option]) => option)
    .slice(0, 3);
};

const buildDayLabels = (days: number, offsetDays = 0) => {
  const labels: string[] = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset - offsetDays)
    );
    labels.push(date.toISOString().slice(0, 10));
  }
  return labels;
};

const computeAliasImpactTrends = async (aliasValue: string) => {
  const aliasKey = normalizeSourceLabel(aliasValue);
  const dayLabels7d = buildDayLabels(7);
  const dayLabels30d = buildDayLabels(30);
  const start30d = `${dayLabels30d[0]}T00:00:00.000Z`;
  const rows = await db.many<DbRow>(
    'SELECT source, createdAt FROM leads WHERE isUnsubscribed = 0 AND emailInvalid = 0'
  );
  const trendCounts = new Map<string, number>();
  let impactCount = 0;
  rows.forEach((row) => {
    const createdAt = typeof row.createdAt === 'string' ? row.createdAt : '';
    const createdDay = createdAt ? createdAt.slice(0, 10) : '';
    if (normalizeSourceLabel(row.source) !== aliasKey) return;
    impactCount += 1;
    if (createdAt >= start30d && createdDay) {
      trendCounts.set(createdDay, (trendCounts.get(createdDay) || 0) + 1);
    }
  });
  return {
    impactCount,
    trend7d: {
      labels: dayLabels7d,
      counts: dayLabels7d.map((label) => trendCounts.get(label) || 0)
    },
    trend30d: {
      labels: dayLabels30d,
      counts: dayLabels30d.map((label) => trendCounts.get(label) || 0)
    }
  };
};

export const getSourcesSummary = async () => await getSourcesSummaryCached();

export const listSourceAliases = async () => {
  const rows = await db.many<DbRow>(
    'SELECT id, alias, canonical, createdAt FROM source_aliases ORDER BY createdAt DESC'
  );
  const leadRows = await db.many<DbRow>(
    'SELECT source FROM leads WHERE isUnsubscribed = 0 AND emailInvalid = 0'
  );
  const impactCounts = new Map<string, number>();
  leadRows.forEach((row) => {
    const key = normalizeSourceLabel(row.source);
    impactCounts.set(key, (impactCounts.get(key) || 0) + 1);
  });
  return rows.map((row) => ({
    id: String(row.id),
    alias: String(row.alias || ''),
    canonical: String(row.canonical || ''),
    createdAt: String(row.createdAt || ''),
    impactCount: impactCounts.get(normalizeSourceLabel(row.alias)) || 0
  }));
};

export const suggestSourceAlias = async (payload: Record<string, unknown>) => {
  const { alias } = payload;
  if (!alias || typeof alias !== 'string' || !alias.trim()) {
    return { error: 'Alias is required', status: 400 };
  }
  const aliasValue = alias.trim();
  const aliasRows = await db.many<DbRow>(
    'SELECT alias, canonical FROM source_aliases ORDER BY createdAt DESC'
  );
  const summary = await getSourcesSummaryCached();
  const optionSet = new Set<string>();
  aliasRows.forEach((row) => {
    if (typeof row.canonical === 'string' && row.canonical.trim()) {
      optionSet.add(row.canonical.trim());
    }
  });
  summary.sources.forEach((source) => {
    if (source.name.trim()) {
      optionSet.add(source.name.trim());
    }
  });
  const direct = aliasRows.find(
    (row) => normalizeSuggestionToken(String(row.alias || '')) === normalizeSuggestionToken(aliasValue)
  );
  const options = [...optionSet];
  const ranked = scoreCanonicalSuggestions(aliasValue, options);
  if (direct?.canonical) {
    const canonical = String(direct.canonical || '').trim();
    if (canonical) {
      const set = new Set([canonical, ...ranked]);
      return { suggestions: [...set].slice(0, 3) };
    }
  }
  return { suggestions: ranked };
};

export const createSourceAlias = async (payload: Record<string, unknown>) => {
  const { alias, canonical } = payload;
  if (!alias || typeof alias !== 'string' || !alias.trim()) {
    return { error: 'Alias is required', status: 400 };
  }
  if (!canonical || typeof canonical !== 'string' || !canonical.trim()) {
    return { error: 'Canonical name is required', status: 400 };
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const aliasValue = alias.trim().toLowerCase();
  const canonicalValue = canonical.trim();
  await db.exec(
    `INSERT INTO source_aliases (id, alias, canonical, createdAt)
     VALUES (@id, @alias, @canonical, @createdAt)`,
    {
    id,
    alias: aliasValue,
    canonical: canonicalValue,
    createdAt: now
    }
  );
  await refreshSourcesSummaryCache();
  const impact = await computeAliasImpactTrends(aliasValue);
  await logAdminActivity('sources.alias.create', { alias: aliasValue, canonical: canonicalValue });
  return {
    id,
    alias: aliasValue,
    canonical: canonicalValue,
    createdAt: now,
    impactCount: impact.impactCount,
    impactTrend7d: impact.trend7d,
    impactTrend30d: impact.trend30d
  };
};

export const deleteSourceAlias = async (id: string) => {
  const existing = await db.one<DbRow>(
    'SELECT alias, canonical FROM source_aliases WHERE id = ?',
    [id]
  );
  const result = await db.exec('DELETE FROM source_aliases WHERE id = ?', [id]);
  if (result.rowCount === 0) {
    return { error: 'Alias not found', status: 404 };
  }
  if (existing) {
    await refreshSourcesSummaryCache();
    await logAdminActivity('sources.alias.delete', {
      alias: existing.alias,
      canonical: existing.canonical
    });
  }
  return { deleted: id };
};

export const getSourceDetail = async (query: Record<string, unknown>) => {
  const sourceParam = typeof query.source === 'string' ? query.source.trim() : '';
  if (!sourceParam) {
    return { error: 'source is required', status: 400 };
  }
  const start = typeof query.start === 'string' ? query.start.trim() : '';
  const end = typeof query.end === 'string' ? query.end.trim() : '';
  const countryFilter = typeof query.country === 'string' ? query.country.trim() : '';
  const topicFilter = typeof query.topic === 'string' ? query.topic.trim() : '';
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit || 25)));
  const offset = (page - 1) * limit;
  const now = new Date();
  const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const start14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const rows = await db.many<DbRow>(
    `SELECT id, name, email, phone, country, source, interests, createdAt
     FROM leads
     WHERE isUnsubscribed = 0 AND emailInvalid = 0`
  );

  const aliasMap = await getSourceAliasMap();
  const sourceKey = normalizeSourceKey(sourceParam, aliasMap);
  const filtered = rows.filter((row) => {
    const sourceKeyRow = normalizeSourceKey(row.source, aliasMap);
    const createdAt = typeof row.createdAt === 'string' ? row.createdAt : '';
    const country = typeof row.country === 'string' ? row.country.trim() : '';
    const topics = typeof row.interests === 'string' ? parseJsonArray(row.interests) : [];
    if (sourceKeyRow !== sourceKey) return false;
    if (start && createdAt < start) return false;
    if (end && createdAt > end) return false;
    if (countryFilter && country && country !== countryFilter) return false;
    if (countryFilter && !country) return false;
    if (topicFilter && !topics.includes(topicFilter)) return false;
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pageItems = filtered.slice(offset, offset + limit);

  const buildDayLabelsLocal = (days: number) => {
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

  const buildTrend = (days: number) => {
    const labels = buildDayLabelsLocal(days);
    const counts = labels.map((label) => {
      return filtered.reduce((acc, row) => {
        const createdAt = typeof row.createdAt === 'string' ? row.createdAt.slice(0, 10) : '';
        if (createdAt === label) return acc + 1;
        return acc;
      }, 0);
    });
    return { labels, counts };
  };

  const trend90 = buildTrend(90);
  const trend30 = {
    labels: trend90.labels.slice(-30),
    counts: trend90.counts.slice(-30)
  };
  const trend7 = {
    labels: trend90.labels.slice(-7),
    counts: trend90.counts.slice(-7)
  };

  const last7d = filtered.reduce((acc, row) => {
    const createdAt = typeof row.createdAt === 'string' ? row.createdAt : '';
    if (createdAt >= start7d) return acc + 1;
    return acc;
  }, 0);
  const prev7d = filtered.reduce((acc, row) => {
    const createdAt = typeof row.createdAt === 'string' ? row.createdAt : '';
    if (createdAt >= start14d && createdAt < start7d) return acc + 1;
    return acc;
  }, 0);

  const countryCounts = filtered.reduce<Record<string, number>>((acc, row) => {
    const country = typeof row.country === 'string' ? row.country.trim() : '';
    if (!country) return acc;
    acc[country] = (acc[country] || 0) + 1;
    return acc;
  }, {});
  const topicCounts = filtered.reduce<Record<string, number>>((acc, row) => {
    const topics = typeof row.interests === 'string' ? parseJsonArray(row.interests) : [];
    topics.forEach((topic) => {
      const key = String(topic || '').trim();
      if (!key) return;
      acc[key] = (acc[key] || 0) + 1;
    });
    return acc;
  }, {});

  return {
    source: resolveSourceLabel(sourceParam, aliasMap),
    totals: {
      total,
      last7d,
      prev7d
    },
    trends: {
      last7d: trend7,
      last30d: trend30,
      last90d: trend90
    },
    facets: {
      countries: Object.entries(countryCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      topics: Object.entries(topicCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
    },
    page,
    total,
    totalPages,
    leads: pageItems.map((row) => ({
      id: String(row.id),
      name: typeof row.name === 'string' ? row.name : null,
      email: typeof row.email === 'string' ? row.email : '',
      phone: typeof row.phone === 'string' ? row.phone : null,
      country: typeof row.country === 'string' ? row.country : null,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : ''
    }))
  };
};

export const createSourcesExport = async (payload: Record<string, unknown>) => {
  const { source, format, start, end, country, topic } = payload;
  if (!source || typeof source !== 'string') {
    return { error: 'Source is required', status: 400 };
  }
  const formatValue = typeof format === 'string' ? format : 'csv';
  const allowedFormats = ['csv', 'xlsx', 'pdf', 'docx'];
  if (!allowedFormats.includes(formatValue)) {
    return { error: 'Invalid export format', status: 400 };
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const paramsJson = JSON.stringify({
    source: source.trim(),
    format: formatValue,
    start: typeof start === 'string' ? start : '',
    end: typeof end === 'string' ? end : '',
    country: typeof country === 'string' ? country : '',
    topic: typeof topic === 'string' ? topic : ''
  });
  await db.exec(
    `INSERT INTO export_jobs (id, type, status, paramsJson, createdAt, updatedAt)
     VALUES (@id, @type, @status, @paramsJson, @createdAt, @updatedAt)`,
    {
    id,
    type: 'sources_export',
    status: 'queued',
    paramsJson,
    createdAt: now,
    updatedAt: now
    }
  );
  await logAdminActivity('sources.export', {
    source: source.trim(),
    format: formatValue,
    start: typeof start === 'string' ? start : '',
    end: typeof end === 'string' ? end : '',
    country: typeof country === 'string' ? country : '',
    topic: typeof topic === 'string' ? topic : ''
  });
  return { id, status: 'queued' };
};

export const listSourcesExports = async (limit: number) => {
  const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)));
  const rows = await db.many<DbRow>(
    `SELECT id, status, paramsJson, fileUrl, error, createdAt, updatedAt, completedAt
     FROM export_jobs
     WHERE type = 'sources_export'
     ORDER BY createdAt DESC
     LIMIT @limit`,
    { limit: safeLimit }
  );
  return rows.map((row) => ({
    id: String(row.id),
    status: String(row.status),
    fileUrl: row.fileUrl ? String(row.fileUrl) : null,
    error: row.error ? String(row.error) : null,
    params: parseJsonValue(row.paramsJson),
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || ''),
    completedAt: row.completedAt ? String(row.completedAt) : null
  }));
};

export const listSourcesExportSchedules = async (query: Record<string, unknown>) => {
  const sourceParam = typeof query.source === 'string' ? query.source.trim() : '';
  const limit = Math.max(1, Math.min(100, Number(query.limit || 20)));
  const rows = await db.many<DbRow>(
    `SELECT id, status, frequency, paramsJson, nextRunAt, createdAt, updatedAt
     FROM export_schedules
     WHERE type = 'sources_export'`
  );
  const filtered = sourceParam
    ? rows.filter((row) => {
      const params = parseJsonValue(row.paramsJson);
      return params.source === sourceParam;
    })
    : rows;
  return filtered.slice(0, limit).map((row) => ({
    id: String(row.id),
    status: String(row.status),
    frequency: String(row.frequency),
    params: parseJsonValue(row.paramsJson),
    nextRunAt: String(row.nextRunAt || ''),
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || '')
  }));
};

export const createSourcesExportSchedule = async (payload: Record<string, unknown>) => {
  const { source, format, frequency, recipients } = payload;
  if (!source || typeof source !== 'string') {
    return { error: 'Source is required', status: 400 };
  }
  const formatValue = typeof format === 'string' ? format : 'csv';
  const allowedFormats = ['csv', 'xlsx', 'pdf', 'docx'];
  if (!allowedFormats.includes(formatValue)) {
    return { error: 'Invalid export format', status: 400 };
  }
  const frequencyValue = typeof frequency === 'string' ? frequency : 'daily';
  const allowedFrequencies = ['daily', 'weekly'];
  if (!allowedFrequencies.includes(frequencyValue)) {
    return { error: 'Invalid frequency', status: 400 };
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const nextRunAt =
    frequencyValue === 'weekly'
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const recipientList = Array.isArray(recipients)
    ? recipients.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : typeof recipients === 'string'
      ? recipients.split(',').map((item) => item.trim()).filter(Boolean)
      : [];
  const adminRow = await db.one<DbRow>(
    'SELECT adminEmail FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  const fallbackRecipient = typeof adminRow?.adminEmail === 'string' ? adminRow.adminEmail : '';
  const finalRecipients = recipientList.length ? recipientList : (fallbackRecipient ? [fallbackRecipient] : []);
  const paramsJson = JSON.stringify({
    source: source.trim(),
    format: formatValue,
    recipients: finalRecipients
  });
  await db.exec(
    `INSERT INTO export_schedules (id, type, status, frequency, paramsJson, nextRunAt, createdAt, updatedAt)
     VALUES (@id, @type, @status, @frequency, @paramsJson, @nextRunAt, @createdAt, @updatedAt)`,
    {
    id,
    type: 'sources_export',
    status: 'active',
    frequency: frequencyValue,
    paramsJson,
    nextRunAt,
    createdAt: now,
    updatedAt: now
    }
  );
  await logAdminActivity('sources.export.schedule', {
    source: source.trim(),
    format: formatValue,
    frequency: frequencyValue,
    recipients: finalRecipients
  });
  return { id, status: 'active', frequency: frequencyValue, nextRunAt, recipients: finalRecipients };
};

export const deleteSourcesExportSchedule = async (id: string) => {
  const existing = await db.one<DbRow>(
    'SELECT paramsJson FROM export_schedules WHERE id = ?',
    [id]
  );
  const result = await db.exec('DELETE FROM export_schedules WHERE id = ?', [id]);
  if (result.rowCount === 0) {
    return { error: 'Schedule not found', status: 404 };
  }
  if (existing) {
    const params = parseJsonValue(existing.paramsJson);
    await logAdminActivity('sources.export.schedule.delete', {
      source: params.source,
      format: params.format
    });
  }
  return { deleted: id };
};
