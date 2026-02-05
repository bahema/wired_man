import crypto from 'crypto';
import os from 'os';
import db from '../db';
import { DBQueue, QueueJobInput } from '../queue/dbQueue';
import { sendTemplateTestEmail } from './mailer';
import { emitContentUpdate } from '../events';
import { getContinentForCountry } from '../data/continents';
import {
  PUBLIC_URL,
  SEND_RATE_PER_MINUTE,
  SEND_RATE_PER_HOUR,
  DRY_RUN_MODE,
  TEST_SEND_ALLOWLIST
} from '../config/env';
import { renderEmailWithPostProcess } from './emailRenderService';

type DbRow = Record<string, any>;

type AudienceFilter = {
  topics?: string[];
  location?: string;
  tags?: string[];
  continents?: string[];
  sources?: string[];
};

type LeadRow = {
  id: string;
  name?: string | null;
  email: string;
  country?: string | null;
  continent?: string | null;
  source?: string | null;
  interests?: string | null;
  isUnsubscribed?: number | boolean | null;
  unsubscribeToken?: string | null;
  emailInvalid?: number | boolean | null;
  emailFailureCount?: number | null;
  isTestSubscriber?: number | boolean | null;
};

const queue = new DBQueue(`${os.hostname()}-${process.pid}`);

const workerStatus = {
  running: false,
  startedAt: null as string | null,
  lastJobAt: null as string | null,
  lastError: null as string | null,
  lastErrorAt: null as string | null
};

export const getEmailWorkerStatus = () => ({ ...workerStatus });

const parseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};


const parseFilterJson = (value?: string | null): AudienceFilter => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return {};
    const raw = parsed as Record<string, unknown>;
    return {
      topics: Array.isArray(raw.topics) ? raw.topics.filter((item) => typeof item === 'string') : [],
      tags: Array.isArray(raw.tags) ? raw.tags.filter((item) => typeof item === 'string') : [],
      location: typeof raw.location === 'string' ? raw.location : '',
      continents: Array.isArray(raw.continents) ? raw.continents.filter((item) => typeof item === 'string') : [],
      sources: Array.isArray(raw.sources) ? raw.sources.filter((item) => typeof item === 'string') : []
    };
  } catch {
    return {};
  }
};

const normalizeList = (values?: string[]) =>
  (values || []).map((item) => item.trim().toLowerCase()).filter((item) => item);

const matchesFilter = (lead: LeadRow, filter: AudienceFilter) => {
  const interests = normalizeList(parseJsonArray(lead.interests || null));
  const topics = normalizeList(filter.topics);
  const tags = normalizeList(filter.tags);
  const location = filter.location?.trim().toLowerCase();
  const continents = normalizeList(filter.continents);
  const sources = normalizeList(filter.sources);

  if (topics.length && !topics.some((topic) => interests.includes(topic))) {
    return false;
  }
  if (tags.length && !tags.some((tag) => interests.includes(tag))) {
    return false;
  }
  if (location) {
    const country = (lead.country || '').trim().toLowerCase();
    const continent = (lead.continent || '').trim().toLowerCase();
    if (country !== location && continent !== location) {
      return false;
    }
  }
  if (continents.length) {
    const derived = getContinentForCountry(lead.country || null);
    const continent = (lead.continent || derived || '').trim().toLowerCase();
    if (!continent || !continents.includes(continent)) {
      return false;
    }
  }
  if (sources.length) {
    const source = (lead as { source?: string | null }).source || '';
    const normalizedSource = source.trim().toLowerCase();
    if (!normalizedSource || !sources.includes(normalizedSource)) {
      return false;
    }
  }
  return true;
};

const ensureUnsubscribeToken = async (leadId: string, currentToken?: string | null) => {
  const trimmed = typeof currentToken === 'string' ? currentToken.trim() : '';
  if (trimmed) return trimmed;
  const token = crypto.randomBytes(24).toString('hex');
  await db.exec('UPDATE leads SET unsubscribeToken = @token WHERE id = @id', { id: leadId, token });
  return token;
};

const buildVariables = async (lead: LeadRow, campaignId: string) => {
  const interests = parseJsonArray(lead.interests || null);
  const firstName = lead.name ? lead.name.trim().split(/\s+/)[0] : '';
  const token = await ensureUnsubscribeToken(lead.id, lead.unsubscribeToken);
  const baseUrl = PUBLIC_URL.replace(/\/+$/, '');
  const trackingOpenUrl = token
    ? `${baseUrl}/api/public/track/open/${campaignId}/${token}.png`
    : '';
  return {
    firstName,
    email: lead.email,
    location: lead.country || lead.continent || '',
    topic: interests[0] || '',
    topics: interests,
    unsubscribeUrl: token ? `${baseUrl}/unsubscribe?token=${token}` : '',
    trackingOpenUrl,
    // Keep the raw token for server-side click tracking link rewrites.
    trackingToken: token
  };
};

const getVariantAssignment = (subscriberId: string, splitRatio: number) => {
  // Deterministic split for A/B assignments.
  const hash = crypto.createHash('sha256').update(subscriberId).digest('hex');
  const bucket = parseInt(hash.slice(0, 8), 16) % 100;
  return bucket < splitRatio ? 'A' : 'B';
};

export const getCampaignAudience = async (filterJson?: string | null) => {
  const filter = parseFilterJson(filterJson);
  const leads = await db.many<LeadRow>(
    `SELECT id, name, email, country, continent, source, interests, isUnsubscribed, unsubscribeToken
     FROM leads
     WHERE email IS NOT NULL AND isUnsubscribed = 0 AND emailInvalid = 0 AND confirmedAt IS NOT NULL`
  );
  return leads.filter((lead) => lead.email && matchesFilter(lead, filter));
};

export const getSandboxAudience = async () => {
  const allowlist = TEST_SEND_ALLOWLIST;
  if (!allowlist.length) return [];
  const placeholders = allowlist.map(() => '?').join(',');
  const sql = `SELECT id, name, email, country, continent, interests, isUnsubscribed, unsubscribeToken
    FROM leads
    WHERE email IS NOT NULL
      AND isUnsubscribed = 0
      AND emailInvalid = 0
      AND LOWER(email) IN (${placeholders})`;
  const rows = await db.many<LeadRow>(sql, allowlist);
  return rows;
};

export const hasAlreadySent = async (campaignId: string, subscriberId: string) => {
  // Treat dry-run sends as already delivered for idempotency.
  const row = await db.one<DbRow>(
    `SELECT id FROM email_send_logs
     WHERE campaignId = @campaignId
       AND subscriberId = @subscriberId
       AND status IN ('sent', 'sent_dry_run')
     LIMIT 1`,
    { campaignId, subscriberId }
  );
  return Boolean(row);
};

export const getThrottleRunAt = async (now = new Date()) => {
  const minuteLimit = Number.isFinite(SEND_RATE_PER_MINUTE) ? SEND_RATE_PER_MINUTE : 0;
  const hourLimit = Number.isFinite(SEND_RATE_PER_HOUR) ? SEND_RATE_PER_HOUR : 0;
  if (minuteLimit <= 0 && hourLimit <= 0) return null;
  const minuteStart = new Date(now.getTime() - 60 * 1000).toISOString();
  const hourStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const sentLastMinuteRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_send_logs WHERE status IN ('sent','sent_dry_run') AND sentAt >= @start",
    { start: minuteStart }
  );
  const sentLastHourRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_send_logs WHERE status IN ('sent','sent_dry_run') AND sentAt >= @start",
    { start: hourStart }
  );
  const sentLastMinute = Number(sentLastMinuteRow?.count || 0);
  const sentLastHour = Number(sentLastHourRow?.count || 0);
  const delays: number[] = [];
  if (minuteLimit > 0 && sentLastMinute >= minuteLimit) {
    delays.push(60 * 1000);
  }
  if (hourLimit > 0 && sentLastHour >= hourLimit) {
    delays.push(60 * 60 * 1000);
  }
  if (!delays.length) return null;
  const delayMs = Math.max(...delays);
  return new Date(now.getTime() + delayMs).toISOString();
};

export const applyThrottleToJob = async (jobId: string, nowIso: string) => {
  const throttledUntil = await getThrottleRunAt(new Date(nowIso));
  if (!throttledUntil) return null;
  await db.exec(
    `UPDATE email_jobs
     SET status = 'queued',
         runAt = @runAt,
         lockedAt = NULL,
         lockedBy = NULL,
         attempts = CASE WHEN attempts > 0 THEN attempts - 1 ELSE 0 END,
         updatedAt = @updatedAt
     WHERE id = @id`,
    {
    id: jobId,
    runAt: throttledUntil,
    updatedAt: nowIso
    }
  );
  return throttledUntil;
};

const createSendLogsAndJobs = async (
  campaignId: string,
  subjectA: string | null,
  subjectB: string | null,
  templateIdA: string,
  templateIdB: string,
  abEnabled: boolean,
  splitRatio: number,
  leads: LeadRow[],
  runAt: string
) => {
  const now = new Date().toISOString();
  const jobs: QueueJobInput[] = [];
  for (const lead of leads) {
    const existing = await db.one<DbRow>(
      `SELECT id FROM email_send_logs
       WHERE campaignId = @campaignId AND subscriberId = @subscriberId
       LIMIT 1`,
      { campaignId, subscriberId: lead.id }
    );
    if (existing) {
      continue;
    }
    const id = crypto.randomUUID();
    const variant = abEnabled ? getVariantAssignment(lead.id, splitRatio) : 'A';
    const resolvedTemplateId = variant === 'B' ? templateIdB : templateIdA;
    const resolvedSubject = variant === 'B' ? subjectB : subjectA;
    const payload = {
      subject: resolvedSubject,
      templateId: resolvedTemplateId,
      variant,
      variables: await buildVariables(lead, campaignId)
    };
    await db.exec(
      `INSERT INTO email_send_logs (
        id, campaignId, subscriberId, toEmail, variant, skipReason, status, error, sentAt, createdAt
      ) VALUES (
        @id, @campaignId, @subscriberId, @toEmail, @variant, @skipReason, @status, @error, @sentAt, @createdAt
      )`,
      {
        id,
        campaignId,
        subscriberId: lead.id,
        toEmail: lead.email,
        variant,
        skipReason: null,
        status: 'queued',
        error: null,
        sentAt: null,
        createdAt: now
      }
    );
    jobs.push({
      id,
      campaignId,
      subscriberId: lead.id,
      toEmail: lead.email,
      payload,
      runAt
    });
  }
  await queue.enqueueBatch(jobs);
  return jobs.length;
};

export const enqueueCampaignJobs = async (campaignId: string, runAt: string) => {
  const campaign = await db.one<DbRow>(
    'SELECT id, templateId, subject, filterJson, abEnabled, subjectA, subjectB, templateIdA, templateIdB, splitRatio FROM email_campaigns WHERE id = ?',
    [campaignId]
  );
  if (!campaign) {
    throw new Error('Campaign not found');
  }
  const abEnabled = Boolean(campaign.abEnabled);
  const splitRatio = Math.min(100, Math.max(0, Number(campaign.splitRatio ?? 50)));
  const baseTemplateId = campaign.templateId as string;
  const templateIdA = typeof campaign.templateIdA === 'string' && campaign.templateIdA ? campaign.templateIdA : baseTemplateId;
  const templateIdB = typeof campaign.templateIdB === 'string' && campaign.templateIdB ? campaign.templateIdB : baseTemplateId;
  const templateA = await db.one<DbRow>('SELECT id, html, subjectDefault FROM email_templates WHERE id = ?', [
    templateIdA
  ]);
  if (!templateA) {
    throw new Error('Template A not found');
  }
  const templateB = templateIdB === templateIdA
    ? templateA
    : await db.one<DbRow>('SELECT id, html, subjectDefault FROM email_templates WHERE id = ?', [templateIdB]);
  if (!templateB) {
    throw new Error('Template B not found');
  }
  const subjectA =
    (typeof campaign.subjectA === 'string' && campaign.subjectA.trim()) ||
    (typeof campaign.subject === 'string' && campaign.subject.trim()) ||
    (typeof templateA.subjectDefault === 'string' && templateA.subjectDefault.trim()) ||
    '';
  const subjectB =
    (typeof campaign.subjectB === 'string' && campaign.subjectB.trim()) ||
    subjectA ||
    (typeof templateB.subjectDefault === 'string' && templateB.subjectDefault.trim()) ||
    '';
  if (!subjectA || (abEnabled && !subjectB)) {
    throw new Error('Subject is required before sending.');
  }
  const leads = await getCampaignAudience(campaign.filterJson);
  if (!leads.length) {
    return 0;
  }
  const queued = await createSendLogsAndJobs(
    campaignId,
    subjectA,
    subjectB,
    templateIdA,
    templateIdB,
    abEnabled,
    splitRatio,
    leads,
    runAt
  );
  return queued;
};

export const enqueueSandboxJobs = async (campaignId: string, runAt: string) => {
  const campaign = await db.one<DbRow>(
    'SELECT id, templateId, subject, abEnabled, subjectA, subjectB, templateIdA, templateIdB, splitRatio FROM email_campaigns WHERE id = ?',
    [campaignId]
  );
  if (!campaign) {
    throw new Error('Campaign not found');
  }
  const abEnabled = Boolean(campaign.abEnabled);
  const splitRatio = Math.min(100, Math.max(0, Number(campaign.splitRatio ?? 50)));
  const baseTemplateId = campaign.templateId as string;
  const templateIdA = typeof campaign.templateIdA === 'string' && campaign.templateIdA ? campaign.templateIdA : baseTemplateId;
  const templateIdB = typeof campaign.templateIdB === 'string' && campaign.templateIdB ? campaign.templateIdB : baseTemplateId;
  const templateA = await db.one<DbRow>('SELECT id, html, subjectDefault FROM email_templates WHERE id = ?', [
    templateIdA
  ]);
  if (!templateA) {
    throw new Error('Template A not found');
  }
  const templateB = templateIdB === templateIdA
    ? templateA
    : await db.one<DbRow>('SELECT id, html, subjectDefault FROM email_templates WHERE id = ?', [templateIdB]);
  if (!templateB) {
    throw new Error('Template B not found');
  }
  const subjectA =
    (typeof campaign.subjectA === 'string' && campaign.subjectA.trim()) ||
    (typeof campaign.subject === 'string' && campaign.subject.trim()) ||
    (typeof templateA.subjectDefault === 'string' && templateA.subjectDefault.trim()) ||
    '';
  const subjectB =
    (typeof campaign.subjectB === 'string' && campaign.subjectB.trim()) ||
    subjectA ||
    (typeof templateB.subjectDefault === 'string' && templateB.subjectDefault.trim()) ||
    '';
  if (!subjectA || (abEnabled && !subjectB)) {
    throw new Error('Subject is required before sending.');
  }
  const leads = await getSandboxAudience();
  if (!leads.length) {
    throw new Error('No sandbox recipients found.');
  }
  const queued = await createSendLogsAndJobs(
    campaignId,
    subjectA,
    subjectB,
    templateIdA,
    templateIdB,
    abEnabled,
    splitRatio,
    leads,
    runAt
  );
  return queued;
};

const mapCampaignStatusToScheduleStatus = (value: unknown) => {
  if (typeof value !== 'string') return 'draft';
  const status = value.trim().toLowerCase();
  if (status === 'scheduled') return 'scheduled';
  if (status === 'sending') return 'scheduled';
  if (status === 'sent') return 'sent';
  if (status === 'failed') return 'cancelled';
  return 'draft';
};

export const syncCampaignSchedule = async (campaignId: string) => {
  const campaign = await db.one<DbRow>(
    'SELECT id, name, status, scheduledAt FROM email_campaigns WHERE id = ?',
    [campaignId]
  );
  if (!campaign) return;
  const scheduledAt = typeof campaign.scheduledAt === 'string' ? campaign.scheduledAt.trim() : '';
  if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) {
    await db.exec("DELETE FROM schedule_items WHERE relatedType = 'campaign' AND relatedId = ?", [campaignId]);
    return;
  }
  const title =
    typeof campaign.name === 'string' && campaign.name.trim() ? campaign.name.trim() : 'Campaign';
  const status = mapCampaignStatusToScheduleStatus(campaign.status);
  const existing = await db.one<DbRow>(
    "SELECT id FROM schedule_items WHERE relatedType = 'campaign' AND relatedId = ?",
    [campaignId]
  );
  const now = new Date().toISOString();
  if (existing) {
    await db.exec(
      `UPDATE schedule_items SET
        title = @title,
        type = 'campaign',
        channel = 'email',
        status = @status,
        scheduledAt = @scheduledAt,
        updatedAt = @updatedAt
       WHERE id = @id`,
      {
      id: existing.id,
      title,
      status,
      scheduledAt,
      updatedAt: now
      }
    );
    return;
  }
  await db.exec(
    `INSERT INTO schedule_items (
      id, title, type, channel, status, scheduledAt, durationMins,
      ownerId, notes, relatedType, relatedId, createdAt, updatedAt
    ) VALUES (
      @id, @title, @type, @channel, @status, @scheduledAt, @durationMins,
      @ownerId, @notes, @relatedType, @relatedId, @createdAt, @updatedAt
    )`,
    {
    id: crypto.randomUUID(),
    title,
    type: 'campaign',
    channel: 'email',
    status,
    scheduledAt,
    durationMins: 60,
    ownerId: null,
    notes: null,
    relatedType: 'campaign',
    relatedId: campaignId,
    createdAt: now,
    updatedAt: now
    }
  );
};

export const updateCampaignStatus = async (campaignId: string, status: string) => {
  await db.exec('UPDATE email_campaigns SET status = @status, updatedAt = @updatedAt WHERE id = @id', {
    id: campaignId,
    status,
    updatedAt: new Date().toISOString()
  });
  emitContentUpdate('campaign');
  await syncCampaignSchedule(campaignId);
};

const reconcileFailedSendLogs = async (campaignId: string) => {
  // Ensure send logs mirror failed jobs when the worker fails before updating logs.
  await db.exec(
    `UPDATE email_send_logs
     SET status = 'failed',
         error = COALESCE(error, (
           SELECT lastError FROM email_jobs WHERE email_jobs.id = email_send_logs.id
         ), 'Job failed'),
         sentAt = NULL
     WHERE id IN (
       SELECT id FROM email_jobs WHERE campaignId = @campaignId AND status = 'failed'
     )
     AND status IN ('queued', 'processing')`,
    { campaignId }
  );
};

const fetchProgress = async (campaignId: string) => {
  const row = await db.one<DbRow>(
    `SELECT
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queuedCount,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processingCount,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sentCount,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedCount,
      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skippedCount,
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
    skippedCount: Number(row?.skippedCount || 0),
    totalCount: Number(row?.totalCount || 0)
  };
};

export const getCampaignProgress = async (campaignId: string) => {
  await reconcileFailedSendLogs(campaignId);
  return fetchProgress(campaignId);
};

export const startEmailJobWorker = () => {
  workerStatus.running = true;
  workerStatus.startedAt = new Date().toISOString();
  queue.startWorker(async (job) => {
    return processEmailJob(job);
  }, { pollIntervalMs: 2000, batchSize: 10 });
};

export const processEmailQueueOnce = async (batchSize = 10) => {
  workerStatus.running = true;
  if (!workerStatus.startedAt) {
    workerStatus.startedAt = new Date().toISOString();
  }
  await queue.recoverStaleLocks();
  const result = await queue.processOnce(async (job) => {
    return processEmailJob(job);
  }, { batchSize });
  return result;
};

export const processEmailJob = async (job: {
  id: string;
  campaignId: string;
  subscriberId?: string | null;
  toEmail: string;
  payload: Record<string, unknown>;
}) => {
  workerStatus.lastJobAt = new Date().toISOString();
  const nowIso = new Date().toISOString();
  const updateSendLogFailed = async (message: string) => {
    await db.exec(
      `UPDATE email_send_logs
       SET status = 'failed', error = @error, sentAt = NULL
       WHERE id = @id`,
      {
        id: job.id,
        error: message
      }
    );
  };
  // Idempotency: skip if this subscriber already received the campaign.
  if (job.subscriberId) {
    if (await hasAlreadySent(job.campaignId, job.subscriberId)) {
      await db.exec(
        `UPDATE email_send_logs
         SET status = 'sent', error = @error, sentAt = @sentAt
         WHERE id = @id`,
        {
          id: job.id,
          error: 'Skipped duplicate send',
          sentAt: nowIso
        }
      );
      await db.exec(
        `UPDATE email_jobs
         SET status = 'sent',
             lockedAt = NULL,
             lockedBy = NULL,
             lastError = @lastError,
             updatedAt = @updatedAt
         WHERE id = @id`,
        {
          id: job.id,
          lastError: 'Skipped duplicate send',
          updatedAt: nowIso
        }
      );
      emitContentUpdate('job');
      return 'skip';
    }
  }

  // Throttling: delay jobs if we exceed configured rate limits.
  const throttledUntil = await applyThrottleToJob(job.id, nowIso);

  if (throttledUntil) {
    emitContentUpdate('job');
    return 'requeue';
  }

  if (job.subscriberId) {
    const lead = await db.one<DbRow>(
      'SELECT isUnsubscribed, emailInvalid FROM leads WHERE id = ? LIMIT 1',
      [job.subscriberId]
    );
    const suppressed = lead?.isUnsubscribed || lead?.emailInvalid;
    if (suppressed) {
      const skipReason = lead?.isUnsubscribed ? 'unsubscribed' : 'email_invalid';
      await db.exec(
        `UPDATE email_send_logs
         SET status = 'skipped', skipReason = @skipReason, error = NULL, sentAt = NULL
         WHERE id = @id`,
        {
          id: job.id,
          skipReason
        }
      );
      await db.exec(
        `UPDATE email_jobs
         SET status = 'skipped',
             lockedAt = NULL,
             lockedBy = NULL,
             lastError = NULL,
             skipReason = @skipReason,
             updatedAt = @updatedAt
         WHERE id = @id`,
        {
          id: job.id,
          skipReason,
          updatedAt: nowIso
        }
      );
      emitContentUpdate('job');
      return 'skip';
    }
  }

  const templateId = typeof job.payload.templateId === 'string' ? job.payload.templateId : '';
  if (!templateId) {
    await updateSendLogFailed('Template missing');
    throw new Error('Template missing');
  }
  const template = await db.one<DbRow>('SELECT html, subjectDefault FROM email_templates WHERE id = ?', [
    templateId
  ]);
  if (!template) {
    await updateSendLogFailed('Template not found');
    throw new Error('Template not found');
  }
  const campaignRow = await db.one<DbRow>(
    'SELECT htmlOverride FROM email_campaigns WHERE id = ?',
    [job.campaignId]
  );
  const htmlOverride =
    typeof campaignRow?.htmlOverride === 'string' && campaignRow.htmlOverride.trim()
      ? campaignRow.htmlOverride
      : '';
  const variables =
    typeof job.payload.variables === 'object' && job.payload.variables !== null
      ? (job.payload.variables as Record<string, unknown>)
      : {};
  const subjectSource =
    (typeof job.payload.subject === 'string' && job.payload.subject.trim()) ||
    (typeof template.subjectDefault === 'string' && template.subjectDefault.trim()) ||
    'Campaign update';

  let renderedHtml = '';
  let renderedSubject = '';
  try {
    const trackingToken = typeof variables.trackingToken === 'string' ? variables.trackingToken : '';
    const rendered = renderEmailWithPostProcess({
      htmlSource: htmlOverride || template.html || '',
      subjectSource,
      variables,
      campaignId: job.campaignId,
      trackingToken,
      publicUrl: PUBLIC_URL,
      includeUnsubscribeFooter: true,
      includeOpenPixel: true
    });
    renderedHtml = rendered.renderedHtml;
    renderedSubject = rendered.renderedSubject;
  } catch (error) {
    await updateSendLogFailed(error instanceof Error ? error.message : 'Render failed');
    throw error;
  }

  try {
    await db.exec(
      `UPDATE email_send_logs
       SET status = 'processing', error = NULL, sentAt = NULL
       WHERE id = @id`,
      { id: job.id }
    );
    if (DRY_RUN_MODE) {
      // Dry run: log success without touching SMTP.
      await db.exec(
        `UPDATE email_send_logs
         SET status = 'sent_dry_run', error = NULL, sentAt = @sentAt
         WHERE id = @id`,
        { id: job.id, sentAt: new Date().toISOString() }
      );
      emitContentUpdate('job');
      return 'success';
    }
    await sendTemplateTestEmail(job.toEmail, renderedSubject || subjectSource, renderedHtml);
    await db.exec(
      `UPDATE email_send_logs
       SET status = 'sent', error = NULL, sentAt = @sentAt
       WHERE id = @id`,
      { id: job.id, sentAt: new Date().toISOString() }
    );
    emitContentUpdate('job');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Send failed';
    workerStatus.lastError = message;
    workerStatus.lastErrorAt = new Date().toISOString();
    if (job.subscriberId) {
      // Treat all SMTP failures as hard until we classify bounce codes explicitly.
      const failureRow = await db.one<DbRow>(
        'SELECT emailFailureCount FROM leads WHERE id = ? LIMIT 1',
        [job.subscriberId]
      );
      const failureCount = Number(failureRow?.emailFailureCount || 0) + 1;
      const markInvalid = failureCount >= 3;
      await db.exec(
        `UPDATE leads
         SET emailFailureCount = @emailFailureCount,
             emailInvalid = @emailInvalid
         WHERE id = @id`,
        {
          id: job.subscriberId,
          emailFailureCount: failureCount,
          emailInvalid: markInvalid ? 1 : 0
        }
      );
    }
    await updateSendLogFailed(error instanceof Error ? error.message : 'Send failed');
    emitContentUpdate('job');
    throw error;
  }

  const progress = await fetchProgress(job.campaignId);
  if (progress.totalCount > 0 && progress.queuedCount === 0 && progress.processingCount === 0) {
    await updateCampaignStatus(job.campaignId, progress.failedCount > 0 ? 'failed' : 'sent');
  }
  return 'success';
};
