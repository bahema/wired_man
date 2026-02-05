import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, Table, TableRow, TableCell } from 'docx';
import db from '../db';
import { R2_PUBLIC_BASE_URL } from '../config/env';
import { getSourceAliasMap, normalizeSourceKey, resolveSourceLabel } from './sourceAliasService';
import { sendReportEmail } from './mailer';
import { uploadBuffer } from '../storage/r2';

type DbRow = Record<string, any>;

const workerStatus = {
  running: false,
  startedAt: null as string | null,
  lastJobAt: null as string | null,
  lastError: null as string | null,
  lastErrorAt: null as string | null
};

export const getExportWorkerStatus = () => ({ ...workerStatus });

const resolvePublicUrl = (key: string) => {
  const base = R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
  if (!base) {
    throw new Error('R2_PUBLIC_BASE_URL must be set for exports.');
  }
  return `${base}/${key.replace(/^\/+/, '')}`;
};

const normalizeSegmentValue = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : 'Unknown';

const sanitizeFilePart = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'unknown';

const csvEscape = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/["\n,]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const parseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const buildSegmentsCsv = (rows: Array<Record<string, unknown>>) => {
  const headers = ['id', 'name', 'email', 'phone', 'country', 'continent', 'source', 'createdAt', 'engaged30d'];
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    const values = headers.map((key) => csvEscape(row[key]));
    lines.push(values.join(','));
  });
  return lines.join('\n');
};

const buildSourcesCsv = (rows: Array<Record<string, unknown>>) => {
  const headers = ['id', 'name', 'email', 'phone', 'country', 'source', 'createdAt'];
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    const values = headers.map((key) => csvEscape(row[key]));
    lines.push(values.join(','));
  });
  return lines.join('\n');
};

const markJobFailed = async (id: string, message: string) => {
  workerStatus.lastError = message;
  workerStatus.lastErrorAt = new Date().toISOString();
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE export_jobs
     SET status = 'failed',
         error = @error,
         updatedAt = @updatedAt,
         completedAt = @completedAt
     WHERE id = @id`,
    { id, error: message, updatedAt: now, completedAt: now }
  );
};

const markJobCompleted = async (id: string, filePath: string, fileUrl: string) => {
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE export_jobs
     SET status = 'completed',
         filePath = @filePath,
         fileUrl = @fileUrl,
         error = NULL,
         updatedAt = @updatedAt,
         completedAt = @completedAt
     WHERE id = @id`,
    { id, filePath, fileUrl, updatedAt: now, completedAt: now }
  );
};

const sendReportIfNeeded = async (recipients: string[], fileUrl: string, subject: string) => {
  if (!recipients.length) return;
  const text = `Your scheduled report is ready.\n\nDownload: ${fileUrl}`;
  await sendReportEmail(recipients, subject, text);
};

const uploadExport = async (key: string, buffer: Buffer, contentType: string) => {
  const { key: storedKey } = await uploadBuffer(key, buffer, contentType);
  return { key: storedKey, url: resolvePublicUrl(storedKey) };
};

const processSegmentsExport = async (job: { id: string; params: Record<string, unknown> }) => {
  const continent = typeof job.params.continent === 'string' ? job.params.continent.trim() : '';
  const source = typeof job.params.source === 'string' ? job.params.source.trim() : '';
  const engagement = typeof job.params.engagement === 'string' ? job.params.engagement.trim() : 'all';
  const format = typeof job.params.format === 'string' ? job.params.format.trim() : 'csv';
  if (!continent || !source) {
    await markJobFailed(job.id, 'Missing continent or source.');
    return;
  }

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

  const filtered = leads.filter((lead) => {
    const leadContinent = normalizeSegmentValue(lead.continent);
    const leadSource = normalizeSegmentValue(lead.source);
    if (leadContinent !== continent || leadSource !== source) return false;
    const engaged = engagedSet.has(String(lead.id));
    if (engagement === 'engaged') return engaged;
    if (engagement === 'inactive') return !engaged;
    return true;
  });

  const rows = filtered.map((lead) => ({
    id: String(lead.id),
    name: typeof lead.name === 'string' ? lead.name : '',
    email: typeof lead.email === 'string' ? lead.email : '',
    phone: typeof lead.phone === 'string' ? lead.phone : '',
    country: typeof lead.country === 'string' ? lead.country : '',
    continent: normalizeSegmentValue(lead.continent),
    source: normalizeSegmentValue(lead.source),
    createdAt: typeof lead.createdAt === 'string' ? lead.createdAt : '',
    engaged30d: engagedSet.has(String(lead.id)) ? 'yes' : 'no'
  }));

  const fileBase = [
    'segment',
    sanitizeFilePart(continent),
    sanitizeFilePart(source),
    Date.now().toString()
  ].join('-');

  const recipients = Array.isArray(job.params.recipients)
    ? (job.params.recipients as unknown[]).filter((item) => typeof item === 'string') as string[]
    : [];

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Segments');
    sheet.columns = [
      { header: 'ID', key: 'id', width: 36 },
      { header: 'Name', key: 'name', width: 20 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Country', key: 'country', width: 10 },
      { header: 'Continent', key: 'continent', width: 12 },
      { header: 'Source', key: 'source', width: 16 },
      { header: 'Created At', key: 'createdAt', width: 22 },
      { header: 'Engaged 30d', key: 'engaged30d', width: 12 }
    ];
    sheet.addRows(rows);
    const filename = `${fileBase}.xlsx`;
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { key, url } = await uploadExport(`exports/${filename}`, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await markJobCompleted(job.id, key, url);
    await sendReportIfNeeded(recipients, url, `Source report: ${source}`);
    return;
  }

  if (format === 'pdf') {
    const filename = `${fileBase}.pdf`;
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.fontSize(16).text(`Segment export: ${continent} · ${source}`, { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Engagement filter: ${engagement}`, { align: 'left' });
    doc.moveDown();
    doc.fontSize(9);
    rows.forEach((row) => {
      doc.text([
        row.name || row.email,
        row.email,
        row.phone,
        row.country,
        row.continent,
        row.source,
        row.createdAt,
        row.engaged30d
      ].filter(Boolean).join(' | '));
    });
    doc.end();
    const buffer = Buffer.concat(chunks);
    const { key, url } = await uploadExport(`exports/${filename}`, buffer, 'application/pdf');
    await markJobCompleted(job.id, key, url);
    await sendReportIfNeeded(recipients, url, `Source report: ${source}`);
    return;
  }

  if (format === 'docx') {
    const filename = `${fileBase}.docx`;
    const rowsData = rows.map((row) => ([
      row.id || '',
      row.name || '',
      row.email || '',
      row.phone || '',
      row.country || '',
      row.continent || '',
      row.source || '',
      row.createdAt || '',
      row.engaged30d || ''
    ]));
    const tableRows = [
      new TableRow({
        children: ['ID', 'Name', 'Email', 'Phone', 'Country', 'Continent', 'Source', 'Created At', 'Engaged 30d']
          .map((text) => new TableCell({ children: [new Paragraph(String(text))] }))
      }),
      ...rowsData.map((row) => new TableRow({
        children: row.map((cell) => new TableCell({ children: [new Paragraph(String(cell))] }))
      }))
    ];
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph(`Segment export: ${continent} · ${source}`),
          new Paragraph(`Engagement filter: ${engagement}`),
          new Table({ rows: tableRows })
        ]
      }]
    });
    const buffer = await Packer.toBuffer(doc);
    const { key, url } = await uploadExport(`exports/${filename}`, buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    await markJobCompleted(job.id, key, url);
    return;
  }

  const filename = `${fileBase}.csv`;
  const csv = buildSegmentsCsv(rows);
  const { key, url } = await uploadExport(`exports/${filename}`, Buffer.from(csv, 'utf8'), 'text/csv; charset=utf-8');
  await markJobCompleted(job.id, key, url);
};

const processSourcesExport = async (job: { id: string; params: Record<string, unknown> }) => {
  const source = typeof job.params.source === 'string' ? job.params.source.trim() : '';
  const format = typeof job.params.format === 'string' ? job.params.format.trim() : 'csv';
  const start = typeof job.params.start === 'string' ? job.params.start.trim() : '';
  const end = typeof job.params.end === 'string' ? job.params.end.trim() : '';
  const country = typeof job.params.country === 'string' ? job.params.country.trim() : '';
  const topic = typeof job.params.topic === 'string' ? job.params.topic.trim() : '';
  if (!source) {
    await markJobFailed(job.id, 'Missing source.');
    return;
  }

  const aliasMap = await getSourceAliasMap();
  const sourceKey = normalizeSourceKey(source, aliasMap);
  const rows = await db.many<DbRow>(
    `SELECT id, name, email, phone, country, source, interests, createdAt
     FROM leads
     WHERE isUnsubscribed = 0 AND emailInvalid = 0`
  );

  const filtered = rows.filter((row) => {
    const rowSourceKey = normalizeSourceKey(row.source, aliasMap);
    const createdAt = typeof row.createdAt === 'string' ? row.createdAt : '';
    const rowCountry = typeof row.country === 'string' ? row.country.trim() : '';
    const topics = typeof row.interests === 'string' ? parseJsonArray(row.interests) : [];
    if (rowSourceKey !== sourceKey) return false;
    if (start && createdAt < start) return false;
    if (end && createdAt > end) return false;
    if (country && rowCountry !== country) return false;
    if (topic && !topics.includes(topic)) return false;
    return true;
  }).map((row) => ({
    id: String(row.id),
    name: typeof row.name === 'string' ? row.name : '',
    email: typeof row.email === 'string' ? row.email : '',
    phone: typeof row.phone === 'string' ? row.phone : '',
    country: typeof row.country === 'string' ? row.country : '',
    source: resolveSourceLabel(row.source, aliasMap),
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : ''
  }));

  const fileBase = ['source', sanitizeFilePart(resolveSourceLabel(source, aliasMap)), Date.now().toString()].join('-');
  const recipients = Array.isArray(job.params.recipients)
    ? (job.params.recipients as unknown[]).filter((item) => typeof item === 'string') as string[]
    : [];

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sources');
    sheet.columns = [
      { header: 'ID', key: 'id', width: 36 },
      { header: 'Name', key: 'name', width: 20 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Country', key: 'country', width: 10 },
      { header: 'Source', key: 'source', width: 16 },
      { header: 'Created At', key: 'createdAt', width: 22 }
    ];
    sheet.addRows(filtered);
    const filename = `${fileBase}.xlsx`;
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const { key, url } = await uploadExport(`exports/${filename}`, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await markJobCompleted(job.id, key, url);
    await sendReportIfNeeded(recipients, url, `Source report: ${source}`);
    return;
  }

  if (format === 'pdf') {
    const filename = `${fileBase}.pdf`;
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.fontSize(16).text(`Source export: ${source}`, { align: 'left' });
    doc.moveDown();
    doc.fontSize(9);
    filtered.forEach((row) => {
      doc.text([
        row.name || row.email,
        row.email,
        row.phone,
        row.country,
        row.source,
        row.createdAt
      ].filter(Boolean).join(' | '));
    });
    doc.end();
    const buffer = Buffer.concat(chunks);
    const { key, url } = await uploadExport(`exports/${filename}`, buffer, 'application/pdf');
    await markJobCompleted(job.id, key, url);
    await sendReportIfNeeded(recipients, url, `Source report: ${source}`);
    return;
  }

  if (format === 'docx') {
    const filename = `${fileBase}.docx`;
    const rowsData = filtered.map((row) => ([
      row.id || '',
      row.name || '',
      row.email || '',
      row.phone || '',
      row.country || '',
      row.source || '',
      row.createdAt || ''
    ]));
    const tableRows = [
      new TableRow({
        children: ['ID', 'Name', 'Email', 'Phone', 'Country', 'Source', 'Created At']
          .map((text) => new TableCell({ children: [new Paragraph(String(text))] }))
      }),
      ...rowsData.map((row) => new TableRow({
        children: row.map((cell) => new TableCell({ children: [new Paragraph(String(cell))] }))
      }))
    ];
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph(`Source export: ${source}`),
          new Table({ rows: tableRows })
        ]
      }]
    });
    const buffer = await Packer.toBuffer(doc);
    const { key, url } = await uploadExport(`exports/${filename}`, buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    await markJobCompleted(job.id, key, url);
    await sendReportIfNeeded(recipients, url, `Source report: ${source}`);
    return;
  }

  const filename = `${fileBase}.csv`;
  const csv = buildSourcesCsv(filtered);
  const { key, url } = await uploadExport(`exports/${filename}`, Buffer.from(csv, 'utf8'), 'text/csv; charset=utf-8');
  await markJobCompleted(job.id, key, url);
  await sendReportIfNeeded(recipients, url, `Source report: ${source}`);
};

const parseParams = (value: string | null): Record<string, unknown> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const claimNextJob = async () => {
  const now = new Date().toISOString();
  const row = await db.one<DbRow>(
    `UPDATE export_jobs
     SET status = 'processing',
         updatedAt = @updatedAt
     WHERE id IN (
       SELECT id FROM export_jobs
       WHERE status = 'queued'
       ORDER BY createdAt ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    { updatedAt: now }
  );
  if (!row) return null;
  return { id: String(row.id), type: String(row.type), params: parseParams(row.paramsJson) };
};

const claimDueSchedule = async () => {
  const now = new Date().toISOString();
  const row = await db.one<DbRow>(
    `SELECT * FROM export_schedules
     WHERE status = 'active' AND nextRunAt <= @now
     ORDER BY nextRunAt ASC
     LIMIT 1`,
    { now }
  );
  if (!row) return null;
  return {
    id: String(row.id),
    type: String(row.type),
    frequency: String(row.frequency),
    params: parseParams(row.paramsJson)
  };
};

const computeNextRunAt = (frequency: string) => {
  const now = new Date();
  if (frequency === 'weekly') {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
};

const updateScheduleNextRun = async (id: string, frequency: string) => {
  const nextRunAt = computeNextRunAt(frequency);
  await db.exec(
    `UPDATE export_schedules
     SET nextRunAt = @nextRunAt,
         updatedAt = @updatedAt
     WHERE id = @id`,
    { id, nextRunAt, updatedAt: new Date().toISOString() }
  );
};

const enqueueExportJobFromSchedule = async (schedule: { type: string; params: Record<string, unknown> }) => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.exec(
    `INSERT INTO export_jobs (id, type, status, paramsJson, createdAt, updatedAt)
     VALUES (@id, @type, @status, @paramsJson, @createdAt, @updatedAt)`,
    {
    id,
    type: schedule.type,
    status: 'queued',
    paramsJson: JSON.stringify(schedule.params || {}),
    createdAt: now,
    updatedAt: now
    }
  );
};

export const startExportJobWorker = () => {
  workerStatus.running = true;
  workerStatus.startedAt = new Date().toISOString();
  setInterval(() => {
    void (async () => {
      const schedule = await claimDueSchedule();
      if (schedule) {
        await enqueueExportJobFromSchedule(schedule);
        await updateScheduleNextRun(schedule.id, schedule.frequency);
      }
      const job = await claimNextJob();
      if (!job) return;
      try {
        workerStatus.lastJobAt = new Date().toISOString();
        if (job.type === 'segments_csv') {
          await processSegmentsExport(job);
        } else if (job.type === 'sources_export') {
          await processSourcesExport(job);
        } else {
          await markJobFailed(job.id, `Unsupported export type: ${job.type}`);
        }
      } catch (error) {
        await markJobFailed(job.id, error instanceof Error ? error.message : 'Export failed');
      }
    })();
  }, 3000);
};

export const processExportQueueOnce = async () => {
  workerStatus.running = true;
  if (!workerStatus.startedAt) {
    workerStatus.startedAt = new Date().toISOString();
  }
  const schedule = await claimDueSchedule();
  if (schedule) {
    await enqueueExportJobFromSchedule(schedule);
    await updateScheduleNextRun(schedule.id, schedule.frequency);
  }
  const job = await claimNextJob();
  if (!job) {
    return { scheduled: Boolean(schedule), processed: 0 };
  }
  try {
    workerStatus.lastJobAt = new Date().toISOString();
    if (job.type === 'segments_csv') {
      await processSegmentsExport(job);
    } else if (job.type === 'sources_export') {
      await processSourcesExport(job);
    } else {
      await markJobFailed(job.id, `Unsupported export type: ${job.type}`);
    }
    return { scheduled: Boolean(schedule), processed: 1 };
  } catch (error) {
    await markJobFailed(job.id, error instanceof Error ? error.message : 'Export failed');
    return { scheduled: Boolean(schedule), processed: 1 };
  }
};
