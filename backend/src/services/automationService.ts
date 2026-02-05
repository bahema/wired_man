import crypto from 'crypto';
import db from '../db';
import { renderEmailWithPostProcess } from './emailRenderService';
import { PUBLIC_URL } from '../config/env';
import { sendTemplateTestEmail } from './mailer';
import { getThrottleRunAt } from './emailCampaignService';

type DbRow = Record<string, any>;

const normalizeList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : '')).filter(Boolean);
  }
  return [];
};

const parseFilterJson = (value?: string | null) => {
  if (!value) return { topics: [], tags: [], continents: [] };
  try {
    const parsed = JSON.parse(value);
    return {
      topics: normalizeList(parsed?.topics),
      tags: normalizeList(parsed?.tags),
      continents: normalizeList(parsed?.continents)
    };
  } catch {
    return { topics: [], tags: [], continents: [] };
  }
};

const parseInterests = (value?: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
};

const leadMatchesFilter = (lead: DbRow, filterJson?: string | null) => {
  const filter = parseFilterJson(filterJson);
  const interests = normalizeList(parseInterests(lead.interests));
  if (filter.topics.length && !filter.topics.some((topic) => interests.includes(topic))) {
    return false;
  }
  if (filter.tags.length && !filter.tags.some((tag) => interests.includes(tag))) {
    return false;
  }
  if (filter.continents.length) {
    const continent = typeof lead.continent === 'string' ? lead.continent.trim().toLowerCase() : '';
    if (!continent || !filter.continents.includes(continent)) {
      return false;
    }
  }
  return true;
};

const buildVariables = async (lead: DbRow, automationId: string) => {
  const interests = parseInterests(lead.interests);
  const firstName = lead.name ? String(lead.name).trim().split(/\s+/)[0] : '';
  const token = await (async () => {
    const existing = typeof lead.unsubscribeToken === 'string' ? lead.unsubscribeToken.trim() : '';
    if (existing) return existing;
    const next = crypto.randomBytes(24).toString('hex');
    await db.exec('UPDATE leads SET unsubscribeToken = @token WHERE id = @id', {
      id: lead.id,
      token: next
    });
    return next;
  })();
  const baseUrl = PUBLIC_URL.replace(/\/+$/, '');
  const trackingOpenUrl = token
    ? `${baseUrl}/api/public/track/open/automation/${automationId}/${token}.png`
    : '';
  return {
    firstName,
    email: lead.email,
    location: lead.country || lead.continent || '',
    topic: interests[0] || '',
    topics: interests,
    unsubscribeUrl: token ? `${baseUrl}/unsubscribe?token=${token}` : '',
    trackingOpenUrl,
    trackingToken: token
  };
};

export const handleAutomationEnrollment = async (triggerType: string, subscriberId: string) => {
  const automationRows = await db.many<DbRow>(
    'SELECT * FROM email_automations WHERE status = ? AND triggerType = ?',
    ['active', triggerType]
  );
  if (!automationRows.length) return;
  const lead = await db.one<DbRow>(
    'SELECT * FROM leads WHERE id = ? AND isUnsubscribed = 0 AND emailInvalid = 0',
    [subscriberId]
  );
  if (!lead) return;
  for (const automation of automationRows) {
    if (!leadMatchesFilter(lead, automation.filterJson)) continue;
    const existing = await db.one<DbRow>(
      'SELECT id FROM email_automation_enrollments WHERE automationId = ? AND subscriberId = ?',
      [automation.id, subscriberId]
    );
    if (existing) continue;
    const now = new Date().toISOString();
    await db.exec(
      `INSERT INTO email_automation_enrollments (
        id, automationId, subscriberId, status, currentStep, nextRunAt, lastError, createdAt, updatedAt
      ) VALUES (
        @id, @automationId, @subscriberId, @status, @currentStep, @nextRunAt, @lastError, @createdAt, @updatedAt
      )`,
      {
      id: crypto.randomUUID(),
      automationId: automation.id,
      subscriberId,
      status: 'active',
      currentStep: 0,
      nextRunAt: now,
      lastError: null,
      createdAt: now,
      updatedAt: now
      }
    );
  }
};

let lastScanAt = 0;

const schedulerStatus = {
  running: false,
  lastRunAt: null as string | null,
  lastError: null as string | null,
  lastErrorAt: null as string | null
};

export const getAutomationSchedulerStatus = () => ({ ...schedulerStatus });

const scanActiveAutomations = async () => {
  const now = Date.now();
  if (now - lastScanAt < 5 * 60 * 1000) return;
  lastScanAt = now;
  const automations = await db.many<DbRow>(
    "SELECT * FROM email_automations WHERE status = 'active' AND triggerType IN ('tag','topic','date')"
  );
  if (!automations.length) return;
  const leads = await db.many<DbRow>(
    'SELECT * FROM leads WHERE isUnsubscribed = 0 AND emailInvalid = 0'
  );
  for (const automation of automations) {
    for (const lead of leads) {
      if (!leadMatchesFilter(lead, automation.filterJson)) continue;
      const existing = await db.one<DbRow>(
        'SELECT id FROM email_automation_enrollments WHERE automationId = ? AND subscriberId = ?',
        [automation.id, lead.id]
      );
      if (existing) continue;
      const nowIso = new Date().toISOString();
      await db.exec(
        `INSERT INTO email_automation_enrollments (
          id, automationId, subscriberId, status, currentStep, nextRunAt, lastError, createdAt, updatedAt
        ) VALUES (
          @id, @automationId, @subscriberId, @status, @currentStep, @nextRunAt, @lastError, @createdAt, @updatedAt
        )`,
        {
        id: crypto.randomUUID(),
        automationId: automation.id,
        subscriberId: lead.id,
        status: 'active',
        currentStep: 0,
        nextRunAt: nowIso,
        lastError: null,
        createdAt: nowIso,
        updatedAt: nowIso
        }
      );
    }
  }
};

export const runAutomationScheduler = async () => {
  schedulerStatus.running = true;
  schedulerStatus.lastRunAt = new Date().toISOString();
  await scanActiveAutomations();
  const nowIso = new Date().toISOString();
  const enrollments = await db.many<DbRow>(
    `SELECT e.*, a.status as automationStatus, a.triggerType, a.filterJson
     FROM email_automation_enrollments e
     JOIN email_automations a ON a.id = e.automationId
     WHERE e.status = 'active' AND (e.nextRunAt IS NULL OR e.nextRunAt <= @now)`,
    { now: nowIso }
  );

  try {
    for (const enrollment of enrollments) {
      if (enrollment.automationStatus !== 'active') continue;
    const steps = await db.many<DbRow>(
      'SELECT * FROM email_automation_steps WHERE automationId = ? ORDER BY stepOrder ASC',
      [enrollment.automationId]
    );
    const currentIndex = Number(enrollment.currentStep || 0);
    const step = steps[currentIndex];
    if (!step) {
      await db.exec(
        `UPDATE email_automation_enrollments
         SET status = 'completed', updatedAt = @updatedAt
         WHERE id = @id`,
        { id: enrollment.id, updatedAt: nowIso }
      );
      continue;
    }

    if (step.stepType === 'delay') {
      const delayMinutes = Number(step.delayMinutes || 0);
      const nextRunAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
      await db.exec(
        `UPDATE email_automation_enrollments
         SET currentStep = @currentStep, nextRunAt = @nextRunAt, updatedAt = @updatedAt
         WHERE id = @id`,
        {
          id: enrollment.id,
          currentStep: currentIndex + 1,
          nextRunAt,
          updatedAt: nowIso
        }
      );
      continue;
    }

    const lead = await db.one<DbRow>('SELECT * FROM leads WHERE id = ?', [enrollment.subscriberId]);
    if (!lead || lead.isUnsubscribed || lead.emailInvalid) {
      await db.exec(
        `UPDATE email_automation_enrollments
         SET status = 'skipped', lastError = @error, updatedAt = @updatedAt
         WHERE id = @id`,
        {
          id: enrollment.id,
          error: 'Subscriber suppressed',
          updatedAt: nowIso
        }
      );
      continue;
    }

    const templateId = step.templateId as string | null;
    const template = templateId
      ? await db.one<DbRow>('SELECT html, subjectDefault FROM email_templates WHERE id = ?', [templateId])
      : undefined;
    const htmlSource = step.htmlOverride || template?.html || '';
    const subjectSource = step.subjectOverride || template?.subjectDefault || 'Automation update';
    try {
      const variables = await buildVariables(lead, enrollment.automationId);
      const rendered = renderEmailWithPostProcess({
        htmlSource,
        subjectSource,
        variables,
        campaignId: enrollment.automationId,
        trackingToken: variables.trackingToken,
        trackingKind: 'automation',
        publicUrl: PUBLIC_URL,
        includeUnsubscribeFooter: true,
        includeOpenPixel: true
      });

      const throttle = await getThrottleRunAt(new Date(nowIso));
      if (throttle) {
        await db.exec(
          `UPDATE email_automation_enrollments
           SET nextRunAt = @nextRunAt, updatedAt = @updatedAt
           WHERE id = @id`,
          { id: enrollment.id, nextRunAt: throttle, updatedAt: nowIso }
        );
        continue;
      }

      await sendTemplateTestEmail(lead.email, rendered.renderedSubject || subjectSource, rendered.renderedHtml);
      await db.exec(
        `INSERT INTO email_automation_logs (
          id, automationId, subscriberId, stepId, status, error, sentAt, createdAt
        ) VALUES (
          @id, @automationId, @subscriberId, @stepId, @status, @error, @sentAt, @createdAt
        )`,
        {
        id: crypto.randomUUID(),
        automationId: enrollment.automationId,
        subscriberId: enrollment.subscriberId,
        stepId: step.id,
        status: 'sent',
        error: null,
        sentAt: nowIso,
        createdAt: nowIso
        }
      );
      await db.exec(
        `UPDATE email_automation_enrollments
         SET currentStep = @currentStep, nextRunAt = @nextRunAt, updatedAt = @updatedAt
         WHERE id = @id`,
        {
        id: enrollment.id,
        currentStep: currentIndex + 1,
        nextRunAt: nowIso,
        updatedAt: nowIso
        }
      );
      } catch (error) {
      await db.exec(
        `INSERT INTO email_automation_logs (
          id, automationId, subscriberId, stepId, status, error, sentAt, createdAt
        ) VALUES (
          @id, @automationId, @subscriberId, @stepId, @status, @error, @sentAt, @createdAt
        )`,
        {
        id: crypto.randomUUID(),
        automationId: enrollment.automationId,
        subscriberId: enrollment.subscriberId,
        stepId: step.id,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Send failed',
        sentAt: null,
        createdAt: nowIso
        }
      );
      await db.exec(
        `UPDATE email_automation_enrollments
         SET lastError = @error, updatedAt = @updatedAt
         WHERE id = @id`,
        {
        id: enrollment.id,
        error: error instanceof Error ? error.message : 'Send failed',
        updatedAt: nowIso
        }
      );
      }
    }
  } catch (error) {
    schedulerStatus.lastError = error instanceof Error ? error.message : 'Automation scheduler failed';
    schedulerStatus.lastErrorAt = new Date().toISOString();
  }
};
