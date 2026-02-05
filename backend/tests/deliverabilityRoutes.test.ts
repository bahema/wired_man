import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

process.env.DB_PATH = path.join(os.tmpdir(), `boss-deliverability-test-${Date.now()}.db`);
process.env.PUBLIC_URL = 'http://localhost:5173';
process.env.SEND_RATE_PER_MINUTE = '10';
process.env.SEND_RATE_PER_HOUR = '100';
process.env.DELIVERABILITY_WARNINGS_ENABLED = 'true';
process.env.DRY_RUN_MODE = 'false';
process.env.TEST_SEND_ALLOWLIST = 'test@example.com';
process.env.LOCK_TTL_MINUTES = '10';
process.env.ADMIN_TOKEN = 'test-admin-token';
process.env.SPF_CONFIGURED = 'true';
process.env.DKIM_CONFIGURED = 'false';
process.env.DMARC_CONFIGURED = 'true';
process.env.DELIVERABILITY_DOMAIN = 'invalid.example';
process.env.DKIM_SELECTOR = 'selector';

let db: typeof import('../src/db').default;
let adminRoutes: typeof import('../src/routes/admin.routes').default;
let server: import('http').Server;
let baseUrl = '';

const authHeaders = () => ({
  'x-admin-token': 'test-admin-token'
});

const request = async (path: string) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: authHeaders()
  });
  const body = await response.json();
  return { status: response.status, body };
};

const seedTemplate = () => {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO email_templates (id, name, subjectDefault, html, category, tags, thumbnailUrl, createdAt, updatedAt)
     VALUES (@id, @name, @subjectDefault, @html, @category, @tags, @thumbnailUrl, @createdAt, @updatedAt)`
  ).run({
    id: 'tmpl-1',
    name: 'Template',
    subjectDefault: 'Hello',
    html: '<div>Hi</div>',
    category: null,
    tags: null,
    thumbnailUrl: null,
    createdAt: now,
    updatedAt: now
  });
};

const seedCampaign = () => {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO email_campaigns (id, name, templateId, subject, status, filterJson, scheduledAt, createdAt, updatedAt)
     VALUES (@id, @name, @templateId, @subject, @status, @filterJson, @scheduledAt, @createdAt, @updatedAt)`
  ).run({
    id: 'cmp-1',
    name: 'Campaign',
    templateId: 'tmpl-1',
    subject: 'Hello',
    status: 'draft',
    filterJson: JSON.stringify({ topics: [], tags: [], location: '' }),
    scheduledAt: null,
    createdAt: now,
    updatedAt: now
  });
};

const resetTables = () => {
  db.exec('DELETE FROM email_jobs');
  db.exec('DELETE FROM leads');
  db.exec('DELETE FROM deliverability_checklist');
  db.exec('DELETE FROM email_campaigns');
  db.exec('DELETE FROM email_templates');
  db.prepare(
    `UPDATE admin_settings SET
      smtpHost = NULL,
      smtpPort = NULL,
      smtpSecure = 0,
      smtpUser = NULL,
      smtpPass = NULL,
      smtpFrom = NULL,
      deliverabilityDomain = NULL,
      dkimSelector = NULL,
      updatedAt = @updatedAt`
  ).run({ updatedAt: new Date().toISOString() });
  seedTemplate();
  seedCampaign();
};

before(async () => {
  const dbModule = await import('../src/db');
  db = dbModule.default;
  const routesModule = await import('../src/routes/admin.routes');
  adminRoutes = routesModule.default;

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

beforeEach(() => {
  resetTables();
});

test('deliverability status falls back to env flags when DNS lookup fails', async () => {
  const { status, body } = await request('/api/admin/deliverability/status');
  assert.equal(status, 200);
  assert.equal(body.spfConfigured, true);
  assert.equal(body.dkimConfigured, false);
  assert.equal(body.dmarcConfigured, true);
});

test('deliverability checklist returns config + dns snapshot', async () => {
  const { status, body } = await request('/api/admin/deliverability/checklist');
  assert.equal(status, 200);
  assert.equal(body.config.smtpConfigured, false);
  assert.equal(body.dns.spfConfigured, true);
  assert.equal(body.dns.dkimConfigured, false);
  assert.equal(body.dns.dmarcConfigured, true);
});

test('deliverability trends aggregate queued/sent/failed/skipped', async () => {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO email_jobs (id, campaignId, subscriberId, toEmail, payloadJson, status, attempts, maxAttempts, runAt, createdAt, updatedAt)
     VALUES (@id, @campaignId, @subscriberId, @toEmail, @payloadJson, @status, @attempts, @maxAttempts, @runAt, @createdAt, @updatedAt)`
  ).run({
    id: 'job-queued',
    campaignId: 'cmp-1',
    subscriberId: null,
    toEmail: 'queued@example.com',
    payloadJson: JSON.stringify({}),
    status: 'queued',
    attempts: 0,
    maxAttempts: 3,
    runAt: now,
    createdAt: now,
    updatedAt: now
  });
  db.prepare(
    `INSERT INTO email_jobs (id, campaignId, subscriberId, toEmail, payloadJson, status, attempts, maxAttempts, runAt, createdAt, updatedAt)
     VALUES (@id, @campaignId, @subscriberId, @toEmail, @payloadJson, @status, @attempts, @maxAttempts, @runAt, @createdAt, @updatedAt)`
  ).run({
    id: 'job-sent',
    campaignId: 'cmp-1',
    subscriberId: null,
    toEmail: 'sent@example.com',
    payloadJson: JSON.stringify({}),
    status: 'sent',
    attempts: 1,
    maxAttempts: 3,
    runAt: now,
    createdAt: now,
    updatedAt: now
  });
  db.prepare(
    `INSERT INTO email_jobs (id, campaignId, subscriberId, toEmail, payloadJson, status, attempts, maxAttempts, runAt, createdAt, updatedAt, lastError)
     VALUES (@id, @campaignId, @subscriberId, @toEmail, @payloadJson, @status, @attempts, @maxAttempts, @runAt, @createdAt, @updatedAt, @lastError)`
  ).run({
    id: 'job-failed',
    campaignId: 'cmp-1',
    subscriberId: null,
    toEmail: 'failed@example.com',
    payloadJson: JSON.stringify({}),
    status: 'failed',
    attempts: 2,
    maxAttempts: 3,
    runAt: now,
    createdAt: now,
    updatedAt: now,
    lastError: 'SMTP failed'
  });
  db.prepare(
    `INSERT INTO email_jobs (id, campaignId, subscriberId, toEmail, payloadJson, status, attempts, maxAttempts, runAt, createdAt, updatedAt, skipReason)
     VALUES (@id, @campaignId, @subscriberId, @toEmail, @payloadJson, @status, @attempts, @maxAttempts, @runAt, @createdAt, @updatedAt, @skipReason)`
  ).run({
    id: 'job-skipped',
    campaignId: 'cmp-1',
    subscriberId: null,
    toEmail: 'skipped@example.com',
    payloadJson: JSON.stringify({}),
    status: 'skipped',
    attempts: 0,
    maxAttempts: 3,
    runAt: now,
    createdAt: now,
    updatedAt: now,
    skipReason: 'unsubscribed'
  });

  const { status, body } = await request('/api/admin/deliverability/trends?window=7');
  assert.equal(status, 200);
  assert.equal(body.summary.totals.queued, 1);
  assert.equal(body.summary.totals.sent, 1);
  assert.equal(body.summary.totals.failed, 1);
  assert.equal(body.summary.totals.skipped, 1);
});

test('deliverability errors returns recent failures', async () => {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO email_jobs (id, campaignId, subscriberId, toEmail, payloadJson, status, attempts, maxAttempts, runAt, createdAt, updatedAt, lastError)
     VALUES (@id, @campaignId, @subscriberId, @toEmail, @payloadJson, @status, @attempts, @maxAttempts, @runAt, @createdAt, @updatedAt, @lastError)`
  ).run({
    id: 'job-error',
    campaignId: 'cmp-1',
    subscriberId: 'lead-1',
    toEmail: 'error@example.com',
    payloadJson: JSON.stringify({}),
    status: 'failed',
    attempts: 1,
    maxAttempts: 3,
    runAt: now,
    createdAt: now,
    updatedAt: now,
    lastError: 'SMTP failed'
  });
  const { status, body } = await request('/api/admin/deliverability/errors');
  assert.equal(status, 200);
  assert.equal(body.length, 1);
  assert.equal(body[0].message, 'SMTP failed');
});

test('deliverability suppressed endpoint returns unsubscribed and invalid leads', async () => {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO leads (id, name, email, country, continent, interests, source, isUnsubscribed, unsubscribedAt, unsubscribeToken, emailInvalid, emailFailureCount, isTestSubscriber, createdAt)
     VALUES (@id, @name, @email, @country, @continent, @interests, @source, @isUnsubscribed, @unsubscribedAt, @unsubscribeToken, @emailInvalid, @emailFailureCount, @isTestSubscriber, @createdAt)`
  ).run({
    id: 'lead-unsub',
    name: 'Unsub',
    email: 'unsub@example.com',
    country: 'RW',
    continent: 'Africa',
    interests: JSON.stringify(['newsletter']),
    source: 'items-highlight',
    isUnsubscribed: 1,
    unsubscribedAt: now,
    unsubscribeToken: 'tok-unsub',
    emailInvalid: 0,
    emailFailureCount: 0,
    isTestSubscriber: 0,
    createdAt: now
  });
  db.prepare(
    `INSERT INTO leads (id, name, email, country, continent, interests, source, isUnsubscribed, unsubscribedAt, unsubscribeToken, emailInvalid, emailFailureCount, isTestSubscriber, createdAt)
     VALUES (@id, @name, @email, @country, @continent, @interests, @source, @isUnsubscribed, @unsubscribedAt, @unsubscribeToken, @emailInvalid, @emailFailureCount, @isTestSubscriber, @createdAt)`
  ).run({
    id: 'lead-invalid',
    name: 'Invalid',
    email: 'invalid@example.com',
    country: 'RW',
    continent: 'Africa',
    interests: JSON.stringify(['newsletter']),
    source: 'items-highlight',
    isUnsubscribed: 0,
    unsubscribedAt: null,
    unsubscribeToken: 'tok-invalid',
    emailInvalid: 1,
    emailFailureCount: 3,
    isTestSubscriber: 0,
    createdAt: now
  });

  const { status, body } = await request('/api/admin/deliverability/suppressed');
  assert.equal(status, 200);
  assert.equal(body.total, 2);
  const reasons = body.items.map((item: { reason: string }) => item.reason).sort();
  assert.deepEqual(reasons, ['email_invalid', 'unsubscribed']);
});
