import crypto from 'crypto';
import db from '../../db';
import { logAdminActivity } from '../../services/activityLogService';
import { getSegmentsSummaryCached } from '../../services/segmentsSummaryService';

type DbRow = Record<string, any>;

const parseJsonValue = (value: string | null): Record<string, unknown> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

export const getSegmentsSummary = async () => getSegmentsSummaryCached();

export const getSegmentDetail = async (query: Record<string, unknown>) => {
  const continentParam = typeof query.continent === 'string' ? query.continent.trim() : '';
  const sourceParam = typeof query.source === 'string' ? query.source.trim() : '';
  if (!continentParam || !sourceParam) {
    return { error: 'continent and source are required', status: 400 };
  }

  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit || 25)));
  const offset = (page - 1) * limit;
  const start30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const engagedRows = await db.many<DbRow>(
    `SELECT DISTINCT subscriberId
     FROM email_events
     WHERE eventType IN ('open','click') AND subscriberId IS NOT NULL AND createdAt >= @start`,
    { start: start30d }
  );
  const engagedSet = new Set(engagedRows.map((row) => String(row.subscriberId)));

  const leads = await db.many<DbRow>(
    `SELECT id, name, email, phone, country, continent, source, createdAt
     FROM leads
     WHERE isUnsubscribed = 0 AND emailInvalid = 0`
  );

  const normalizeSegmentValue = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : 'Unknown';

  const filtered = leads.filter((lead) => {
    const continent = normalizeSegmentValue(lead.continent);
    const source = normalizeSegmentValue(lead.source);
    return continent === continentParam && source === sourceParam;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pageItems = filtered.slice(offset, offset + limit);

  const engaged30d = filtered.reduce(
    (acc, lead) => acc + (engagedSet.has(String(lead.id)) ? 1 : 0),
    0
  );
  const lastUpdated = filtered.reduce((latest, lead) => {
    const createdAt = typeof lead.createdAt === 'string' ? lead.createdAt : '';
    if (!createdAt) return latest;
    return !latest || createdAt > latest ? createdAt : latest;
  }, '');

  return {
    segment: {
      continent: continentParam,
      source: sourceParam,
      total,
      engaged30d,
      inactive30d: Math.max(total - engaged30d, 0),
      lastUpdated
    },
    page,
    total,
    totalPages,
    leads: pageItems.map((lead) => ({
      id: String(lead.id),
      name: typeof lead.name === 'string' ? lead.name : null,
      email: typeof lead.email === 'string' ? lead.email : '',
      phone: typeof lead.phone === 'string' ? lead.phone : null,
      country: typeof lead.country === 'string' ? lead.country : null,
      createdAt: typeof lead.createdAt === 'string' ? lead.createdAt : '',
      engaged30d: engagedSet.has(String(lead.id))
    }))
  };
};

export const createSegmentsExport = async (payload: Record<string, unknown>) => {
  const { continent, source, engagement, format } = payload;
  if (!continent || typeof continent !== 'string') {
    return { error: 'Continent is required', status: 400 };
  }
  if (!source || typeof source !== 'string') {
    return { error: 'Source is required', status: 400 };
  }
  const engagementValue = typeof engagement === 'string' ? engagement : 'all';
  const formatValue = typeof format === 'string' ? format : 'csv';
  const allowedFormats = ['csv', 'xlsx', 'pdf', 'docx'];
  if (!allowedFormats.includes(formatValue)) {
    return { error: 'Invalid export format', status: 400 };
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const paramsJson = JSON.stringify({
    continent: continent.trim(),
    source: source.trim(),
    engagement: engagementValue,
    format: formatValue
  });
  await db.exec(
    `INSERT INTO export_jobs (id, type, status, paramsJson, createdAt, updatedAt)
     VALUES (@id, @type, @status, @paramsJson, @createdAt, @updatedAt)`,
    {
    id,
    type: 'segments_csv',
    status: 'queued',
    paramsJson,
    createdAt: now,
    updatedAt: now
    }
  );
  await logAdminActivity('segments.export', {
    continent: continent.trim(),
    source: source.trim(),
    engagement: engagementValue,
    format: formatValue
  });
  return { id, status: 'queued' };
};

export const getSegmentsExportJob = async (id: string) => {
  const row = await db.one<DbRow>(
    `SELECT id, status, fileUrl, error, createdAt, updatedAt, completedAt
     FROM export_jobs
     WHERE id = ?`,
    [id]
  );
  if (!row) {
    return { error: 'Export job not found', status: 404 };
  }
  return {
    id: String(row.id),
    status: String(row.status),
    fileUrl: row.fileUrl ? String(row.fileUrl) : null,
    error: row.error ? String(row.error) : null,
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || ''),
    completedAt: row.completedAt ? String(row.completedAt) : null
  };
};

export const listSegmentsExports = async (limit: number) => {
  const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)));
  const rows = await db.many<DbRow>(
    `SELECT id, status, paramsJson, fileUrl, error, createdAt, updatedAt, completedAt
     FROM export_jobs
     WHERE type = 'segments_csv'
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

export const listSavedSegments = async () => {
  const rows = await db.many<DbRow>(
    'SELECT id, name, continent, source, engagement, createdAt, updatedAt FROM saved_segments ORDER BY updatedAt DESC'
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name || ''),
    continent: String(row.continent || 'All continents'),
    source: String(row.source || 'All sources'),
    engagement: String(row.engagement || 'all'),
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || '')
  }));
};

export const createSavedSegment = async (payload: Record<string, unknown>) => {
  const { name, continent, source, engagement } = payload;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return { error: 'Name is required', status: 400 };
  }
  if (!continent || typeof continent !== 'string') {
    return { error: 'Continent is required', status: 400 };
  }
  if (!source || typeof source !== 'string') {
    return { error: 'Source is required', status: 400 };
  }
  if (!engagement || typeof engagement !== 'string') {
    return { error: 'Engagement is required', status: 400 };
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.exec(
    `INSERT INTO saved_segments (id, name, continent, source, engagement, createdAt, updatedAt)
     VALUES (@id, @name, @continent, @source, @engagement, @createdAt, @updatedAt)`,
    {
    id,
    name: name.trim(),
    continent: continent.trim(),
    source: source.trim(),
    engagement: engagement.trim(),
    createdAt: now,
    updatedAt: now
    }
  );
  await logAdminActivity('segments.saved.create', {
    name: name.trim(),
    continent: continent.trim(),
    source: source.trim(),
    engagement: engagement.trim()
  });
  const row = await db.one<DbRow>(
    'SELECT id, name, continent, source, engagement, createdAt, updatedAt FROM saved_segments WHERE id = ?',
    [id]
  );
  return {
    id: String(row.id),
    name: String(row.name || ''),
    continent: String(row.continent || 'All continents'),
    source: String(row.source || 'All sources'),
    engagement: String(row.engagement || 'all'),
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || '')
  };
};

export const renameSavedSegment = async (id: string, payload: Record<string, unknown>) => {
  const existing = await db.one<DbRow>(
    'SELECT id, name, continent, source, engagement, createdAt, updatedAt FROM saved_segments WHERE id = ?',
    [id]
  );
  if (!existing) {
    return { error: 'Saved segment not found', status: 404 };
  }
  const { name } = payload;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return { error: 'Name is required', status: 400 };
  }
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE saved_segments
     SET name = @name,
         updatedAt = @updatedAt
     WHERE id = @id`,
    {
    id,
    name: name.trim(),
    updatedAt: now
    }
  );
  await logAdminActivity('segments.saved.rename', {
    id,
    name: name.trim(),
    previousName: existing.name
  });
  const row = await db.one<DbRow>(
    'SELECT id, name, continent, source, engagement, createdAt, updatedAt FROM saved_segments WHERE id = ?',
    [id]
  );
  return {
    id: String(row.id),
    name: String(row.name || ''),
    continent: String(row.continent || 'All continents'),
    source: String(row.source || 'All sources'),
    engagement: String(row.engagement || 'all'),
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || '')
  };
};

export const deleteSavedSegment = async (id: string) => {
  const existing = await db.one<DbRow>(
    'SELECT name, continent, source, engagement FROM saved_segments WHERE id = ?',
    [id]
  );
  const result = await db.exec('DELETE FROM saved_segments WHERE id = ?', [id]);
  if (result.rowCount === 0) {
    return { error: 'Saved segment not found', status: 404 };
  }
  if (existing) {
    await logAdminActivity('segments.saved.delete', {
      name: existing.name,
      continent: existing.continent,
      source: existing.source,
      engagement: existing.engagement
    });
  }
  return { deleted: id };
};
