import { Router } from 'express';
import dns from 'dns/promises';
import crypto from 'crypto';
import db from '../db';
import { requireAdminToken } from '../middleware/adminToken';
import { contentEvents, emitContentUpdate } from '../events';
import { sendTemplateTestEmail, sendWelcomeEmail } from '../services/mailer';
import {
  SMTP_FROM,
  SMTP_USER,
  PUBLIC_URL,
  SEND_RATE_PER_MINUTE,
  SEND_RATE_PER_HOUR,
  MAX_CAMPAIGNS_PER_DAY,
  MAX_CAMPAIGNS_PER_HOUR,
  SPF_CONFIGURED,
  DKIM_CONFIGURED,
  DMARC_CONFIGURED,
  DELIVERABILITY_DOMAIN,
  DKIM_SELECTOR,
  DELIVERABILITY_WARNINGS_ENABLED,
  DRY_RUN_MODE,
  TEST_SEND_ALLOWLIST,
  UPLOAD_DIR,
  R2_PUBLIC_BASE_URL
} from '../config/env';
import {
  enqueueCampaignJobs,
  enqueueSandboxJobs,
  getCampaignAudience,
  getCampaignProgress,
  syncCampaignSchedule,
  updateCampaignStatus,
  getEmailWorkerStatus
} from '../services/emailCampaignService';
import { renderEmailWithPostProcess } from '../services/emailRenderService';
import { logAdminActivity } from '../services/activityLogService';
import { refreshSegmentsSummaryCache } from '../services/segmentsSummaryService';
import { broadcastSegmentsUpdate } from '../services/segmentsLiveService';
import { refreshSourcesSummaryCache } from '../services/sourcesSummaryService';
import { broadcastSourcesUpdate } from '../services/sourcesLiveService';
import { getExportWorkerStatus } from '../services/exportJobService';
import { getAutomationSchedulerStatus } from '../services/automationService';
import fs from 'fs';
import path from 'path';
import { readLogLines } from '../storage/logStore';
import { getSession as getAdminSession } from '../modules/auth/controller';
import { getAnalytics, resetAnalytics } from '../modules/analytics/controller';
import { getProducts, postProduct, putProduct, removeProduct } from '../modules/content/products/controller';
import { getVideos, postVideo, putVideo, removeVideo } from '../modules/content/videos/controller';
import { getTestimonials, postTestimonial, putTestimonial, removeTestimonial } from '../modules/content/testimonials/controller';
import { getHeroHandler, putHeroHandler } from '../modules/content/hero/controller';
import { getFeaturedSlots, postFeaturedSlot, putFeaturedSlot, removeFeaturedSlot } from '../modules/content/featured/controller';
import { getUpcoming, postUpcoming, putUpcoming, removeUpcoming } from '../modules/content/upcoming/controller';
import {
  getSettings,
  postTotpSetup,
  postTotpVerify,
  postBackupCodes,
  putSettings,
  postRevokeTrustedDevices,
  postSmtpTest,
  postSmtpVerify,
  postSmtpRestore,
  getSmtpLogsHandler
} from '../modules/settings/controller';
import { getAudiencesSummaryHandler } from '../modules/audiences/controller';
import {
  getSegmentsSummaryHandler,
  getSegmentsStream,
  getSegmentDetailHandler,
  postSegmentsExport,
  getSegmentsExport,
  getSegmentsExports,
  getSavedSegments,
  postSavedSegment,
  putSavedSegment,
  removeSavedSegment
} from '../modules/segments/controller';
import {
  getSourcesSummaryHandler,
  getSourcesStream,
  getSourceAliases,
  postSourceAliasSuggest,
  postSourceAlias,
  removeSourceAlias,
  getSourceDetailHandler,
  postSourcesExport,
  getSourcesExports,
  getSourcesExportSchedules,
  postSourcesExportSchedule,
  removeSourcesExportSchedule
} from '../modules/sources/controller';

type DbRow = Record<string, any>;

const router = Router();

const isValidUrl = (value?: string | null) => {
  if (!value) return false;
  if (value.startsWith('/')) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
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

type FooterKeywordItem = {
  label: string;
  url: string | null;
};

const normalizeFooterKeywordItems = (items: unknown[]) =>
  items
    .map((item) => {
      if (typeof item === 'string') {
        const label = item.trim();
        if (!label) return null;
        return { label, url: null } as FooterKeywordItem;
      }
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const label = typeof record.label === 'string' ? record.label.trim() : '';
        if (!label) return null;
        const url = typeof record.url === 'string' ? record.url.trim() : '';
        return { label, url: url || null } as FooterKeywordItem;
      }
      return null;
    })
    .filter((item): item is FooterKeywordItem => Boolean(item))
    .slice(0, 30);

type VisibilitySection = {
  label: string;
  active: boolean;
};

type WelcomeEmailConfig = {
  enabled: boolean;
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  sendDelayMins: number;
  body: string;
};

const DEFAULT_SECTION_VISIBILITY: VisibilitySection[] = [
  { label: 'Hero', active: true },
  { label: 'Top Products', active: true },
  { label: 'Partners', active: true },
  { label: 'Upcoming Releases', active: true },
  { label: 'Video Ads', active: true },
  { label: 'Testimonials', active: true },
  { label: 'FAQs', active: true }
];

const DEFAULT_WELCOME_EMAIL: WelcomeEmailConfig = {
  enabled: true,
  subject: 'Welcome to 33-item!',
  fromName: null,
  fromEmail: null,
  replyTo: null,
  sendDelayMins: 0,
  body: 'Thanks for subscribing! Confirm your email here: {{confirmationUrl}}'
};

const normalizeVisibilitySections = (items: unknown[]) =>
  items
    .map((item) => {
      if (typeof item === 'string') {
        const label = item.trim();
        if (!label) return null;
        return { label, active: true } as VisibilitySection;
      }
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const label = typeof record.label === 'string' ? record.label.trim() : '';
        if (!label) return null;
        const active =
          typeof record.active === 'boolean'
            ? record.active
            : record.active === 1 || record.active === '1';
        return { label, active } as VisibilitySection;
      }
      return null;
    })
    .filter((item): item is VisibilitySection => Boolean(item))
    .slice(0, 30);

const normalizeWelcomeEmailConfig = (value: Record<string, unknown> | null) => {
  const candidate = value || {};
  const enabled = typeof candidate.enabled === 'boolean'
    ? candidate.enabled
    : candidate.enabled === 1 || candidate.enabled === '1';
  const subject = typeof candidate.subject === 'string' ? candidate.subject.trim() : '';
  const fromName = typeof candidate.fromName === 'string' ? candidate.fromName.trim() : '';
  const fromEmail = typeof candidate.fromEmail === 'string' ? candidate.fromEmail.trim() : '';
  const replyTo = typeof candidate.replyTo === 'string' ? candidate.replyTo.trim() : '';
  const sendDelayMins = Number.isFinite(Number(candidate.sendDelayMins))
    ? Math.max(0, Number(candidate.sendDelayMins))
    : DEFAULT_WELCOME_EMAIL.sendDelayMins;
  const body = typeof candidate.body === 'string' ? candidate.body : '';
  return {
    enabled: Boolean(enabled),
    subject: subject || DEFAULT_WELCOME_EMAIL.subject,
    fromName: fromName || null,
    fromEmail: fromEmail || null,
    replyTo: replyTo || null,
    sendDelayMins,
    body: body || DEFAULT_WELCOME_EMAIL.body
  };
};

const loadWelcomeEmailConfig = async () => {
  const settings = await db.one<DbRow>(
    'SELECT welcomeEmailConfig FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  if (!settings?.welcomeEmailConfig || typeof settings.welcomeEmailConfig !== 'string') {
    return null;
  }
  const parsed = parseJsonValue(settings.welcomeEmailConfig);
  return normalizeWelcomeEmailConfig(parsed as Record<string, unknown>);
};

const parseJsonList = (value: string | null): any[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter((item) => item);
        }
      } catch {
        return [];
      }
    }
    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item);
  }
  return [];
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

const buildSuppressedFilter = (query: Record<string, unknown>) => {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit || 25)));
  const reason = typeof query.reason === 'string' ? query.reason.trim() : '';
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const source = typeof query.source === 'string' ? query.source.trim() : '';
  const country = typeof query.country === 'string' ? query.country.trim() : '';
  const start = typeof query.start === 'string' ? query.start.trim() : '';
  const end = typeof query.end === 'string' ? query.end.trim() : '';
  const reasonClause = reason === 'unsubscribed'
    ? 'isUnsubscribed = 1'
    : reason === 'email_invalid'
      ? 'emailInvalid = 1'
      : '(isUnsubscribed = 1 OR emailInvalid = 1)';
  const whereParts = [reasonClause];
  const params: Record<string, unknown> = { limit, offset: (page - 1) * limit };
  if (search) {
    whereParts.push('(email LIKE @search OR name LIKE @search)');
    params.search = `%${search}%`;
  }
  if (source) {
    whereParts.push('source = @source');
    params.source = source;
  }
  if (country) {
    whereParts.push('country = @country');
    params.country = country;
  }
  if (start) {
    whereParts.push('createdAt >= @start');
    params.start = start;
  }
  if (end) {
    whereParts.push('createdAt <= @end');
    params.end = end;
  }
  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  return { page, limit, reason, search, source, country, start, end, whereClause, params };
};

const csvEscape = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const normalizeScheduleType = (value: unknown) => {
  if (typeof value !== 'string') return 'campaign';
  const trimmed = value.trim().toLowerCase();
  return ['campaign', 'automation', 'content', 'other'].includes(trimmed) ? trimmed : 'campaign';
};

const normalizeScheduleChannel = (value: unknown) => {
  if (typeof value !== 'string') return 'email';
  const trimmed = value.trim().toLowerCase();
  return ['email', 'sms', 'social', 'web', 'other'].includes(trimmed) ? trimmed : 'email';
};

const normalizeScheduleStatus = (value: unknown) => {
  if (typeof value !== 'string') return 'draft';
  const trimmed = value.trim().toLowerCase();
  return ['draft', 'scheduled', 'sent', 'cancelled'].includes(trimmed) ? trimmed : 'draft';
};

const readSmtpLogLines = async (limit: number) => {
  try {
    const lines = await readLogLines('smtp-debug.log', limit);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return lines.filter((line) => {
      const match = line.match(/^\[(?<ts>[^\]]+)\]/);
      if (!match?.groups?.ts) return true;
      const ts = Date.parse(match.groups.ts);
      if (Number.isNaN(ts)) return true;
      return ts >= cutoff;
    });
  } catch {
    return [];
  }
};

const parseSmtpLogLine = (line: string) => {
  const match = line.match(/^\[(?<ts>[^\]]+)\]\s+(?<rest>.+)$/);
  if (!match?.groups) {
    return { createdAt: '', message: line, type: 'info' };
  }
  const createdAt = match.groups.ts || '';
  const rest = match.groups.rest || '';
  const type = rest.includes('error') ? 'error' : 'info';
  return { createdAt, message: rest, type };
};

const resolveLastTimestamp = async (table: string, column: string) => {
  try {
    const row = await db.one<DbRow>(`SELECT MAX(${column}) as lastAt FROM ${table}`);
    return typeof row?.lastAt === 'string' ? row.lastAt : null;
  } catch {
    return null;
  }
};

const getDirectorySizeMb = (dirPath: string) => {
  if (process.env.NETLIFY || R2_PUBLIC_BASE_URL) {
    return null;
  }
  try {
    let total = 0;
    const stack = [dirPath];
    while (stack.length) {
      const current = stack.pop();
      if (!current) continue;
      const entries = fs.readdirSync(current, { withFileTypes: true });
      entries.forEach((entry) => {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          return;
        }
        if (entry.isFile()) {
          try {
            total += fs.statSync(fullPath).size;
          } catch {
            // ignore file stat errors
          }
        }
      });
    }
    return Math.round((total / (1024 * 1024)) * 10) / 10;
  } catch {
    return null;
  }
};

const getAppVersion = () => {
  try {
    const raw = fs.readFileSync(path.resolve('package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version || '';
  } catch {
    return '';
  }
};

const resolveAdminActor = async (req: any) => {
  const sessionHeader = req.headers['x-admin-session'];
  const sessionToken = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
  const querySession = typeof req.query?.adminSession === 'string' ? req.query.adminSession : '';
  const sessionValue = sessionToken || querySession;
  if (!sessionValue) return null;
  const row = await db.one<DbRow>(
    `SELECT admin_users.email as email
     FROM admin_sessions
     JOIN admin_users ON admin_sessions.adminId = admin_users.id
     WHERE admin_sessions.token = ?
     LIMIT 1`,
    [sessionValue]
  );
  return row?.email ? String(row.email) : null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseDomainFromValue = (value?: string | null) => {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.includes('@')) {
    return trimmed.split('@').pop()?.trim().toLowerCase() || '';
  }
  try {
    const url = new URL(trimmed);
    return url.hostname.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DNS lookup timed out.')), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

const resolveTxtMatch = async (host: string, predicate: (value: string) => boolean) => {
  if (!host) return null;
  try {
    const records = await withTimeout(dns.resolveTxt(host), 2500);
    const flattened = records.flat().map((value) => value.trim());
    const match = flattened.find((record) => predicate(record));
    return match ? { ok: true, record: match } : { ok: false, record: '' };
  } catch {
    return null;
  }
};

const getDeliverabilityDomain = async () => {
  if (DELIVERABILITY_DOMAIN) return DELIVERABILITY_DOMAIN.toLowerCase();
  const settings = await db.one<DbRow>(
    'SELECT senderEmail, adminEmail, smtpFrom, deliverabilityDomain FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  return (
    parseDomainFromValue(settings?.deliverabilityDomain) ||
    parseDomainFromValue(settings?.senderEmail) ||
    parseDomainFromValue(settings?.smtpFrom) ||
    parseDomainFromValue(settings?.adminEmail) ||
    parseDomainFromValue(SMTP_FROM) ||
    parseDomainFromValue(SMTP_USER)
  );
};

const getDkimSelector = async () => {
  if (DKIM_SELECTOR.trim()) return DKIM_SELECTOR.trim();
  const settings = await db.one<DbRow>('SELECT dkimSelector FROM admin_settings ORDER BY updatedAt DESC LIMIT 1');
  return typeof settings?.dkimSelector === 'string' ? settings.dkimSelector.trim() : '';
};

const resolveDeliverabilityStatus = async () => {
  const domain = await getDeliverabilityDomain();
  const selector = await getDkimSelector();
  const spfHost = domain;
  const dmarcHost = domain ? `_dmarc.${domain}` : '';
  const dkimHost = selector && domain ? `${selector}._domainkey.${domain}` : '';
  const spf = await resolveTxtMatch(spfHost, (value) => value.toLowerCase().startsWith('v=spf1'));
  const dmarc = await resolveTxtMatch(
    domain ? `_dmarc.${domain}` : '',
    (value) => value.toLowerCase().startsWith('v=dmarc1')
  );
  const dkim = await resolveTxtMatch(
    dkimHost,
    (value) => value.toLowerCase().includes('v=dkim1')
  );
  return {
    spfConfigured: typeof spf?.ok === 'boolean' ? spf.ok : SPF_CONFIGURED,
    dkimConfigured: typeof dkim?.ok === 'boolean' ? dkim.ok : DKIM_CONFIGURED,
    dmarcConfigured: typeof dmarc?.ok === 'boolean' ? dmarc.ok : DMARC_CONFIGURED,
    details: {
      domain,
      selector,
      spfHost,
      dkimHost,
      dmarcHost,
      spfCheck: spf ? (spf.ok ? 'ok' : 'missing') : 'unavailable',
      dkimCheck: dkim ? (dkim.ok ? 'ok' : 'missing') : 'unavailable',
      dmarcCheck: dmarc ? (dmarc.ok ? 'ok' : 'missing') : 'unavailable',
      spfRecord: spf?.record || '',
      dkimRecord: dkim?.record || '',
      dmarcRecord: dmarc?.record || '',
      lastCheckedAt: new Date().toISOString()
    }
  };
};


const CLIENT_PAGE_KEYS = ['home', 'items', 'forex'] as const;

const isValidClientPage = (value: string) =>
  CLIENT_PAGE_KEYS.includes(value as (typeof CLIENT_PAGE_KEYS)[number]);

const normalizeUploadUrl = (value?: string | null) => {
  if (!value) return null;
  if (value.includes('\\')) {
    const fileName = value.split(/[/\\]+/).pop() || '';
    return fileName ? `/uploads/${fileName}` : null;
  }
  if (value.startsWith('uploads/')) {
    return `/${value}`;
  }
  if (value.startsWith('/uploads/')) return value;
  try {
    const url = new URL(value);
    if (url.pathname.startsWith('/uploads/')) {
      return url.pathname;
    }
  } catch {
    // fall through
  }
  return value;
};

const normalizeUploadArray = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((item) => (typeof item === 'string' ? normalizeUploadUrl(item) : null))
    .filter((item): item is string => Boolean(item));

const normalizeAffiliateLink = (value: unknown, fallback: string | null = null) => {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const resolveOptionalUpload = (value: unknown, fallback: string | null) => {
  if (value === undefined) return fallback;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return fallback;
  return normalizeUploadUrl(value);
};

const ensureUnsubscribeFooter = (html: string) => {
  const source = html || '';
  if (source.includes('{{unsubscribeUrl}}') || /unsubscribe/i.test(source)) {
    return source;
  }
  const footer = `
<div style="margin-top:24px;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;text-align:center;">
  <a href="{{unsubscribeUrl}}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
</div>`;
  return `${source}${footer}`;
};

const enforceCampaignLimits = async () => {
  const hourLimit = Number.isFinite(MAX_CAMPAIGNS_PER_HOUR) ? MAX_CAMPAIGNS_PER_HOUR : 0;
  const dayLimit = Number.isFinite(MAX_CAMPAIGNS_PER_DAY) ? MAX_CAMPAIGNS_PER_DAY : 0;
  if (hourLimit <= 0 && dayLimit <= 0) return;
  const now = Date.now();
  const hourStart = new Date(now - 60 * 60 * 1000).toISOString();
  const dayStart = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const statusFilter = "('sending','scheduled','sent')";
  const hourRow = await db.one<DbRow>(
    `SELECT COUNT(*) as count FROM email_campaigns WHERE status IN ${statusFilter} AND updatedAt >= @start`,
    { start: hourStart }
  );
  const dayRow = await db.one<DbRow>(
    `SELECT COUNT(*) as count FROM email_campaigns WHERE status IN ${statusFilter} AND updatedAt >= @start`,
    { start: dayStart }
  );
  if (hourLimit > 0 && Number(hourRow?.count || 0) >= hourLimit) {
    throw new Error('Hourly campaign limit reached.');
  }
  if (dayLimit > 0 && Number(dayRow?.count || 0) >= dayLimit) {
    throw new Error('Daily campaign limit reached.');
  }
};

router.use(requireAdminToken);

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

router.get('/analytics', getAnalytics);

router.get('/audiences/summary', getAudiencesSummaryHandler);

router.get('/segments/summary', getSegmentsSummaryHandler);
router.get('/segments/stream', getSegmentsStream);
router.get('/segments/detail', getSegmentDetailHandler);
router.post('/segments/export', postSegmentsExport);
router.get('/segments/export/:id', getSegmentsExport);
router.get('/segments/exports', getSegmentsExports);
router.get('/segments/saved', getSavedSegments);
router.post('/segments/saved', postSavedSegment);
router.put('/segments/saved/:id', putSavedSegment);
router.delete('/segments/saved/:id', removeSavedSegment);

router.get('/sources/summary', getSourcesSummaryHandler);
router.get('/sources/stream', getSourcesStream);
router.get('/sources/aliases', getSourceAliases);
router.post('/sources/aliases/suggest', postSourceAliasSuggest);
router.post('/sources/aliases', postSourceAlias);
router.delete('/sources/aliases/:id', removeSourceAlias);
router.get('/sources/detail', getSourceDetailHandler);
router.post('/sources/export', postSourcesExport);
router.get('/sources/exports', getSourcesExports);
router.get('/sources/export-schedules', getSourcesExportSchedules);
router.post('/sources/export-schedules', postSourcesExportSchedule);
router.delete('/sources/export-schedules/:id', removeSourcesExportSchedule);

router.get('/activity', async (req, res) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 20)));
  const actionPrefix =
    typeof req.query.actionPrefix === 'string' ? req.query.actionPrefix.trim() : '';
  const whereSql = actionPrefix ? 'WHERE action LIKE @prefix' : '';
  const rows = await db.many<DbRow>(
    `SELECT id, action, actor, metaJson, createdAt
     FROM admin_activity
     ${whereSql}
     ORDER BY createdAt DESC
     LIMIT @limit`,
    { limit, prefix: `${actionPrefix}%` }
  );
  return res.json(rows.map((row) => ({
    id: String(row.id),
    action: String(row.action || ''),
    actor: row.actor ? String(row.actor) : null,
    meta: row.metaJson ? parseJsonValue(row.metaJson) : {},
    createdAt: String(row.createdAt || '')
  })));
});

router.get('/settings', getSettings);

router.get('/session', getAdminSession);

router.post('/totp/setup', postTotpSetup);
router.post('/totp/verify', postTotpVerify);
router.post('/backup-codes', postBackupCodes);

router.post('/smtp/test', postSmtpTest);
router.post('/smtp/verify', postSmtpVerify);
router.post('/smtp/restore', postSmtpRestore);
router.get('/smtp/logs', getSmtpLogsHandler);

router.post('/trusted-devices/revoke', postRevokeTrustedDevices);

router.put('/settings', putSettings);

router.post('/email/test-send', async (req, res) => {
  const { to, subject, html } = req.body as { to?: string; subject?: string; html?: string };
  if (!to || typeof to !== 'string') {
    return res.status(400).json({ error: 'Recipient email is required' });
  }
  const safeSubject = typeof subject === 'string' && subject.trim() ? subject.trim() : 'Test email';
  const safeHtml = typeof html === 'string' && html.trim()
    ? html.trim()
    : '<p>This is a test email from BossDesk.</p>';
  try {
    await sendTemplateTestEmail(to.trim(), safeSubject, safeHtml);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send test email.'
    });
  }
});

router.post('/analytics/reset', resetAnalytics);

router.get('/products', getProducts);
router.post('/products', postProduct);
router.put('/products/:id', putProduct);
router.delete('/products/:id', removeProduct);

router.get('/testimonials', getTestimonials);
router.post('/testimonials', postTestimonial);
router.put('/testimonials/:id', putTestimonial);
router.delete('/testimonials/:id', removeTestimonial);

router.get('/hero', getHeroHandler);
router.put('/hero', putHeroHandler);

router.get('/featured-slots', getFeaturedSlots);
router.post('/featured-slots', postFeaturedSlot);
router.put('/featured-slots/:id', putFeaturedSlot);
router.delete('/featured-slots/:id', removeFeaturedSlot);

router.get('/upcoming', getUpcoming);
router.post('/upcoming', postUpcoming);
router.put('/upcoming/:id', putUpcoming);
router.delete('/upcoming/:id', removeUpcoming);

router.get('/videos', getVideos);
router.post('/videos', postVideo);
router.put('/videos/:id', putVideo);
router.delete('/videos/:id', removeVideo);

router.get('/theme', async (_req, res) => {
  const row = await db.one<DbRow>('SELECT * FROM theme_config ORDER BY updatedAt DESC LIMIT 1');
  return res.json(row || null);
});

router.get('/compliance', async (_req, res) => {
  const settings = await db.one<DbRow>(
    'SELECT complianceText, welcomeEmailConfig FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  const text = typeof settings?.complianceText === 'string' && settings.complianceText.trim()
    ? settings.complianceText
    : 'You can unsubscribe anytime.';
  const rawConfig = typeof settings?.welcomeEmailConfig === 'string'
    ? parseJsonValue(settings.welcomeEmailConfig)
    : null;
  const welcomeEmail = normalizeWelcomeEmailConfig(rawConfig);
  return res.json({ text, welcomeEmail });
});

router.get('/visibility', async (_req, res) => {
  const settings = await db.one<DbRow>(
    'SELECT sectionVisibility FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  const rawItems = typeof settings?.sectionVisibility === 'string'
    ? parseJsonList(settings.sectionVisibility)
    : DEFAULT_SECTION_VISIBILITY;
  const normalized = normalizeVisibilitySections(rawItems);
  return res.json({ items: normalized.length ? normalized : DEFAULT_SECTION_VISIBILITY });
});

router.get('/footer-keywords', async (_req, res) => {
  const settings = await db.one<DbRow>(
    'SELECT footerKeywords FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  const fallback = [
    'Automation',
    'Affiliate Marketing',
    'Digital Products',
    'Email Funnels',
    'AI Content',
    'YouTube Growth'
  ];
  const rawItems = typeof settings?.footerKeywords === 'string'
    ? parseJsonArray(settings.footerKeywords)
    : fallback;
  const normalized = normalizeFooterKeywordItems(rawItems);
  const fallbackItems = fallback.map((label) => ({ label, url: null }));
  return res.json({ items: normalized.length ? normalized : fallbackItems });
});

router.get('/cta-labels', async (_req, res) => {
  const settings = await db.one<DbRow>('SELECT ctaLabels FROM admin_settings ORDER BY updatedAt DESC LIMIT 1');
  const fallback = [
    'Subscribe for updates',
    'Get featured offers',
    'Subscribe to get access',
    'Notify me',
    'Proceed'
  ];
  const items = typeof settings?.ctaLabels === 'string'
    ? parseJsonArray(settings.ctaLabels)
    : fallback;
  return res.json({ items: items.length ? items : fallback });
});

router.put('/footer-keywords', async (req, res) => {
  const { items } = req.body as { items?: unknown[] };
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'items must be an array' });
  }
  const normalized = normalizeFooterKeywordItems(items);
  const settings = await db.one<DbRow>('SELECT id FROM admin_settings ORDER BY updatedAt DESC LIMIT 1');
  if (!settings?.id) {
    return res.status(400).json({ error: 'Admin settings not initialized.' });
  }
  await db.exec(
    `UPDATE admin_settings
     SET footerKeywords = @footerKeywords,
         updatedAt = @updatedAt
     WHERE id = @id`,
    {
    id: settings.id,
    footerKeywords: JSON.stringify(normalized),
    updatedAt: new Date().toISOString()
    }
  );
  emitContentUpdate('footer');
  return res.json({ items: normalized });
});

router.put('/visibility', async (req, res) => {
  const { items } = req.body as { items?: unknown[] };
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'items must be an array' });
  }
  const normalized = normalizeVisibilitySections(items);
  const settings = await db.one<DbRow>('SELECT id FROM admin_settings ORDER BY updatedAt DESC LIMIT 1');
  if (!settings?.id) {
    return res.status(400).json({ error: 'Admin settings not initialized.' });
  }
  await db.exec(
    `UPDATE admin_settings
     SET sectionVisibility = @sectionVisibility,
         updatedAt = @updatedAt
     WHERE id = @id`,
    {
    id: settings.id,
    sectionVisibility: JSON.stringify(normalized),
    updatedAt: new Date().toISOString()
    }
  );
  emitContentUpdate('visibility');
  return res.json({ items: normalized });
});

router.put('/compliance', async (req, res) => {
  const { text, welcomeEmail } = req.body as {
    text?: string;
    welcomeEmail?: Record<string, unknown>;
  };
  const settings = await db.one<DbRow>(
    'SELECT id, complianceText, welcomeEmailConfig FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  if (!settings?.id) {
    return res.status(400).json({ error: 'Admin settings not initialized.' });
  }
  const nextText = typeof text === 'string' && text.trim()
    ? text.trim()
    : typeof settings.complianceText === 'string' && settings.complianceText.trim()
      ? settings.complianceText
      : 'You can unsubscribe anytime.';
  const existingConfig = typeof settings.welcomeEmailConfig === 'string'
    ? parseJsonValue(settings.welcomeEmailConfig)
    : null;
  const nextWelcome = welcomeEmail
    ? normalizeWelcomeEmailConfig(welcomeEmail)
    : normalizeWelcomeEmailConfig(existingConfig);
  await db.exec(
    `UPDATE admin_settings
     SET complianceText = @complianceText,
         welcomeEmailConfig = @welcomeEmailConfig,
         updatedAt = @updatedAt
     WHERE id = @id`,
    {
    id: settings.id,
    complianceText: nextText,
    welcomeEmailConfig: JSON.stringify(nextWelcome),
    updatedAt: new Date().toISOString()
    }
  );
  emitContentUpdate('compliance');
  return res.json({ text: nextText, welcomeEmail: nextWelcome });
});

router.put('/cta-labels', async (req, res) => {
  const { items } = req.body as { items?: string[] };
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'items must be an array' });
  }
  const normalized = items
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, 30);
  const settings = await db.one<DbRow>('SELECT id FROM admin_settings ORDER BY updatedAt DESC LIMIT 1');
  if (!settings?.id) {
    return res.status(400).json({ error: 'Admin settings not initialized.' });
  }
  await db.exec(
    `UPDATE admin_settings
     SET ctaLabels = @ctaLabels,
         updatedAt = @updatedAt
     WHERE id = @id`,
    {
    id: settings.id,
    ctaLabels: JSON.stringify(normalized),
    updatedAt: new Date().toISOString()
    }
  );
  emitContentUpdate('cta-labels');
  return res.json({ items: normalized });
});

router.put('/theme', async (req, res) => {
  const { mode, seasonalTheme, customThemeId } = req.body as Record<string, unknown>;
  if (!mode || typeof mode !== 'string') {
    return res.status(400).json({ error: 'Mode is required' });
  }
  const id = 'theme-default';
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO theme_config (id, mode, seasonalTheme, customThemeId, updatedAt)
     VALUES (@id, @mode, @seasonalTheme, @customThemeId, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       mode = excluded.mode,
       seasonalTheme = excluded.seasonalTheme,
       customThemeId = excluded.customThemeId,
       updatedAt = excluded.updatedAt`
  ,{
    id,
    mode,
    seasonalTheme: typeof seasonalTheme === 'string' ? seasonalTheme : 'none',
    customThemeId: typeof customThemeId === 'string' ? customThemeId : null,
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM theme_config WHERE id = ?', [id]);
  emitContentUpdate('theme');
  return res.json(row);
});

router.get('/themes/custom', async (_req, res) => {
  const rows = await db.many<DbRow>('SELECT * FROM custom_themes ORDER BY createdAt DESC');
  const items = rows.map((row) => ({
    ...row,
    values: JSON.parse(row.themeValues || '{}')
  }));
  return res.json(items);
});

router.post('/themes/custom', async (req, res) => {
  const { name, values } = req.body as Record<string, unknown>;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!values || typeof values !== 'object') {
    return res.status(400).json({ error: 'Theme values are required' });
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO custom_themes (id, name, themeValues, createdAt)
     VALUES (@id, @name, @themeValues, @createdAt)`
  ,{
    id,
    name: name.trim(),
    themeValues: JSON.stringify(values),
    createdAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM custom_themes WHERE id = ?', [id]);
  emitContentUpdate('theme');
  return res.status(201).json({ ...row, values });
});

router.delete('/themes/custom/:id', async (req, res) => {
  const { id } = req.params;
  const result = await db.exec('DELETE FROM custom_themes WHERE id = ?', [id]);
  if ((result.rowCount ?? 0) === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  emitContentUpdate('theme');
  return res.json({ deleted: id });
});

router.get('/pages', async (_req, res) => {
  const rows = await db.many<DbRow>('SELECT * FROM pages ORDER BY createdAt DESC');
  return res.json(rows);
});

router.post('/pages', async (req, res) => {
  const { slug, title, templateId } = req.body as Record<string, unknown>;
  if (!slug || !title) {
    return res.status(400).json({ error: 'Slug and title are required' });
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO pages (id, slug, title, status, templateId, createdAt, updatedAt)
     VALUES (@id, @slug, @title, @status, @templateId, @createdAt, @updatedAt)`
  ,{
    id,
    slug,
    title,
    status: 'draft',
    templateId: typeof templateId === 'string' ? templateId : null,
    createdAt: now,
    updatedAt: now
  });

  if (typeof templateId === 'string') {
    const template = await db.one<DbRow>('SELECT sections FROM templates WHERE id = ?', [templateId]);
    const sections = template?.sections ? parseJsonList(template.sections) : [];
    for (const [index, section] of sections.entries()) {
      await db.exec(
        `INSERT INTO sections (id, pageId, type, sortOrder, data, createdAt, updatedAt)
         VALUES (@id, @pageId, @type, @sortOrder, @data, @createdAt, @updatedAt)`
      ,{
        id: crypto.randomUUID(),
        pageId: id,
        type: typeof section === 'object' && section && 'type' in section ? (section as any).type : 'text',
        sortOrder: index,
        data: JSON.stringify(
          typeof section === 'object' && section && 'data' in section ? (section as any).data : {}
        ),
        createdAt: now,
        updatedAt: now
      });
    }
  }

  const row = await db.one<DbRow>('SELECT * FROM pages WHERE id = ?', [id]);
  emitContentUpdate('pages');
  return res.status(201).json(row);
});

router.put('/pages/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT * FROM pages WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }
  const updates = req.body as Record<string, unknown>;
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE pages SET
      slug = @slug,
      title = @title,
      status = @status,
      updatedAt = @updatedAt
    WHERE id = @id`
  ,{
    id,
    slug: updates.slug || existing.slug,
    title: updates.title || existing.title,
    status: updates.status || existing.status,
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM pages WHERE id = ?', [id]);
  emitContentUpdate('pages');
  return res.json(row);
});

router.delete('/pages/:id', async (req, res) => {
  const { id } = req.params;
  const result = await db.exec('DELETE FROM pages WHERE id = ?', [id]);
  if ((result.rowCount ?? 0) === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  emitContentUpdate('pages');
  return res.json({ deleted: id });
});

router.get('/pages/:id/sections', async (req, res) => {
  const { id } = req.params;
  const rows = await db.many<DbRow>(
    'SELECT * FROM sections WHERE pageId = ? ORDER BY sortOrder ASC',
    [id]
  );
  const items = rows.map((row) => ({
    ...row,
    data: parseJsonValue(row.data)
  }));
  return res.json(items);
});

router.post('/pages/:id/sections', async (req, res) => {
  const { id } = req.params;
  const { type, sortOrder, data } = req.body as Record<string, unknown>;
  if (!type || typeof type !== 'string') {
    return res.status(400).json({ error: 'Section type is required' });
  }
  const now = new Date().toISOString();
  const sectionId = crypto.randomUUID();
  await db.exec(
    `INSERT INTO sections (id, pageId, type, sortOrder, data, createdAt, updatedAt)
     VALUES (@id, @pageId, @type, @sortOrder, @data, @createdAt, @updatedAt)`
  ,{
    id: sectionId,
    pageId: id,
    type,
    sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
    data: JSON.stringify(data || {}),
    createdAt: now,
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM sections WHERE id = ?', [sectionId]);
  emitContentUpdate('pages');
  return res.status(201).json({ ...row, data: parseJsonValue(row.data) });
});

router.put('/sections/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT * FROM sections WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }
  const updates = req.body as Record<string, unknown>;
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE sections SET
      type = @type,
      sortOrder = @sortOrder,
      data = @data,
      updatedAt = @updatedAt
    WHERE id = @id`
  ,{
    id,
    type: updates.type || existing.type,
    sortOrder: typeof updates.sortOrder === 'number' ? updates.sortOrder : existing.sortOrder,
    data: JSON.stringify(updates.data ?? parseJsonValue(existing.data)),
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM sections WHERE id = ?', [id]);
  emitContentUpdate('pages');
  return res.json({ ...row, data: parseJsonValue(row.data) });
});

router.delete('/sections/:id', async (req, res) => {
  const { id } = req.params;
  const result = await db.exec('DELETE FROM sections WHERE id = ?', [id]);
  if ((result.rowCount ?? 0) === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  emitContentUpdate('pages');
  return res.json({ deleted: id });
});

router.get('/client-pages/:page/sections', async (req, res) => {
  const { page } = req.params;
  if (!isValidClientPage(page)) {
    return res.status(400).json({ error: 'Invalid page key' });
  }
  const rows = await db.many<DbRow>(
    'SELECT * FROM client_sections WHERE pageKey = ? ORDER BY sortOrder ASC',
    [page]
  );
  const items = rows.map((row) => ({
    ...row,
    data: parseJsonValue(row.data)
  }));
  return res.json(items);
});

router.post('/client-pages/:page/sections', async (req, res) => {
  const { page } = req.params;
  if (!isValidClientPage(page)) {
    return res.status(400).json({ error: 'Invalid page key' });
  }
  const { type, sortOrder, data } = req.body as Record<string, unknown>;
  if (!type || typeof type !== 'string') {
    return res.status(400).json({ error: 'Section type is required' });
  }
  const now = new Date().toISOString();
  const sectionId = crypto.randomUUID();
  await db.exec(
    `INSERT INTO client_sections (id, pageKey, type, sortOrder, data, createdAt, updatedAt)
     VALUES (@id, @pageKey, @type, @sortOrder, @data, @createdAt, @updatedAt)`
  ,{
    id: sectionId,
    pageKey: page,
    type,
    sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
    data: JSON.stringify(data || {}),
    createdAt: now,
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM client_sections WHERE id = ?', [sectionId]);
  emitContentUpdate('client-sections');
  return res.status(201).json({ ...row, data: parseJsonValue(row.data) });
});

router.put('/client-sections/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT * FROM client_sections WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }
  const updates = req.body as Record<string, unknown>;
  if (typeof updates.pageKey === 'string' && !isValidClientPage(updates.pageKey)) {
    return res.status(400).json({ error: 'Invalid page key' });
  }
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE client_sections SET
      pageKey = @pageKey,
      type = @type,
      sortOrder = @sortOrder,
      data = @data,
      updatedAt = @updatedAt
    WHERE id = @id`
  ,{
    id,
    pageKey: typeof updates.pageKey === 'string' ? updates.pageKey : existing.pageKey,
    type: updates.type || existing.type,
    sortOrder: typeof updates.sortOrder === 'number' ? updates.sortOrder : existing.sortOrder,
    data: JSON.stringify(updates.data ?? parseJsonValue(existing.data)),
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM client_sections WHERE id = ?', [id]);
  emitContentUpdate('client-sections');
  return res.json({ ...row, data: parseJsonValue(row.data) });
});

router.delete('/client-sections/:id', async (req, res) => {
  const { id } = req.params;
  const result = await db.exec('DELETE FROM client_sections WHERE id = ?', [id]);
  if ((result.rowCount ?? 0) === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  emitContentUpdate('client-sections');
  return res.json({ deleted: id });
});

const normalizeFilterPayload = (value: unknown) => {
  const payload = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const topics = Array.isArray(payload.topics)
    ? payload.topics.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
  const location = typeof payload.location === 'string' ? payload.location.trim() : '';
  const continents = Array.isArray(payload.continents)
    ? payload.continents.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
  const sources = Array.isArray(payload.sources)
    ? payload.sources.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
  return { topics, tags, location, continents, sources };
};

const parseScheduledAt = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const fetchCampaignSummary = async (campaignId: string) => {
  const row = await db.one<DbRow>(
    `SELECT
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queuedCount,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processingCount,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sentCount,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedCount,
      COUNT(*) as totalCount
     FROM email_jobs
     WHERE campaignId = ?`,
    [campaignId]
  );
  return {
    queuedCount: Number(row?.queuedCount || 0),
    processingCount: Number(row?.processingCount || 0),
    sentCount: Number(row?.sentCount || 0),
    failedCount: Number(row?.failedCount || 0),
    totalCount: Number(row?.totalCount || 0)
  };
};

router.post('/campaigns', async (req, res) => {
  const { name, templateId, filterJson } = req.body as Record<string, unknown>;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Campaign name is required' });
  }
  if (!templateId || typeof templateId !== 'string') {
    return res.status(400).json({ error: 'Template is required' });
  }
  const template = await db.one<DbRow>('SELECT subjectDefault FROM email_templates WHERE id = ?', [templateId]);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const normalizedFilter = normalizeFilterPayload(filterJson);
  await db.exec(
    `INSERT INTO email_campaigns (
      id, name, templateId, subject, htmlOverride, abEnabled, subjectA, subjectB, templateIdA, templateIdB, splitRatio,
      status, filterJson, scheduledAt, createdAt, updatedAt
    ) VALUES (
      @id, @name, @templateId, @subject, @htmlOverride, @abEnabled, @subjectA, @subjectB, @templateIdA, @templateIdB, @splitRatio,
      @status, @filterJson, @scheduledAt, @createdAt, @updatedAt
    )`
  ,{
    id,
    name: name.trim(),
    templateId,
    subject: typeof template.subjectDefault === 'string' ? template.subjectDefault : null,
    htmlOverride: null,
    abEnabled: 0,
    subjectA: typeof template.subjectDefault === 'string' ? template.subjectDefault : null,
    subjectB: typeof template.subjectDefault === 'string' ? template.subjectDefault : null,
    templateIdA: templateId,
    templateIdB: null,
    splitRatio: 50,
    status: 'draft',
    filterJson: JSON.stringify(normalizedFilter),
    scheduledAt: null,
    createdAt: now,
    updatedAt: now
  });
  if (Array.isArray(normalizedFilter.sources) && normalizedFilter.sources.length) {
    await logAdminActivity('sources.campaign.create', {
      sources: normalizedFilter.sources,
      campaignId: id,
      name: name.trim()
    });
  }
  const row = await db.one<DbRow>('SELECT * FROM email_campaigns WHERE id = ?', [id]);
  emitContentUpdate('campaign');
  return res.status(201).json({ ...row, ...(await fetchCampaignSummary(id)) });
});

router.get('/campaigns', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  // Reconcile stale "sending" campaigns before filtering.
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE email_campaigns
     SET status = CASE
       WHEN (
         SELECT COUNT(*) FROM email_jobs
         WHERE email_jobs.campaignId = email_campaigns.id AND status = 'failed'
       ) > 0 THEN 'failed'
       ELSE 'sent'
     END,
     updatedAt = @updatedAt
     WHERE status = 'sending'
       AND (
         SELECT COUNT(*) FROM email_jobs
         WHERE email_jobs.campaignId = email_campaigns.id
           AND status IN ('queued','processing')
       ) = 0
       AND (
         SELECT COUNT(*) FROM email_jobs
         WHERE email_jobs.campaignId = email_campaigns.id
       ) > 0`,
    { updatedAt: now }
  );
  const whereSql = status ? 'WHERE c.status = @status' : '';
  const rows = await db.many<DbRow>(
    `SELECT c.*,
      SUM(CASE WHEN l.status = 'sent' THEN 1 ELSE 0 END) as sentCount,
      SUM(CASE WHEN l.status = 'failed' THEN 1 ELSE 0 END) as failedCount,
      SUM(CASE WHEN l.status = 'queued' THEN 1 ELSE 0 END) as queuedCount,
      SUM(CASE WHEN l.status = 'processing' THEN 1 ELSE 0 END) as processingCount,
      COUNT(l.id) as totalCount
     FROM email_campaigns c
     LEFT JOIN email_jobs l ON l.campaignId = c.id
     ${whereSql}
     GROUP BY c.id
     ORDER BY c.createdAt DESC`,
    status ? { status } : undefined
  );
  const audienceCounts = await Promise.all(
    rows.map((row) => getCampaignAudience(row.filterJson).then((audience) => audience.length))
  );
  rows.forEach((row, idx) => {
    row.confirmedAudienceCount = audienceCounts[idx];
  });
  // Reconcile stale "sending" campaigns that have finished all jobs.
  const reconcileTargets = rows.filter((row) => row.status === 'sending' && Number(row.totalCount || 0) > 0);
  if (reconcileTargets.length) {
    const now = new Date().toISOString();
    for (const row of reconcileTargets) {
      const queued = Number(row.queuedCount || 0);
      const processing = Number(row.processingCount || 0);
      if (queued === 0 && processing === 0) {
        const failed = Number(row.failedCount || 0);
        const nextStatus = failed > 0 ? 'failed' : 'sent';
        await db.exec('UPDATE email_campaigns SET status = @status, updatedAt = @updatedAt WHERE id = @id', {
          id: row.id,
          status: nextStatus,
          updatedAt: now
        });
        row.status = nextStatus;
      }
    }
  }
  return res.json(rows);
});

router.get('/campaigns/:id', async (req, res) => {
  const { id } = req.params;
  const row = await db.one<DbRow>('SELECT * FROM email_campaigns WHERE id = ?', [id]);
  if (!row) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.json({ ...row, ...(await fetchCampaignSummary(id)) });
});

router.delete('/campaigns/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT id, status FROM email_campaigns WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  if (!['draft', 'sent', 'failed', 'sending'].includes(existing.status)) {
    return res.status(400).json({ error: 'Only draft, sent, sending, or failed campaigns can be deleted.' });
  }
  const result = await db.exec('DELETE FROM email_campaigns WHERE id = ?', [id]);
  if ((result.rowCount ?? 0) === 0) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  await db.exec("DELETE FROM schedule_items WHERE relatedType = 'campaign' AND relatedId = ?", [id]);
  emitContentUpdate('campaign');
  emitContentUpdate('job');
  return res.json({ deleted: id });
});

router.get('/campaigns/:id/analytics', async (req, res) => {
  const { id } = req.params;
  const campaign = await db.one<DbRow>('SELECT id, splitRatio FROM email_campaigns WHERE id = ?', [id]);
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  const rows = await db.many<DbRow>(
    `SELECT
      COALESCE(l.variant, 'A') as variant,
      SUM(CASE WHEN l.status IN ('sent','sent_dry_run') THEN 1 ELSE 0 END) as sentCount,
      COUNT(DISTINCT CASE WHEN e.eventType = 'open' THEN e.subscriberId END) as uniqueOpens,
      SUM(CASE WHEN e.eventType = 'open' THEN 1 ELSE 0 END) as totalOpens,
      COUNT(DISTINCT CASE WHEN e.eventType = 'click' THEN e.subscriberId END) as uniqueClickers,
      SUM(CASE WHEN e.eventType = 'click' THEN 1 ELSE 0 END) as totalClicks
     FROM email_send_logs l
     LEFT JOIN email_events e
       ON e.campaignId = l.campaignId
      AND e.subscriberId = l.subscriberId
     WHERE l.campaignId = @campaignId
     GROUP BY COALESCE(l.variant, 'A')`,
    { campaignId: id }
  );

  const buildStats = (variant: string) => {
    const row = rows.find((item) => item.variant === variant);
    const sentCount = Number(row?.sentCount || 0);
    const totalClicks = Number(row?.totalClicks || 0);
    const clickRate = sentCount > 0 ? Math.round((totalClicks / sentCount) * 1000) / 10 : 0;
    return {
      sent: sentCount,
      uniqueOpens: Number(row?.uniqueOpens || 0),
      totalOpens: Number(row?.totalOpens || 0),
      uniqueClickers: Number(row?.uniqueClickers || 0),
      totalClicks,
      clickRate
    };
  };

  const statsA = buildStats('A');
  const statsB = buildStats('B');
  let winner: { variant: 'A' | 'B'; clickRate: number } | null = null;
  if (statsA.clickRate > statsB.clickRate) {
    winner = { variant: 'A', clickRate: statsA.clickRate };
  } else if (statsB.clickRate > statsA.clickRate) {
    winner = { variant: 'B', clickRate: statsB.clickRate };
  }

  const recentErrors = await db.many<DbRow>(
    `SELECT id, subscriberId, lastError, updatedAt
     FROM email_jobs
     WHERE campaignId = @campaignId AND status = 'failed' AND lastError IS NOT NULL
     ORDER BY updatedAt DESC
     LIMIT 5`,
    { campaignId: id }
  );

  return res.json({
    splitRatio: Number(campaign.splitRatio || 50),
    variants: {
      A: statsA,
      B: statsB
    },
    winner,
    recentErrors: recentErrors.map((row) => ({
      jobId: row.id,
      subscriberId: row.subscriberId,
      message: row.lastError,
      createdAt: row.updatedAt
    }))
  });
});

router.put('/campaigns/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT * FROM email_campaigns WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }
  const updates = req.body as Record<string, unknown>;
  const now = new Date().toISOString();
  const filterPayload = 'filterJson' in updates ? normalizeFilterPayload(updates.filterJson) : null;
  const scheduledAt = 'scheduledAt' in updates ? parseScheduledAt(updates.scheduledAt) : null;
  const splitRatio =
    'splitRatio' in updates && typeof updates.splitRatio === 'number'
      ? Math.min(100, Math.max(0, Math.round(updates.splitRatio)))
      : existing.splitRatio;
  const htmlOverride =
    typeof updates.htmlOverride === 'string'
      ? ensureUnsubscribeFooter(updates.htmlOverride)
      : existing.htmlOverride;
  const nextStatus = existing.status === 'sent' ? existing.status : 'draft';
  await db.exec(
    `UPDATE email_campaigns SET
      name = @name,
      subject = @subject,
      htmlOverride = @htmlOverride,
      abEnabled = @abEnabled,
      subjectA = @subjectA,
      subjectB = @subjectB,
      templateIdA = @templateIdA,
      templateIdB = @templateIdB,
      splitRatio = @splitRatio,
      filterJson = @filterJson,
      scheduledAt = @scheduledAt,
      status = @status,
      updatedAt = @updatedAt
    WHERE id = @id`
  ,{
    id,
    name: typeof updates.name === 'string' ? updates.name.trim() || existing.name : existing.name,
    subject: typeof updates.subjectA === 'string'
      ? updates.subjectA.trim() || null
      : (typeof updates.subject === 'string' ? updates.subject.trim() || null : existing.subject),
    htmlOverride,
    abEnabled:
      typeof updates.abEnabled === 'boolean'
        ? Number(updates.abEnabled)
        : (updates.abEnabled === 1 || updates.abEnabled === '1' ? 1 : existing.abEnabled),
    subjectA: typeof updates.subjectA === 'string' ? updates.subjectA.trim() || null : existing.subjectA,
    subjectB: typeof updates.subjectB === 'string' ? updates.subjectB.trim() || null : existing.subjectB,
    templateIdA: typeof updates.templateIdA === 'string' ? updates.templateIdA.trim() || null : existing.templateIdA,
    templateIdB: typeof updates.templateIdB === 'string' ? updates.templateIdB.trim() || null : existing.templateIdB,
    splitRatio,
    filterJson: filterPayload ? JSON.stringify(filterPayload) : existing.filterJson,
    scheduledAt: scheduledAt ?? existing.scheduledAt,
    status: nextStatus,
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM email_campaigns WHERE id = ?', [id]);
  await syncCampaignSchedule(id);
  emitContentUpdate('campaign');
  return res.json({ ...row, ...(await fetchCampaignSummary(id)) });
});

router.post('/campaigns/:id/audience-preview', async (req, res) => {
  const { id } = req.params;
  const row = await db.one<DbRow>('SELECT filterJson FROM email_campaigns WHERE id = ?', [id]);
  if (!row) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  const filterPayload = 'filterJson' in (req.body as Record<string, unknown>)
    ? normalizeFilterPayload((req.body as Record<string, unknown>).filterJson)
    : null;
  const filterJson = filterPayload ? JSON.stringify(filterPayload) : row.filterJson;
  const count = (await getCampaignAudience(filterJson)).length;
  return res.json({ count });
});

router.post('/campaigns/:id/audience-continents', async (req, res) => {
  const { id } = req.params;
  const row = await db.one<DbRow>('SELECT filterJson FROM email_campaigns WHERE id = ?', [id]);
  if (!row) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  const filterPayload = 'filterJson' in (req.body as Record<string, unknown>)
    ? normalizeFilterPayload((req.body as Record<string, unknown>).filterJson)
    : null;
  const baseFilter = filterPayload ? { ...filterPayload, continents: [] } : null;
  const filterJson = baseFilter ? JSON.stringify(baseFilter) : row.filterJson;
  const audience = await getCampaignAudience(filterJson);
  const counts = audience.reduce<Record<string, number>>((acc, lead) => {
    const key = typeof lead.continent === 'string' ? lead.continent.trim() : '';
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return res.json({ total: audience.length, counts });
});

router.post('/campaigns/:id/send-now', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT id FROM email_campaigns WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  const warnings: Array<{ code: string; message: string }> = [];
  if (process.env.NODE_ENV === 'production' && !PUBLIC_URL.startsWith('https://')) {
    warnings.push({
      code: 'public_url_not_https',
      message: 'PUBLIC_URL is not HTTPS. Tracking and unsubscribe links should use HTTPS in production.'
    });
  }
  try {
    await enforceCampaignLimits();
  } catch (error) {
    return res.status(429).json({ error: error instanceof Error ? error.message : 'Campaign limit reached.' });
  }
  try {
    const now = new Date().toISOString();
    const queued = await enqueueCampaignJobs(id, now);
    if (queued > 0) {
      await updateCampaignStatus(id, 'sending');
      emitContentUpdate('job');
      emitContentUpdate('campaign');
    } else {
      warnings.push({
        code: 'no_confirmed_recipients',
        message: 'No confirmed subscribers matched this audience.'
      });
    }
    return res.json({ ok: true, queued, warnings });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Send failed' });
  }
});

router.post('/campaigns/:id/send-sandbox', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT id FROM email_campaigns WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  if (!TEST_SEND_ALLOWLIST.length) {
    return res.status(400).json({ error: 'TEST_SEND_ALLOWLIST is empty.' });
  }
  try {
    const now = new Date().toISOString();
    const queued = await enqueueSandboxJobs(id, now);
    return res.json({ ok: true, queued, allowlistCount: TEST_SEND_ALLOWLIST.length });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Sandbox send failed' });
  }
});

router.post('/campaigns/:id/schedule', async (req, res) => {
  const { id } = req.params;
  const { scheduledAt } = req.body as Record<string, unknown>;
  const parsed = parseScheduledAt(scheduledAt);
  if (!parsed) {
    return res.status(400).json({ error: 'scheduledAt is required' });
  }
  const existing = await db.one<DbRow>('SELECT id FROM email_campaigns WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  const warnings: Array<{ code: string; message: string }> = [];
  if (process.env.NODE_ENV === 'production' && !PUBLIC_URL.startsWith('https://')) {
    warnings.push({
      code: 'public_url_not_https',
      message: 'PUBLIC_URL is not HTTPS. Tracking and unsubscribe links should use HTTPS in production.'
    });
  }
  try {
    await enforceCampaignLimits();
  } catch (error) {
    return res.status(429).json({ error: error instanceof Error ? error.message : 'Campaign limit reached.' });
  }
  const now = new Date().toISOString();
  await db.exec(
    'UPDATE email_campaigns SET status = @status, scheduledAt = @scheduledAt, updatedAt = @updatedAt WHERE id = @id',
    {
    id,
    status: 'scheduled',
    scheduledAt: parsed,
    updatedAt: now
    }
  );
  const queued = await enqueueCampaignJobs(id, parsed);
  if (queued === 0) {
    warnings.push({
      code: 'no_confirmed_recipients',
      message: 'No confirmed subscribers matched this audience.'
    });
  }
  const row = await db.one<DbRow>('SELECT * FROM email_campaigns WHERE id = ?', [id]);
  await syncCampaignSchedule(id);
  emitContentUpdate('campaign');
  return res.json({ ...row, ...(await fetchCampaignSummary(id)), warnings });
});

router.get('/deliverability/status', async (_req, res) => {
  const status = await resolveDeliverabilityStatus();
  return res.json(status);
});

router.get('/deliverability/trends', async (req, res) => {
  const windowDays = Math.max(7, Math.min(90, Number(req.query.window || 30)));
  const dayLabels = buildDayLabels(windowDays);
  const startDate = new Date(`${dayLabels[0]}T00:00:00.000Z`).toISOString();

  const jobRows = await db.many<DbRow>(
    `SELECT status, skipReason, createdAt, updatedAt
     FROM email_jobs
     WHERE createdAt >= @start`,
    { start: startDate }
  );

  const failureRows = await db.many<DbRow>(
    `SELECT updatedAt
     FROM email_jobs
     WHERE status = 'failed' AND updatedAt >= @start`,
    { start: startDate }
  );

  const countsByDay = (rows: DbRow[], dateKey: 'createdAt' | 'updatedAt') => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      const value = typeof row[dateKey] === 'string' ? row[dateKey].slice(0, 10) : '';
      if (!value) return;
      map.set(value, (map.get(value) || 0) + 1);
    });
    return dayLabels.map((label) => map.get(label) || 0);
  };

  const queuedRows = jobRows.filter((row) => row.status === 'queued');
  const sentRows = jobRows.filter((row) => row.status === 'sent');
  const skippedRows = jobRows.filter((row) => row.status === 'skipped');

  const sentCounts = countsByDay(sentRows, 'updatedAt');
  const failedCounts = countsByDay(failureRows, 'updatedAt');
  const skippedCounts = countsByDay(skippedRows, 'updatedAt');
  const queuedCounts = countsByDay(queuedRows, 'createdAt');

  const summary = {
    sent: sentCounts.reduce((acc, v) => acc + v, 0),
    failed: failedCounts.reduce((acc, v) => acc + v, 0),
    skipped: skippedCounts.reduce((acc, v) => acc + v, 0),
    queued: queuedCounts.reduce((acc, v) => acc + v, 0)
  };
  const delivered = Math.max(summary.sent + summary.failed + summary.skipped, 0);
  const deliveryRate = delivered > 0 ? Math.round((summary.sent / delivered) * 1000) / 10 : 0;
  const failureRate = delivered > 0 ? Math.round((summary.failed / delivered) * 1000) / 10 : 0;
  const skipRate = delivered > 0 ? Math.round((summary.skipped / delivered) * 1000) / 10 : 0;

  return res.json({
    windowDays,
    labels: dayLabels,
    series: {
      sent: sentCounts,
      failed: failedCounts,
      skipped: skippedCounts,
      queued: queuedCounts
    },
    summary: {
      totals: summary,
      deliveryRate,
      failureRate,
      skipRate
    }
  });
});

router.get('/deliverability/errors', async (_req, res) => {
  const rows = await db.many<DbRow>(
    `SELECT id, campaignId, subscriberId, lastError, updatedAt
     FROM email_jobs
     WHERE status = 'failed' AND lastError IS NOT NULL
     ORDER BY updatedAt DESC
     LIMIT 15`
  );
  return res.json(rows.map((row) => ({
    id: String(row.id),
    campaignId: row.campaignId ? String(row.campaignId) : null,
    subscriberId: row.subscriberId ? String(row.subscriberId) : null,
    message: row.lastError ? String(row.lastError) : '',
    createdAt: row.updatedAt ? String(row.updatedAt) : ''
  })));
});

router.get('/deliverability/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const buildPayload = async () => {
    const settings = await db.one<DbRow>(
      'SELECT smtpHost, smtpPort, smtpUser, smtpPass FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
    );
    const smtpConfigured = Boolean(settings?.smtpHost && settings?.smtpPort && settings?.smtpUser && settings?.smtpPass);
    const status = await resolveDeliverabilityStatus();
    return {
      status,
      config: {
        smtpConfigured,
        publicUrl: PUBLIC_URL,
        publicUrlIsHttps: PUBLIC_URL.startsWith('https://')
      }
    };
  };

  const writePayload = async () => {
    try {
      const payload = await buildPayload();
      res.write(`event: deliverability\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      // Ignore DNS errors and keep stream alive.
    }
  };

  void writePayload();

  const interval = setInterval(() => {
    void writePayload();
  }, 15000);

  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

router.get('/deliverability/checklist', async (_req, res) => {
  const settings = await db.one<DbRow>(
    'SELECT smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  const smtpConfigured = Boolean(settings?.smtpHost && settings?.smtpPort && settings?.smtpUser && settings?.smtpPass);
  const status = await resolveDeliverabilityStatus();
  const smtpHost = typeof settings?.smtpHost === 'string' ? settings.smtpHost.toLowerCase() : '';
  const smtpProvider = smtpHost.includes('sendgrid')
    ? 'SendGrid'
    : smtpHost.includes('mailgun')
      ? 'Mailgun'
      : smtpHost.includes('ses')
        ? 'AWS SES'
        : smtpHost.includes('postmark')
          ? 'Postmark'
          : smtpHost.includes('sparkpost')
            ? 'SparkPost'
            : smtpHost
              ? 'Custom SMTP'
              : 'Unknown';
  const recordTemplates = smtpProvider === 'SendGrid'
    ? {
        spf: 'v=spf1 include:sendgrid.net ~all',
        dkim: 's1._domainkey.yourdomain.com TXT "k=rsa; p=YOUR_PUBLIC_KEY"',
        dmarc: '_dmarc.yourdomain.com TXT "v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com"'
      }
    : smtpProvider === 'Mailgun'
      ? {
          spf: 'v=spf1 include:mailgun.org ~all',
          dkim: 'k1._domainkey.yourdomain.com TXT "k=rsa; p=YOUR_PUBLIC_KEY"',
          dmarc: '_dmarc.yourdomain.com TXT "v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com"'
        }
      : smtpProvider === 'AWS SES'
        ? {
            spf: 'v=spf1 include:amazonses.com ~all',
            dkim: 'selector._domainkey.yourdomain.com CNAME selector.dkim.amazonses.com',
            dmarc: '_dmarc.yourdomain.com TXT "v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com"'
          }
        : smtpProvider === 'Postmark'
          ? {
              spf: 'v=spf1 include:spf.mtasv.net ~all',
              dkim: 'pm._domainkey.yourdomain.com TXT "k=rsa; p=YOUR_PUBLIC_KEY"',
              dmarc: '_dmarc.yourdomain.com TXT "v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com"'
            }
          : smtpProvider === 'SparkPost'
            ? {
                spf: 'v=spf1 include:sparkpostmail.com ~all',
                dkim: 'sparkpost._domainkey.yourdomain.com TXT "k=rsa; p=YOUR_PUBLIC_KEY"',
                dmarc: '_dmarc.yourdomain.com TXT "v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com"'
              }
            : {
                spf: 'v=spf1 include:your-smtp.com ~all',
                dkim: 'selector._domainkey.yourdomain.com TXT "k=rsa; p=YOUR_PUBLIC_KEY"',
                dmarc: '_dmarc.yourdomain.com TXT "v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com"'
              };
  const acknowledgements = await db.many<DbRow>(
    'SELECT itemId, acknowledgedAt, acknowledgedBy FROM deliverability_checklist'
  );
  const ackMap = acknowledgements.reduce<Record<string, { acknowledgedAt: string; acknowledgedBy: string | null }>>(
    (acc, row) => {
      if (row.itemId) {
        acc[String(row.itemId)] = {
          acknowledgedAt: String(row.acknowledgedAt || ''),
          acknowledgedBy: row.acknowledgedBy ? String(row.acknowledgedBy) : null
        };
      }
      return acc;
    },
    {}
  );
  return res.json({
    dns: {
      spfConfigured: status.spfConfigured,
      dkimConfigured: status.dkimConfigured,
      dmarcConfigured: status.dmarcConfigured
    },
    config: {
      smtpConfigured,
      publicUrl: PUBLIC_URL,
      publicUrlIsHttps: PUBLIC_URL.startsWith('https://'),
      sendRatePerMinute: SEND_RATE_PER_MINUTE,
      sendRatePerHour: SEND_RATE_PER_HOUR
    },
    provider: {
      name: smtpProvider,
      host: smtpHost
    },
    recordTemplates,
    recommendations: [
      { id: 'spf', label: 'Publish SPF DNS record', ok: SPF_CONFIGURED },
      { id: 'dkim', label: 'Publish DKIM DNS record', ok: DKIM_CONFIGURED },
      { id: 'dmarc', label: 'Publish DMARC policy', ok: DMARC_CONFIGURED },
      { id: 'smtp', label: 'Verify SMTP credentials', ok: smtpConfigured },
      { id: 'https', label: 'Use HTTPS for PUBLIC_URL', ok: PUBLIC_URL.startsWith('https://') }
    ],
    acknowledgements: ackMap
  });
});

router.post('/deliverability/checklist/ack', async (req, res) => {
  const { itemId } = req.body as Record<string, unknown>;
  if (!itemId || typeof itemId !== 'string') {
    return res.status(400).json({ error: 'itemId is required' });
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const actor = await resolveAdminActor(req);
  await db.exec(
    `INSERT INTO deliverability_checklist (id, itemId, acknowledgedAt, acknowledgedBy)
     VALUES (@id, @itemId, @acknowledgedAt, @acknowledgedBy)
     ON CONFLICT(itemId) DO UPDATE SET acknowledgedAt = @acknowledgedAt, acknowledgedBy = @acknowledgedBy`
  ,{
    id,
    itemId,
    acknowledgedAt: now,
    acknowledgedBy: actor
  });
  await logAdminActivity('deliverability.checklist.ack', { itemId }, actor);
  return res.json({ itemId, acknowledgedAt: now, acknowledgedBy: actor });
});

router.get('/deliverability/suppressed', async (req, res) => {
  const filter = buildSuppressedFilter(req.query);
  const totalRow = await db.one<DbRow>(`SELECT COUNT(*) as count FROM leads ${filter.whereClause}`, filter.params);
  const rows = await db.many<DbRow>(
    `SELECT id, name, email, phone, country, source, createdAt, isUnsubscribed, emailInvalid
     FROM leads
     ${filter.whereClause}
     ORDER BY createdAt DESC
     LIMIT @limit OFFSET @offset`,
    filter.params
  );
  const total = Number(totalRow?.count || 0);
  return res.json({
    page: filter.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / filter.limit)),
    items: rows.map((row) => ({
      id: String(row.id),
      name: row.name ? String(row.name) : null,
      email: String(row.email || ''),
      phone: row.phone ? String(row.phone) : null,
      country: row.country ? String(row.country) : null,
      source: row.source ? String(row.source) : null,
      createdAt: String(row.createdAt || ''),
      reason: row.isUnsubscribed ? 'unsubscribed' : 'email_invalid'
    }))
  });
});

router.get('/deliverability/suppressed/export', async (req, res) => {
  const filter = buildSuppressedFilter(req.query);
  const exportLimit = Math.max(1, Math.min(10000, Number(req.query.limit || 5000)));
  const rows = await db.many<DbRow>(
    `SELECT name, email, phone, country, source, createdAt, isUnsubscribed, emailInvalid
     FROM leads
     ${filter.whereClause}
     ORDER BY createdAt DESC
     LIMIT @limit`,
    { ...filter.params, limit: exportLimit }
  );
  const header = [
    'name',
    'email',
    'phone',
    'country',
    'source',
    'createdAt',
    'reason'
  ];
  const lines = [header.join(',')];
  rows.forEach((row) => {
    const reason = row.isUnsubscribed ? 'unsubscribed' : 'email_invalid';
    lines.push([
      csvEscape(row.name || ''),
      csvEscape(row.email || ''),
      csvEscape(row.phone || ''),
      csvEscape(row.country || ''),
      csvEscape(row.source || ''),
      csvEscape(row.createdAt || ''),
      csvEscape(reason)
    ].join(','));
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="suppressed-emails.csv"');
  return res.send(`${lines.join('\n')}\n`);
});

router.post('/deliverability/suppressed/:id/reinstate', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>(
    'SELECT id, email, isUnsubscribed, source FROM leads WHERE id = ?',
    [id]
  );
  if (!existing) {
    return res.status(404).json({ error: 'Lead not found' });
  }
  if (!existing.isUnsubscribed) {
    return res.status(400).json({ error: 'Lead is not unsubscribed' });
  }
  await db.exec(
    `UPDATE leads
     SET isUnsubscribed = 0,
         unsubscribedAt = NULL
     WHERE id = ?`
  , [id]);
  await logAdminActivity('deliverability.suppressed.reinstate', { id, email: existing.email });
  return res.json({ id, status: 'reinstated' });
});

router.post('/deliverability/suppressed/:id/clear-invalid', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT id, email, emailInvalid FROM leads WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Lead not found' });
  }
  if (!existing.emailInvalid) {
    return res.status(400).json({ error: 'Lead is not marked invalid' });
  }
  await db.exec(
    `UPDATE leads
     SET emailInvalid = 0,
         emailFailureCount = 0
     WHERE id = ?`
  , [id]);
  await logAdminActivity('deliverability.suppressed.clear_invalid', { id, email: existing.email });
  return res.json({ id, status: 'cleared' });
});

router.get('/campaigns/:id/progress', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT id FROM email_campaigns WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  return res.json(await getCampaignProgress(id));
});

router.get('/calendar', async (req, res) => {
  const start = typeof req.query.start === 'string' ? req.query.start.trim() : '';
  const end = typeof req.query.end === 'string' ? req.query.end.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : '';
  const channel = typeof req.query.channel === 'string' ? req.query.channel.trim().toLowerCase() : '';
  const type = typeof req.query.type === 'string' ? req.query.type.trim().toLowerCase() : '';
  const whereParts: string[] = [];
  const params: Record<string, unknown> = {};
  if (start) {
    whereParts.push('scheduledAt >= @start');
    params.start = start;
  }
  if (end) {
    whereParts.push('scheduledAt <= @end');
    params.end = end;
  }
  if (status) {
    whereParts.push('status = @status');
    params.status = status;
  }
  if (channel) {
    whereParts.push('channel = @channel');
    params.channel = channel;
  }
  if (type) {
    whereParts.push('type = @type');
    params.type = type;
  }
  const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  const rows = await db.many<DbRow>(
    `SELECT *
     FROM schedule_items
     ${whereClause}
     ORDER BY scheduledAt ASC`,
    params
  );
  return res.json(
    rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      type: String(row.type),
      channel: String(row.channel),
      status: String(row.status),
      scheduledAt: String(row.scheduledAt),
      durationMins: Number(row.durationMins || 60),
      ownerId: row.ownerId ? String(row.ownerId) : null,
      notes: row.notes ? String(row.notes) : null,
      relatedType: row.relatedType ? String(row.relatedType) : null,
      relatedId: row.relatedId ? String(row.relatedId) : null,
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt)
    }))
  );
});

router.post('/calendar', async (req, res) => {
  const payload = req.body as Record<string, unknown>;
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const scheduledAt = typeof payload.scheduledAt === 'string' ? payload.scheduledAt.trim() : '';
  if (!title) {
    return res.status(400).json({ error: 'Title is required.' });
  }
  if (!scheduledAt) {
    return res.status(400).json({ error: 'scheduledAt is required.' });
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const durationMins = Number(payload.durationMins || 60);
  const notes = typeof payload.notes === 'string' ? payload.notes.trim() : null;
  const relatedType = typeof payload.relatedType === 'string' ? payload.relatedType.trim() : null;
  const relatedId = typeof payload.relatedId === 'string' ? payload.relatedId.trim() : null;
  await db.exec(
    `INSERT INTO schedule_items (
      id, title, type, channel, status, scheduledAt, durationMins,
      ownerId, notes, relatedType, relatedId, createdAt, updatedAt
    ) VALUES (
      @id, @title, @type, @channel, @status, @scheduledAt, @durationMins,
      @ownerId, @notes, @relatedType, @relatedId, @createdAt, @updatedAt
    )`
  ,{
    id,
    title,
    type: normalizeScheduleType(payload.type),
    channel: normalizeScheduleChannel(payload.channel),
    status: normalizeScheduleStatus(payload.status || 'scheduled'),
    scheduledAt,
    durationMins: Number.isFinite(durationMins) && durationMins > 0 ? durationMins : 60,
    ownerId: typeof payload.ownerId === 'string' ? payload.ownerId : null,
    notes,
    relatedType,
    relatedId,
    createdAt: now,
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM schedule_items WHERE id = ?', [id]);
  return res.status(201).json(row);
});

router.put('/calendar/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT * FROM schedule_items WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Schedule not found.' });
  }
  const payload = req.body as Record<string, unknown>;
  const title = typeof payload.title === 'string' ? payload.title.trim() : existing.title;
  const scheduledAt = typeof payload.scheduledAt === 'string' ? payload.scheduledAt.trim() : existing.scheduledAt;
  const durationMins = Number(payload.durationMins ?? (existing.durationMins || 60));
  const notes = typeof payload.notes === 'string' ? payload.notes.trim() : existing.notes;
  const relatedType = typeof payload.relatedType === 'string' ? payload.relatedType.trim() : existing.relatedType;
  const relatedId = typeof payload.relatedId === 'string' ? payload.relatedId.trim() : existing.relatedId;
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE schedule_items SET
      title = @title,
      type = @type,
      channel = @channel,
      status = @status,
      scheduledAt = @scheduledAt,
      durationMins = @durationMins,
      ownerId = @ownerId,
      notes = @notes,
      relatedType = @relatedType,
      relatedId = @relatedId,
      updatedAt = @updatedAt
     WHERE id = @id`
  ,{
    id,
    title,
    type: normalizeScheduleType(payload.type ?? existing.type),
    channel: normalizeScheduleChannel(payload.channel ?? existing.channel),
    status: normalizeScheduleStatus(payload.status ?? existing.status),
    scheduledAt,
    durationMins: Number.isFinite(durationMins) && durationMins > 0 ? durationMins : 60,
    ownerId: typeof payload.ownerId === 'string' ? payload.ownerId : existing.ownerId,
    notes,
    relatedType,
    relatedId,
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM schedule_items WHERE id = ?', [id]);
  return res.json(row);
});

router.delete('/calendar/:id', async (req, res) => {
  const { id } = req.params;
  const result = await db.exec('DELETE FROM schedule_items WHERE id = ?', [id]);
  if ((result.rowCount ?? 0) === 0) {
    return res.status(404).json({ error: 'Schedule not found.' });
  }
  return res.json({ deleted: id });
});

const AUTOMATION_STATUSES = ['draft', 'active', 'paused'] as const;
const AUTOMATION_STEP_TYPES = ['email', 'delay'] as const;
const AUTOMATION_TRIGGERS = ['signup', 'tag', 'topic', 'date'] as const;

const normalizeAutomationStatus = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback;
  return AUTOMATION_STATUSES.includes(value as (typeof AUTOMATION_STATUSES)[number]) ? value : fallback;
};

const normalizeAutomationTrigger = (value: unknown) => {
  if (typeof value !== 'string') return 'signup';
  return AUTOMATION_TRIGGERS.includes(value as (typeof AUTOMATION_TRIGGERS)[number]) ? value : 'signup';
};

const normalizeAutomationStepType = (value: unknown) => {
  if (typeof value !== 'string') return 'email';
  return AUTOMATION_STEP_TYPES.includes(value as (typeof AUTOMATION_STEP_TYPES)[number]) ? value : 'email';
};

const mapAutomationStatusToScheduleStatus = (value: unknown) => {
  if (typeof value !== 'string') return 'draft';
  const status = value.trim().toLowerCase();
  if (status === 'active') return 'scheduled';
  if (status === 'paused') return 'cancelled';
  return 'draft';
};

const getAutomationTriggerDate = (triggerJson: unknown) => {
  if (!triggerJson || typeof triggerJson !== 'object') return null;
  const raw = triggerJson as Record<string, unknown>;
  if (typeof raw.date !== 'string') return null;
  const parsed = new Date(raw.date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const syncAutomationSchedule = async (automationId: string) => {
  const automation = await db.one<DbRow>(
    'SELECT id, name, status, triggerType, triggerJson FROM email_automations WHERE id = ?',
    [automationId]
  );
  if (!automation) return;
  if (automation.triggerType !== 'date') {
    await db.exec("DELETE FROM schedule_items WHERE relatedType = 'automation' AND relatedId = ?", [automationId]);
    return;
  }
  const triggerJson = parseJsonValue(automation.triggerJson);
  const scheduledAt = getAutomationTriggerDate(triggerJson);
  if (!scheduledAt) {
    await db.exec("DELETE FROM schedule_items WHERE relatedType = 'automation' AND relatedId = ?", [automationId]);
    return;
  }
  const title =
    typeof automation.name === 'string' && automation.name.trim() ? automation.name.trim() : 'Automation';
  const status = mapAutomationStatusToScheduleStatus(automation.status);
  const existing = await db.one<DbRow>(
    "SELECT id FROM schedule_items WHERE relatedType = 'automation' AND relatedId = ?",
    [automationId]
  );
  const now = new Date().toISOString();
  if (existing) {
    await db.exec(
      `UPDATE schedule_items SET
        title = @title,
        type = 'automation',
        channel = 'email',
        status = @status,
        scheduledAt = @scheduledAt,
        updatedAt = @updatedAt
       WHERE id = @id`
    ,{
      id: existing.id,
      title,
      status,
      scheduledAt,
      updatedAt: now
    });
    return;
  }
  await db.exec(
    `INSERT INTO schedule_items (
      id, title, type, channel, status, scheduledAt, durationMins,
      ownerId, notes, relatedType, relatedId, createdAt, updatedAt
    ) VALUES (
      @id, @title, @type, @channel, @status, @scheduledAt, @durationMins,
      @ownerId, @notes, @relatedType, @relatedId, @createdAt, @updatedAt
    )`
  ,{
    id: crypto.randomUUID(),
    title,
    type: 'automation',
    channel: 'email',
    status,
    scheduledAt,
    durationMins: 60,
    ownerId: null,
    notes: null,
    relatedType: 'automation',
    relatedId: automationId,
    createdAt: now,
    updatedAt: now
  });
};

router.get('/automations', async (_req, res) => {
  const rows = await db.many<DbRow>(
    `SELECT a.*,
      COUNT(s.id) as stepsCount
     FROM email_automations a
     LEFT JOIN email_automation_steps s ON s.automationId = a.id
     GROUP BY a.id
     ORDER BY a.updatedAt DESC`
  );
  const items = rows.map((row) => ({
    ...row,
    triggerJson: parseJsonValue(row.triggerJson),
    filterJson: parseJsonValue(row.filterJson)
  }));
  return res.json(items);
});

router.post('/automations', async (req, res) => {
  const { name, triggerType, triggerJson, filterJson } = req.body as Record<string, unknown>;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Automation name is required' });
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const status = 'draft';
  const trigger = normalizeAutomationTrigger(triggerType);
  const normalizedFilter = normalizeFilterPayload(filterJson);
  if (trigger === 'date') {
    const parsed = getAutomationTriggerDate(
      typeof triggerJson === 'object' && triggerJson !== null ? triggerJson : null
    );
    if (!parsed) {
      return res.status(400).json({ error: 'Trigger date is required for date-based automations.' });
    }
  }
  await db.exec(
    `INSERT INTO email_automations (
      id, name, status, triggerType, triggerJson, filterJson, createdAt, updatedAt
    ) VALUES (
      @id, @name, @status, @triggerType, @triggerJson, @filterJson, @createdAt, @updatedAt
    )`
  ,{
    id,
    name: name.trim(),
    status,
    triggerType: trigger,
    triggerJson: JSON.stringify(typeof triggerJson === 'object' && triggerJson !== null ? triggerJson : {}),
    filterJson: JSON.stringify(normalizedFilter),
    createdAt: now,
    updatedAt: now
  });
  if (Array.isArray(normalizedFilter.sources) && normalizedFilter.sources.length) {
    await logAdminActivity('sources.automation.create', {
      sources: normalizedFilter.sources,
      automationId: id,
      name: name.trim()
    });
  }
  const row = await db.one<DbRow>('SELECT * FROM email_automations WHERE id = ?', [id]);
  await syncAutomationSchedule(id);
  return res.status(201).json({
    ...row,
    triggerJson: parseJsonValue(row.triggerJson),
    filterJson: parseJsonValue(row.filterJson)
  });
});

router.get('/automations/:id', async (req, res) => {
  const { id } = req.params;
  const automation = await db.one<DbRow>('SELECT * FROM email_automations WHERE id = ?', [id]);
  if (!automation) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  const steps = await db.many<DbRow>(
    'SELECT * FROM email_automation_steps WHERE automationId = ? ORDER BY stepOrder ASC',
    [id]
  );
  return res.json({
    ...automation,
    triggerJson: parseJsonValue(automation.triggerJson),
    filterJson: parseJsonValue(automation.filterJson),
    steps
  });
});

router.put('/automations/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT * FROM email_automations WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  const updates = req.body as Record<string, unknown>;
  const status = normalizeAutomationStatus(updates.status, existing.status);
  const triggerType = normalizeAutomationTrigger(updates.triggerType ?? existing.triggerType);
  const normalizedFilter = 'filterJson' in updates ? normalizeFilterPayload(updates.filterJson) : parseJsonValue(existing.filterJson);
  const nextTriggerJson =
    typeof updates.triggerJson === 'object' && updates.triggerJson !== null
      ? updates.triggerJson
      : parseJsonValue(existing.triggerJson);
  if (triggerType === 'date') {
    const parsed = getAutomationTriggerDate(nextTriggerJson);
    if (!parsed) {
      return res.status(400).json({ error: 'Trigger date is required for date-based automations.' });
    }
  }
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE email_automations SET
      name = @name,
      status = @status,
      triggerType = @triggerType,
      triggerJson = @triggerJson,
      filterJson = @filterJson,
      updatedAt = @updatedAt
     WHERE id = @id`
  ,{
    id,
    name: typeof updates.name === 'string' ? updates.name.trim() || existing.name : existing.name,
    status,
    triggerType,
    triggerJson: JSON.stringify(nextTriggerJson),
    filterJson: JSON.stringify(normalizedFilter),
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM email_automations WHERE id = ?', [id]);
  await syncAutomationSchedule(id);
  return res.json({
    ...row,
    triggerJson: parseJsonValue(row.triggerJson),
    filterJson: parseJsonValue(row.filterJson)
  });
});

router.delete('/automations/:id', async (req, res) => {
  const { id } = req.params;
  const result = await db.exec('DELETE FROM email_automations WHERE id = ?', [id]);
  if ((result.rowCount ?? 0) === 0) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  await db.exec("DELETE FROM schedule_items WHERE relatedType = 'automation' AND relatedId = ?", [id]);
  return res.json({ deleted: id });
});

router.post('/automations/:id/activate', async (req, res) => {
  const { id } = req.params;
  const now = new Date().toISOString();
  const result = await db.exec(
    'UPDATE email_automations SET status = @status, updatedAt = @updatedAt WHERE id = @id'
  , { id, status: 'active', updatedAt: now });
  if ((result.rowCount ?? 0) === 0) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  const row = await db.one<DbRow>('SELECT * FROM email_automations WHERE id = ?', [id]);
  await syncAutomationSchedule(id);
  return res.json({
    ...row,
    triggerJson: parseJsonValue(row.triggerJson),
    filterJson: parseJsonValue(row.filterJson)
  });
});

router.post('/automations/:id/pause', async (req, res) => {
  const { id } = req.params;
  const now = new Date().toISOString();
  const result = await db.exec(
    'UPDATE email_automations SET status = @status, updatedAt = @updatedAt WHERE id = @id'
  , { id, status: 'paused', updatedAt: now });
  if ((result.rowCount ?? 0) === 0) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  const row = await db.one<DbRow>('SELECT * FROM email_automations WHERE id = ?', [id]);
  await syncAutomationSchedule(id);
  return res.json({
    ...row,
    triggerJson: parseJsonValue(row.triggerJson),
    filterJson: parseJsonValue(row.filterJson)
  });
});

router.post('/automations/:id/steps', async (req, res) => {
  const { id } = req.params;
  const automation = await db.one<DbRow>('SELECT id FROM email_automations WHERE id = ?', [id]);
  if (!automation) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  const { stepType, stepOrder, templateId, subjectOverride, htmlOverride, delayMinutes } =
    req.body as Record<string, unknown>;
  const type = normalizeAutomationStepType(stepType);
  if (type === 'email' && typeof templateId !== 'string' && typeof htmlOverride !== 'string') {
    return res.status(400).json({ error: 'Email step requires templateId or htmlOverride.' });
  }
  if (type === 'delay' && (typeof delayMinutes !== 'number' || delayMinutes <= 0)) {
    return res.status(400).json({ error: 'Delay step requires delayMinutes > 0.' });
  }
  const now = new Date().toISOString();
  const stepId = crypto.randomUUID();
  await db.exec(
    `INSERT INTO email_automation_steps (
      id, automationId, stepOrder, stepType, templateId, subjectOverride, htmlOverride, delayMinutes, createdAt, updatedAt
    ) VALUES (
      @id, @automationId, @stepOrder, @stepType, @templateId, @subjectOverride, @htmlOverride, @delayMinutes, @createdAt, @updatedAt
    )`
  ,{
    id: stepId,
    automationId: id,
    stepOrder: typeof stepOrder === 'number' ? stepOrder : 0,
    stepType: type,
    templateId: typeof templateId === 'string' ? templateId : null,
    subjectOverride: typeof subjectOverride === 'string' ? subjectOverride : null,
    htmlOverride: typeof htmlOverride === 'string' ? htmlOverride : null,
    delayMinutes: typeof delayMinutes === 'number' ? delayMinutes : null,
    createdAt: now,
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM email_automation_steps WHERE id = ?', [stepId]);
  return res.status(201).json(row);
});

router.put('/automation-steps/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT * FROM email_automation_steps WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Step not found' });
  }
  const updates = req.body as Record<string, unknown>;
  const type = normalizeAutomationStepType(updates.stepType ?? existing.stepType);
  const delayMinutes =
    typeof updates.delayMinutes === 'number' ? updates.delayMinutes : existing.delayMinutes;
  if (type === 'delay' && (!delayMinutes || delayMinutes <= 0)) {
    return res.status(400).json({ error: 'Delay step requires delayMinutes > 0.' });
  }
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE email_automation_steps SET
      stepOrder = @stepOrder,
      stepType = @stepType,
      templateId = @templateId,
      subjectOverride = @subjectOverride,
      htmlOverride = @htmlOverride,
      delayMinutes = @delayMinutes,
      updatedAt = @updatedAt
     WHERE id = @id`
  ,{
    id,
    stepOrder: typeof updates.stepOrder === 'number' ? updates.stepOrder : existing.stepOrder,
    stepType: type,
    templateId: typeof updates.templateId === 'string' ? updates.templateId : existing.templateId,
    subjectOverride:
      typeof updates.subjectOverride === 'string' ? updates.subjectOverride : existing.subjectOverride,
    htmlOverride:
      typeof updates.htmlOverride === 'string' ? updates.htmlOverride : existing.htmlOverride,
    delayMinutes,
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM email_automation_steps WHERE id = ?', [id]);
  return res.json(row);
});

router.delete('/automation-steps/:id', async (req, res) => {
  const { id } = req.params;
  const result = await db.exec('DELETE FROM email_automation_steps WHERE id = ?', [id]);
  if ((result.rowCount ?? 0) === 0) {
    return res.status(404).json({ error: 'Step not found' });
  }
  return res.json({ deleted: id });
});

router.get('/system-health', async (_req, res) => {
  // Expose deliverability and safety configuration for the Boss checklist page.
  const settings = await db.one<DbRow>(
    'SELECT smtpHost, smtpPort, smtpUser, smtpPass FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  const smtpConfigured = Boolean(settings?.smtpHost && settings?.smtpPort && settings?.smtpUser && settings?.smtpPass);
  let dbOk = false;
  let dbLatencyMs: number | null = null;
  try {
    const start = Date.now();
    await db.one<DbRow>('SELECT 1 as ok');
    dbOk = true;
    dbLatencyMs = Date.now() - start;
  } catch {
    dbOk = false;
  }

  const emailQueueRow = await db.one<DbRow>(
    `SELECT
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
     FROM email_jobs`
  );

  const exportQueueRow = await db.one<DbRow>(
    `SELECT
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
     FROM export_jobs`
  );

  const lastEmailJobAt = await resolveLastTimestamp('email_jobs', 'updatedAt');
  const lastEmailErrorAtRow = await db.one<DbRow>(
    "SELECT MAX(updatedAt) as lastAt FROM email_jobs WHERE status = 'failed'"
  );
  const lastEmailErrorAt = typeof lastEmailErrorAtRow?.lastAt === 'string' ? lastEmailErrorAtRow.lastAt : null;
  const lastExportJobAt = await resolveLastTimestamp('export_jobs', 'updatedAt');
  const lastExportErrorAtRow = await db.one<DbRow>(
    "SELECT MAX(updatedAt) as lastAt FROM export_jobs WHERE status = 'failed'"
  );
  const lastExportErrorAt = typeof lastExportErrorAtRow?.lastAt === 'string' ? lastExportErrorAtRow.lastAt : null;
  const smtpLastSuccessRow = await db.one<DbRow>(
    "SELECT MAX(sentAt) as lastAt FROM email_send_logs WHERE status IN ('sent','sent_dry_run')"
  );
  const smtpLastErrorRow = await db.one<DbRow>(
    "SELECT MAX(createdAt) as lastAt FROM email_send_logs WHERE status = 'failed'"
  );

  const smtpLogLines = (await readSmtpLogLines(50)).map(parseSmtpLogLine);
  const lastSmtpError = smtpLogLines.slice().reverse().find((line) => line.type === 'error') || null;
  const lastSmtpInfo = smtpLogLines.slice().reverse().find((line) => line.type === 'info') || null;

  const uploadSizeMb = getDirectorySizeMb(path.resolve(UPLOAD_DIR));
  const emailWorker = getEmailWorkerStatus();
  const exportWorker = getExportWorkerStatus();
  const automationScheduler = getAutomationSchedulerStatus();

  return res.json({
    publicUrl: PUBLIC_URL,
    publicUrlIsHttps: PUBLIC_URL.startsWith('https://'),
    sendRatePerMinute: SEND_RATE_PER_MINUTE,
    sendRatePerHour: SEND_RATE_PER_HOUR,
    dryRunMode: DRY_RUN_MODE,
    deliverabilityWarningsEnabled: DELIVERABILITY_WARNINGS_ENABLED,
    unsubscribeInjectionEnabled: true,
    testSendAllowlistCount: TEST_SEND_ALLOWLIST.length,
    smtpConfigured,
    system: {
      uptimeSec: Math.round(process.uptime()),
      nodeVersion: process.version,
      appVersion: getAppVersion(),
      pid: process.pid
    },
    database: {
      ok: dbOk,
      latencyMs: dbLatencyMs
    },
    workers: {
      email: emailWorker,
      export: exportWorker,
      automation: automationScheduler
    },
    queues: {
      emailJobs: {
        queued: Number(emailQueueRow?.queued || 0),
        processing: Number(emailQueueRow?.processing || 0),
        failed: Number(emailQueueRow?.failed || 0),
        skipped: Number(emailQueueRow?.skipped || 0)
      },
      exportJobs: {
        queued: Number(exportQueueRow?.queued || 0),
        processing: Number(exportQueueRow?.processing || 0),
        failed: Number(exportQueueRow?.failed || 0),
        completed: Number(exportQueueRow?.completed || 0)
      }
    },
    jobs: {
      lastEmailJobAt,
      lastEmailErrorAt,
      lastExportJobAt,
      lastExportErrorAt
    },
    smtp: {
      lastSuccessAt: typeof smtpLastSuccessRow?.lastAt === 'string' ? smtpLastSuccessRow.lastAt : null,
      lastErrorAt: typeof smtpLastErrorRow?.lastAt === 'string' ? smtpLastErrorRow.lastAt : null,
      lastInfo: lastSmtpInfo,
      lastError: lastSmtpError
    },
    storage: {
      uploadsPath: R2_PUBLIC_BASE_URL || UPLOAD_DIR,
      uploadsSizeMb: uploadSizeMb
    },
    streams: {
      contentListeners: contentEvents.listenerCount('content')
    }
  });
});

router.post('/subscribers/:id/unsubscribe', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT id, email, isUnsubscribed FROM leads WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Subscriber not found' });
  }
  if (existing.isUnsubscribed) {
    return res.json({ id, status: 'already_unsubscribed' });
  }
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE leads
     SET isUnsubscribed = 1,
         unsubscribedAt = @unsubscribedAt
     WHERE id = @id`
  ,{ id, unsubscribedAt: now });
  await db.exec(
    `INSERT INTO email_events (id, eventType, subscriberId, campaignId, automationId, createdAt)
     VALUES (@id, @eventType, @subscriberId, @campaignId, @automationId, @createdAt)`
  ,{
    id: crypto.randomUUID(),
    eventType: 'unsubscribe',
    subscriberId: id,
    campaignId: null,
    automationId: null,
    createdAt: now
  });
  await logAdminActivity('subscriber.unsubscribed', { id, email: existing.email });
  emitContentUpdate('unsubscribe', { source: existing.source || null });
  void refreshSegmentsSummaryCache();
  void broadcastSegmentsUpdate();
  void refreshSourcesSummaryCache();
  void broadcastSourcesUpdate();
  return res.json({ id, status: 'unsubscribed' });
});

router.post('/subscribers/:id/resend-confirmation', async (req, res) => {
  const { id } = req.params;
  const lead = await db.one<DbRow>(
    'SELECT id, email, unsubscribeToken, confirmedAt FROM leads WHERE id = ?',
    [id]
  );
  if (!lead) {
    return res.status(404).json({ error: 'Subscriber not found' });
  }
  if (lead.confirmedAt) {
    return res.status(400).json({ error: 'Subscriber already confirmed.' });
  }
  const token = lead.unsubscribeToken || crypto.randomBytes(24).toString('hex');
  if (!lead.unsubscribeToken) {
    await db.exec('UPDATE leads SET unsubscribeToken = @token WHERE id = @id', { id, token });
  }
  const config = await loadWelcomeEmailConfig();
  if (!config || !config.enabled) {
    return res.status(400).json({ error: 'Welcome email is disabled in Compliance.' });
  }
  const baseUrl = PUBLIC_URL || 'http://localhost:5173';
  const base = baseUrl.replace(/\/$/, '');
  const confirmationUrl = `${base}/api/public/confirm?token=${token}`;
  const unsubscribeUrl = `${base}/unsubscribe?token=${token}`;
  const preferencesUrl = `${base}/preferences?token=${token}`;
  sendWelcomeEmail(
    String(lead.email),
    {
      subject: typeof config.subject === 'string' ? config.subject : 'Welcome!',
      fromName: null,
      fromEmail: null,
      replyTo: null,
      body: typeof config.body === 'string' ? config.body : ''
    },
    { confirmationUrl, unsubscribeUrl, preferencesUrl }
  )
    .then(() => {
      return res.json({ success: true });
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Welcome email failed';
      console.warn(`[welcome-email] ${message}`);
      return res.status(500).json({ error: message });
    });
});

router.post('/subscribers/resend-confirmations', async (_req, res) => {
  const config = await loadWelcomeEmailConfig();
  if (!config || !config.enabled) {
    return res.status(400).json({ error: 'Welcome email is disabled in Compliance.' });
  }
  const leads = await db.many<DbRow>(
    `SELECT id, email, unsubscribeToken
     FROM leads
     WHERE confirmedAt IS NULL
       AND isUnsubscribed = 0
       AND emailInvalid = 0`
  );
  if (!leads.length) {
    return res.json({ success: true, sent: 0 });
  }
  const baseUrl = PUBLIC_URL || 'http://localhost:5173';
  const base = baseUrl.replace(/\/$/, '');
  const results = leads.map((lead) => {
    const token = lead.unsubscribeToken || crypto.randomBytes(24).toString('hex');
    if (!lead.unsubscribeToken) {
      void db.exec('UPDATE leads SET unsubscribeToken = @token WHERE id = @id', {
        id: lead.id,
        token
      });
    }
    const confirmationUrl = `${base}/api/public/confirm?token=${token}`;
    const unsubscribeUrl = `${base}/unsubscribe?token=${token}`;
    const preferencesUrl = `${base}/preferences?token=${token}`;
    return sendWelcomeEmail(
      String(lead.email),
      {
        subject: typeof config.subject === 'string' ? config.subject : 'Welcome!',
        fromName: null,
        fromEmail: null,
        replyTo: null,
        body: typeof config.body === 'string' ? config.body : ''
      },
      { confirmationUrl, unsubscribeUrl, preferencesUrl }
    );
  });
  Promise.allSettled(results)
    .then((outcomes) => {
      const sent = outcomes.filter((item) => item.status === 'fulfilled').length;
      const failed = outcomes.length - sent;
      if (failed > 0) {
        console.warn(`[welcome-email] resend batch failures: ${failed}`);
      }
      return res.json({ success: true, sent, failed });
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Welcome email resend failed';
      console.warn(`[welcome-email] ${message}`);
      return res.status(500).json({ error: message });
    });
});

const SITE_CONTENT_KEYS = new Set(['faqs', 'partners', 'subscribe_modal_copy', 'hero_ticker', 'hero_presenter']);

router.get('/site-content/:key', async (req, res) => {
  const { key } = req.params;
  if (!SITE_CONTENT_KEYS.has(key)) {
    return res.status(400).json({ error: 'Invalid content key' });
  }
  const row = await db.one<DbRow>('SELECT valueJson, updatedAt FROM site_content WHERE key = ?', [key]);
  if (!row) {
    return res.json({ key, value: null, updatedAt: null });
  }
  try {
    const parsed = JSON.parse(row.valueJson);
    return res.json({ key, value: parsed, updatedAt: row.updatedAt });
  } catch {
    return res.json({ key, value: null, updatedAt: row.updatedAt });
  }
});

router.put('/site-content/:key', async (req, res) => {
  const { key } = req.params;
  if (!SITE_CONTENT_KEYS.has(key)) {
    return res.status(400).json({ error: 'Invalid content key' });
  }
  const { value } = req.body as { value?: unknown };
  if (typeof value === 'undefined') {
    return res.status(400).json({ error: 'Value is required' });
  }
  const now = new Date().toISOString();
  const valueJson = JSON.stringify(value);
  await db.exec(
    `INSERT INTO site_content (key, valueJson, updatedAt)
     VALUES (@key, @valueJson, @updatedAt)
     ON CONFLICT(key) DO UPDATE SET
       valueJson = excluded.valueJson,
       updatedAt = excluded.updatedAt`
  ,{ key, valueJson, updatedAt: now });
  if (key === 'hero_presenter') {
    emitContentUpdate('hero_presenter');
  }
  return res.json({ key, value, updatedAt: now });
});

router.get('/subscribers', async (req, res) => {
  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
  const offsetRaw = typeof req.query.offset === 'string' ? Number(req.query.offset) : 0;
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;
  const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
  const source = typeof req.query.source === 'string' ? req.query.source.trim() : '';
  const unsubscribedParam = typeof req.query.unsubscribed === 'string' ? req.query.unsubscribed.trim() : '';

  const where: string[] = [];
  const params: Record<string, unknown> = { limit, offset };

  if (query) {
    where.push('(email LIKE @query OR name LIKE @query)');
    params.query = `%${query}%`;
  }
  if (source) {
    where.push('source = @source');
    params.source = source;
  }
  if (unsubscribedParam === 'true') {
    where.push('isUnsubscribed = 1');
  } else if (unsubscribedParam === 'false') {
    where.push('isUnsubscribed = 0');
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const items = await db.many<DbRow>(
    `SELECT id, email, name, country, source, isUnsubscribed, createdAt
     FROM leads
     ${whereSql}
     ORDER BY createdAt DESC
     LIMIT @limit OFFSET @offset`
  , params);
  const totalRow = await db.one<DbRow>(
    `SELECT COUNT(*) as count FROM leads ${whereSql}`,
    params
  );

  return res.json({
    items: items.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      country: row.country,
      source: row.source,
      isUnsubscribed: Boolean(row.isUnsubscribed),
      createdAt: row.createdAt
    })),
    total: Number(totalRow?.count || 0),
    limit,
    offset
  });
});

router.get('/subscribers/continents', async (_req, res) => {
  const rows = await db.many<DbRow>(
    `SELECT continent, COUNT(*) as count
     FROM leads
     WHERE isUnsubscribed = 0 AND emailInvalid = 0
     GROUP BY continent`
  );
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    const key = typeof row.continent === 'string' ? row.continent.trim() : '';
    if (!key) return acc;
    acc[key] = Number(row.count || 0);
    return acc;
  }, {});
  const totalRow = await db.one<DbRow>(
    'SELECT COUNT(*) as count FROM leads WHERE isUnsubscribed = 0 AND emailInvalid = 0'
  );
  return res.json({ total: Number(totalRow?.count || 0), counts });
});

router.get('/health/email', async (_req, res) => {
  const settings = await db.one<DbRow>(
    'SELECT smtpHost, smtpPort, smtpUser, smtpPass FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  const smtpConfigured = Boolean(settings?.smtpHost && settings?.smtpPort && settings?.smtpUser && settings?.smtpPass);
  const publicUrlValid = PUBLIC_URL.startsWith('http://') || PUBLIC_URL.startsWith('https://');
  const throttlingConfigValid = SEND_RATE_PER_MINUTE >= 0 && SEND_RATE_PER_HOUR >= 0;
  let renderEngineOk = true;
  let trackingUrlFormatsOk = true;
  try {
    const test = renderEmailWithPostProcess({
      htmlSource: '<a href="https://example.com">Link</a>',
      subjectSource: 'Test {{name}}',
      variables: { name: 'Boss', unsubscribeUrl: 'https://example.com/unsub' },
      campaignId: 'preview',
      trackingToken: 'preview',
      publicUrl: PUBLIC_URL,
      includeUnsubscribeFooter: true,
      includeOpenPixel: true
    });
    renderEngineOk = Boolean(test.renderedHtml);
    trackingUrlFormatsOk = test.renderedHtml.includes('/t/c/preview/preview?u=');
  } catch {
    renderEngineOk = false;
    trackingUrlFormatsOk = false;
  }
  return res.json({
    smtpConfigured,
    publicUrlValid,
    throttlingConfigValid,
    renderEngineOk,
    trackingUrlFormatsOk
  });
});

router.get('/page-templates', async (_req, res) => {
  const rows = await db.many<DbRow>('SELECT * FROM templates ORDER BY createdAt DESC');
  const items = rows.map((row) => ({
    ...row,
    sections: parseJsonList(row.sections)
  }));
  return res.json(items);
});

router.post('/page-templates', async (req, res) => {
  const { name, sections } = req.body as Record<string, unknown>;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Template name is required' });
  }
  if (!Array.isArray(sections)) {
    return res.status(400).json({ error: 'Sections must be an array' });
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO templates (id, name, sections, createdAt)
     VALUES (@id, @name, @sections, @createdAt)`
  ,{
    id,
    name: name.trim(),
    sections: JSON.stringify(sections),
    createdAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM templates WHERE id = ?', [id]);
  emitContentUpdate('pages');
  return res.status(201).json({ ...row, sections });
});

router.get('/templates', async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const tag = typeof req.query.tag === 'string' ? req.query.tag.trim() : '';
  const sort = typeof req.query.sort === 'string' ? req.query.sort.trim() : 'updated_desc';
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 12)));
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (search) {
    where.push('(name LIKE @term OR subjectDefault LIKE @term)');
    params.term = `%${search}%`;
  }
  if (category) {
    where.push('category = @category');
    params.category = category;
  }
  if (tag) {
    where.push('tags LIKE @tag');
    params.tag = `%\"${tag}\"%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = sort === 'name_asc' ? 'ORDER BY name ASC' : 'ORDER BY updatedAt DESC';

  const totalRow = await db.one<DbRow>(`SELECT COUNT(*) as count FROM email_templates ${whereSql}`, params);
  const total = Number(totalRow?.count || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const rows = await db.many<DbRow>(
    `SELECT * FROM email_templates ${whereSql} ${orderBy} LIMIT @limit OFFSET @offset`,
    { ...params, limit, offset }
  );

  const items = rows.map((row) => ({
    ...row,
    tags: parseJsonArray(row.tags)
  }));
  return res.json({ items, page, total, totalPages });
});

router.get('/templates/:id', async (req, res) => {
  const { id } = req.params;
  const row = await db.one<DbRow>('SELECT * FROM email_templates WHERE id = ?', [id]);
  if (!row) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.json({ ...row, tags: parseJsonArray(row.tags) });
});

router.post('/templates/:id/render', async (req, res) => {
  const { id } = req.params;
  const { variables, html, options } = req.body as Record<string, unknown>;
  if (!isPlainObject(variables)) {
    return res.status(400).json({ error: 'variables must be an object' });
  }
  const row = await db.one<DbRow>('SELECT html FROM email_templates WHERE id = ?', [id]);
  if (!row) {
    return res.status(404).json({ error: 'Template not found' });
  }
  try {
    const source = typeof html === 'string' ? html : (row.html as string);
    const renderOptions = isPlainObject(options) ? (options as Record<string, unknown>) : {};
    const rewriteLinks = renderOptions.rewriteLinks !== false;
    const injectOpenPixel = renderOptions.injectOpenPixel !== false;
    const forceFooter = renderOptions.forceFooter === true;
      const { renderedHtml, warnings } = renderEmailWithPostProcess({
        htmlSource: source || '',
        variables: variables as Record<string, unknown>,
        includeUnsubscribeFooter: true,
        includeOpenPixel: injectOpenPixel,
        forceFooter,
        campaignId: rewriteLinks ? 'preview' : undefined,
        trackingToken: rewriteLinks ? 'preview' : undefined,
        publicUrl: rewriteLinks ? PUBLIC_URL : undefined
      });
      return res.json({ renderedHtml, warnings });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Render failed' });
  }
});

router.post('/templates/:id/send-test', async (req, res) => {
  const { id } = req.params;
  const { to, subject, variables, html, options } = req.body as Record<string, unknown>;
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    return res.status(400).json({ error: 'Valid recipient email is required' });
  }
  if (!isPlainObject(variables ?? {})) {
    return res.status(400).json({ error: 'variables must be an object' });
  }
  const row = await db.one<DbRow>('SELECT html, subjectDefault FROM email_templates WHERE id = ?', [id]);
  if (!row) {
    return res.status(404).json({ error: 'Template not found' });
  }
  try {
    const subjectText =
      (typeof subject === 'string' && subject.trim()) ||
      (typeof row.subjectDefault === 'string' && row.subjectDefault.trim()) ||
      'Template preview';
    const opts = isPlainObject(options) ? (options as Record<string, unknown>) : {};
    const asSent = Boolean(opts.asSent);
    const rewriteLinks = opts.rewriteLinks !== false;
    const injectOpenPixel = opts.injectOpenPixel !== false;
    const forceFooter = opts.forceFooter === true;
    const source = typeof html === 'string' ? html : (row.html as string);
    const baseUrl = PUBLIC_URL.replace(/\/+$/, '');
    const normalizedVariables = { ...(variables as Record<string, unknown>) };
    if (typeof normalizedVariables.unsubscribeUrl !== 'string' || !normalizedVariables.unsubscribeUrl) {
      normalizedVariables.unsubscribeUrl = `${baseUrl}/unsubscribe?token=test`;
    }
    const { renderedHtml, renderedSubject } = renderEmailWithPostProcess({
      htmlSource: source || '',
      subjectSource: subjectText,
      variables: normalizedVariables,
      includeUnsubscribeFooter: true,
      includeOpenPixel: asSent ? injectOpenPixel : false,
      forceFooter: asSent ? forceFooter : false,
      campaignId: asSent && rewriteLinks ? 'test' : undefined,
      trackingToken: asSent && rewriteLinks ? 'test' : undefined,
      publicUrl: asSent && rewriteLinks ? PUBLIC_URL : undefined
    });
    await sendTemplateTestEmail(to.trim(), renderedSubject || subjectText, renderedHtml);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Send failed' });
  }
});

router.post('/templates', async (req, res) => {
  const { name, subjectDefault, html, category, tags, thumbnailUrl } = req.body as Record<string, unknown>;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Template name is required' });
  }
  if (!html || typeof html !== 'string') {
    return res.status(400).json({ error: 'Template html is required' });
  }
  const normalizedHtml = ensureUnsubscribeFooter(html);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const tagList = normalizeTags(tags);
  await db.exec(
    `INSERT INTO email_templates (
      id, name, subjectDefault, html, category, tags, thumbnailUrl, createdAt, updatedAt
    ) VALUES (
      @id, @name, @subjectDefault, @html, @category, @tags, @thumbnailUrl, @createdAt, @updatedAt
    )`
  ,{
    id,
    name: name.trim(),
    subjectDefault: typeof subjectDefault === 'string' ? subjectDefault.trim() || null : null,
    html: normalizedHtml,
    category: typeof category === 'string' ? category.trim() || null : null,
    tags: tagList.length ? JSON.stringify(tagList) : null,
    thumbnailUrl: typeof thumbnailUrl === 'string' ? thumbnailUrl.trim() || null : null,
    createdAt: now,
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM email_templates WHERE id = ?', [id]);
  emitContentUpdate('email-templates');
  return res.status(201).json({ ...row, tags: parseJsonArray(row.tags) });
});

router.put('/templates/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT * FROM email_templates WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }
  const updates = req.body as Record<string, unknown>;
  const tagList = 'tags' in updates ? normalizeTags(updates.tags) : parseJsonArray(existing.tags);
  const nextHtml =
    typeof updates.html === 'string'
      ? ensureUnsubscribeFooter(updates.html)
      : existing.html;
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE email_templates SET
      name = @name,
      subjectDefault = @subjectDefault,
      html = @html,
      category = @category,
      tags = @tags,
      thumbnailUrl = @thumbnailUrl,
      updatedAt = @updatedAt
    WHERE id = @id`
  ,{
    id,
    name: typeof updates.name === 'string' ? updates.name.trim() || existing.name : existing.name,
    subjectDefault:
      typeof updates.subjectDefault === 'string'
        ? updates.subjectDefault.trim() || null
        : existing.subjectDefault,
    html: nextHtml,
    category:
      typeof updates.category === 'string'
        ? updates.category.trim() || null
        : existing.category,
    tags: tagList.length ? JSON.stringify(tagList) : null,
    thumbnailUrl:
      typeof updates.thumbnailUrl === 'string'
        ? updates.thumbnailUrl.trim() || null
        : existing.thumbnailUrl,
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM email_templates WHERE id = ?', [id]);
  emitContentUpdate('email-templates');
  return res.json({ ...row, tags: parseJsonArray(row.tags) });
});

router.delete('/templates/:id', async (req, res) => {
  const { id } = req.params;
  const result = await db.exec('DELETE FROM email_templates WHERE id = ?', [id]);
  if ((result.rowCount ?? 0) === 0) {
    return res.status(404).json({ error: 'Not found' });
  }
  emitContentUpdate('email-templates');
  return res.json({ deleted: id });
});

router.post('/templates/:id/duplicate', async (req, res) => {
  const { id } = req.params;
  const existing = await db.one<DbRow>('SELECT * FROM email_templates WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ error: 'Not found' });
  }
  const now = new Date().toISOString();
  const copyId = crypto.randomUUID();
  await db.exec(
    `INSERT INTO email_templates (
      id, name, subjectDefault, html, category, tags, createdAt, updatedAt
    ) VALUES (
      @id, @name, @subjectDefault, @html, @category, @tags, @createdAt, @updatedAt
    )`
  ,{
    id: copyId,
    name: `${existing.name} (Copy)`,
    subjectDefault: existing.subjectDefault,
    html: existing.html,
    category: existing.category,
    tags: existing.tags,
    createdAt: now,
    updatedAt: now
  });
  const row = await db.one<DbRow>('SELECT * FROM email_templates WHERE id = ?', [copyId]);
  emitContentUpdate('email-templates');
  return res.status(201).json({ ...row, tags: parseJsonArray(row.tags) });
});

router.post('/templates/:id/audience-continents', async (req, res) => {
  const { id } = req.params;
  const template = await db.one<DbRow>('SELECT id FROM email_templates WHERE id = ?', [id]);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  const filterPayload = 'filterJson' in (req.body as Record<string, unknown>)
    ? normalizeFilterPayload((req.body as Record<string, unknown>).filterJson)
    : null;
  const baseFilter = filterPayload ? { ...filterPayload, continents: [] } : null;
  const filterJson = baseFilter ? JSON.stringify(baseFilter) : null;
  const audience = await getCampaignAudience(filterJson);
  const counts = audience.reduce<Record<string, number>>((acc, lead) => {
    const key = typeof lead.continent === 'string' ? lead.continent.trim() : '';
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return res.json({ total: audience.length, counts });
});

router.post('/templates/:id/send-campaign', async (req, res) => {
  const { id } = req.params;
  const { name, subject, filterJson, html } = req.body as Record<string, unknown>;
  const template = await db.one<DbRow>('SELECT id, subjectDefault FROM email_templates WHERE id = ?', [id]);
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  try {
    await enforceCampaignLimits();
  } catch (error) {
    return res.status(429).json({ error: error instanceof Error ? error.message : 'Campaign limit reached.' });
  }
  const subjectText =
    (typeof subject === 'string' && subject.trim()) ||
    (typeof template.subjectDefault === 'string' && template.subjectDefault.trim()) ||
    '';
  if (!subjectText) {
    return res.status(400).json({ error: 'Subject is required.' });
  }
  const filterPayload = normalizeFilterPayload(filterJson);
  const now = new Date().toISOString();
  const campaignId = crypto.randomUUID();
  const campaignName =
    typeof name === 'string' && name.trim() ? name.trim() : `Quick send - ${now.slice(0, 10)}`;
  const htmlOverride =
    typeof html === 'string' && html.trim() ? ensureUnsubscribeFooter(html) : null;
  await db.exec(
    `INSERT INTO email_campaigns (
      id, name, templateId, subject, htmlOverride, abEnabled, subjectA, subjectB, templateIdA, templateIdB, splitRatio,
      status, filterJson, scheduledAt, createdAt, updatedAt
    ) VALUES (
      @id, @name, @templateId, @subject, @htmlOverride, @abEnabled, @subjectA, @subjectB, @templateIdA, @templateIdB, @splitRatio,
      @status, @filterJson, @scheduledAt, @createdAt, @updatedAt
    )`
  ,{
    id: campaignId,
    name: campaignName,
    templateId: template.id,
    subject: subjectText,
    htmlOverride,
    abEnabled: 0,
    subjectA: subjectText,
    subjectB: subjectText,
    templateIdA: template.id,
    templateIdB: null,
    splitRatio: 50,
    status: 'draft',
    filterJson: JSON.stringify(filterPayload),
    scheduledAt: null,
    createdAt: now,
    updatedAt: now
  });
  const queued = await enqueueCampaignJobs(campaignId, now);
  if (queued > 0) {
    await updateCampaignStatus(campaignId, 'sending');
    emitContentUpdate('campaign');
    emitContentUpdate('job');
  }
  return res.json({ ok: true, queued, campaignId, warnings: queued > 0 ? [] : [{
    code: 'no_confirmed_recipients',
    message: 'No confirmed subscribers matched this audience.'
  }] });
});

export default router;
