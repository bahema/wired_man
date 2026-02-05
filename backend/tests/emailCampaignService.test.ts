import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
process.env.DB_PATH = path.join(os.tmpdir(), `boss-email-test-${Date.now()}.db`);
process.env.PUBLIC_URL = 'http://localhost:5173';
process.env.SEND_RATE_PER_MINUTE = '1';
process.env.SEND_RATE_PER_HOUR = '10';
process.env.DELIVERABILITY_WARNINGS_ENABLED = 'true';
process.env.DRY_RUN_MODE = 'false';
process.env.TEST_SEND_ALLOWLIST = 'test@example.com';

let db: typeof import('../src/db').default;
let emailService: typeof import('../src/services/emailCampaignService');
let DBQueue: typeof import('../src/queue/dbQueue').DBQueue;

before(async () => {
  const dbModule = await import('../src/db');
  db = dbModule.default;
  const queueModule = await import('../src/queue/dbQueue');
  DBQueue = queueModule.DBQueue;
  emailService = await import('../src/services/emailCampaignService');
});

const resetTables = () => {
  db.exec('DELETE FROM email_send_logs');
  db.exec('DELETE FROM email_jobs');
  db.exec('DELETE FROM email_campaigns');
  db.exec('DELETE FROM email_templates');
  db.exec('DELETE FROM leads');
};

test('throttling delays jobs beyond the send limit', () => {
  resetTables();
  const now = new Date();
  const queue = new DBQueue('test-worker');
  db.prepare(
    `INSERT INTO email_templates (id, name, subjectDefault, html, category, tags, thumbnailUrl, createdAt, updatedAt)
     VALUES (@id, @name, @subjectDefault, @html, @category, @tags, @thumbnailUrl, @createdAt, @updatedAt)`
  ).run({
    id: 'tmpl-1',
    name: 'Template',
    subjectDefault: 'Hello',
    html: '<div>Hi {{firstName}} {{unsubscribeUrl}}</div>',
    category: null,
    tags: null,
    thumbnailUrl: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  });
  db.prepare(
    `INSERT INTO email_campaigns (id, name, templateId, subject, status, filterJson, scheduledAt, createdAt, updatedAt)
     VALUES (@id, @name, @templateId, @subject, @status, @filterJson, @scheduledAt, @createdAt, @updatedAt)`
  ).run({
    id: 'cmp-1',
    name: 'Campaign',
    templateId: 'tmpl-1',
    subject: 'Hello',
    status: 'draft',
    filterJson: JSON.stringify({ topics: [], tags: [], location: '' }),
    scheduledAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  });
  const jobOne = queue.enqueue({
    campaignId: 'cmp-1',
    subscriberId: 'lead-1',
    toEmail: 'test@example.com',
    payload: { templateId: 'tmpl-1', subject: 'Test', variables: {} },
    runAt: now.toISOString()
  });
  const firstThrottle = emailService.applyThrottleToJob(jobOne.id, now.toISOString());
  assert.equal(firstThrottle, null);

  db.prepare(
    `INSERT INTO email_send_logs (id, campaignId, subscriberId, toEmail, status, error, sentAt, createdAt)
     VALUES (@id, @campaignId, @subscriberId, @toEmail, @status, @error, @sentAt, @createdAt)`
  ).run({
    id: 'log-1',
    campaignId: 'cmp-1',
    subscriberId: 'lead-1',
    toEmail: 'test@example.com',
    status: 'sent',
    error: null,
    sentAt: now.toISOString(),
    createdAt: now.toISOString()
  });

  const jobTwo = queue.enqueue({
    campaignId: 'cmp-1',
    subscriberId: 'lead-1',
    toEmail: 'test@example.com',
    payload: { templateId: 'tmpl-1', subject: 'Test', variables: {} },
    runAt: now.toISOString()
  });
  const throttled = emailService.applyThrottleToJob(jobTwo.id, now.toISOString());
  assert.ok(throttled, 'expected a throttled runAt to be returned');
  const updated = db.prepare('SELECT runAt FROM email_jobs WHERE id = ?').get(jobTwo.id) as { runAt: string };
  assert.ok(new Date(updated.runAt).getTime() > now.getTime(), 'expected runAt moved forward');
});

test('idempotency prevents duplicate sends for a campaign + subscriber', () => {
  resetTables();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO email_templates (id, name, subjectDefault, html, category, tags, thumbnailUrl, createdAt, updatedAt)
     VALUES (@id, @name, @subjectDefault, @html, @category, @tags, @thumbnailUrl, @createdAt, @updatedAt)`
  ).run({
    id: 'tmpl-2',
    name: 'Template',
    subjectDefault: 'Hello',
    html: '<div>Hi {{firstName}} {{unsubscribeUrl}}</div>',
    category: null,
    tags: null,
    thumbnailUrl: null,
    createdAt: now,
    updatedAt: now
  });
  db.prepare(
    `INSERT INTO email_campaigns (id, name, templateId, subject, status, filterJson, scheduledAt, createdAt, updatedAt)
     VALUES (@id, @name, @templateId, @subject, @status, @filterJson, @scheduledAt, @createdAt, @updatedAt)`
  ).run({
    id: 'cmp-2',
    name: 'Campaign',
    templateId: 'tmpl-2',
    subject: 'Hello',
    status: 'draft',
    filterJson: JSON.stringify({ topics: [], tags: [], location: '' }),
    scheduledAt: null,
    createdAt: now,
    updatedAt: now
  });
  db.prepare(
    `INSERT INTO leads (id, name, email, country, continent, interests, source, isUnsubscribed, unsubscribedAt, unsubscribeToken, emailInvalid, emailFailureCount, isTestSubscriber, createdAt)
     VALUES (@id, @name, @email, @country, @continent, @interests, @source, @isUnsubscribed, @unsubscribedAt, @unsubscribeToken, @emailInvalid, @emailFailureCount, @isTestSubscriber, @createdAt)`
  ).run({
    id: 'lead-2',
    name: 'Dup',
    email: 'dup@example.com',
    country: null,
    continent: null,
    interests: JSON.stringify(['newsletter']),
    source: 'test',
    isUnsubscribed: 0,
    unsubscribedAt: null,
    unsubscribeToken: 'tok-dup',
    emailInvalid: 0,
    emailFailureCount: 0,
    isTestSubscriber: 0,
    createdAt: now
  });

  const first = emailService.enqueueCampaignJobs('cmp-2', now);
  const second = emailService.enqueueCampaignJobs('cmp-2', now);
  assert.equal(first, 1);
  assert.equal(second, 0);
  const logCountRow = db
    .prepare('SELECT COUNT(*) as count FROM email_send_logs WHERE campaignId = ? AND subscriberId = ?')
    .get('cmp-2', 'lead-2') as { count: number };
  assert.equal(Number(logCountRow.count), 1);
});

test('unsubscribed subscribers are excluded from job creation', () => {
  resetTables();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO leads (id, name, email, country, continent, interests, source, isUnsubscribed, unsubscribedAt, unsubscribeToken, emailInvalid, emailFailureCount, isTestSubscriber, createdAt)
     VALUES (@id, @name, @email, @country, @continent, @interests, @source, @isUnsubscribed, @unsubscribedAt, @unsubscribeToken, @emailInvalid, @emailFailureCount, @isTestSubscriber, @createdAt)`
  ).run({
    id: 'lead-3',
    name: 'Unsubbed User',
    email: 'unsub@example.com',
    country: null,
    continent: null,
    interests: JSON.stringify(['newsletter']),
    source: 'test',
    isUnsubscribed: 1,
    unsubscribedAt: now,
    unsubscribeToken: 'tok-3',
    emailInvalid: 0,
    emailFailureCount: 0,
    isTestSubscriber: 0,
    createdAt: now
  });
  db.prepare(
    `INSERT INTO leads (id, name, email, country, continent, interests, source, isUnsubscribed, unsubscribedAt, unsubscribeToken, emailInvalid, emailFailureCount, isTestSubscriber, createdAt)
     VALUES (@id, @name, @email, @country, @continent, @interests, @source, @isUnsubscribed, @unsubscribedAt, @unsubscribeToken, @emailInvalid, @emailFailureCount, @isTestSubscriber, @createdAt)`
  ).run({
    id: 'lead-4',
    name: 'Active User',
    email: 'active@example.com',
    country: null,
    continent: null,
    interests: JSON.stringify(['newsletter']),
    source: 'test',
    isUnsubscribed: 0,
    unsubscribedAt: null,
    unsubscribeToken: 'tok-4',
    emailInvalid: 0,
    emailFailureCount: 0,
    isTestSubscriber: 0,
    createdAt: now
  });

  const audience = emailService.getCampaignAudience();
  assert.equal(audience.length, 1);
  assert.equal(audience[0]?.email, 'active@example.com');
});

test('render failure marks send log and job as failed', async () => {
  resetTables();
  const now = new Date().toISOString();
  const queue = new DBQueue('test-worker');

  db.prepare(
    `INSERT INTO email_templates (id, name, subjectDefault, html, category, tags, thumbnailUrl, createdAt, updatedAt)
     VALUES (@id, @name, @subjectDefault, @html, @category, @tags, @thumbnailUrl, @createdAt, @updatedAt)`
  ).run({
    id: 'tmpl-ok',
    name: 'Template',
    subjectDefault: 'Hello',
    html: '<div>Hi {{firstName}} {{unsubscribeUrl}}</div>',
    category: null,
    tags: null,
    thumbnailUrl: null,
    createdAt: now,
    updatedAt: now
  });

  db.prepare(
    `INSERT INTO email_campaigns (id, name, templateId, subject, status, filterJson, scheduledAt, createdAt, updatedAt)
     VALUES (@id, @name, @templateId, @subject, @status, @filterJson, @scheduledAt, @createdAt, @updatedAt)`
  ).run({
    id: 'cmp-3',
    name: 'Campaign',
    templateId: 'tmpl-ok',
    subject: 'Hello',
    status: 'draft',
    filterJson: JSON.stringify({ topics: [], tags: [], location: '' }),
    scheduledAt: null,
    createdAt: now,
    updatedAt: now
  });

  db.prepare(
    `INSERT INTO email_send_logs (id, campaignId, subscriberId, toEmail, status, error, sentAt, createdAt)
     VALUES (@id, @campaignId, @subscriberId, @toEmail, @status, @error, @sentAt, @createdAt)`
  ).run({
    id: 'job-3',
    campaignId: 'cmp-3',
    subscriberId: 'lead-3',
    toEmail: 'fail@example.com',
    status: 'queued',
    error: null,
    sentAt: null,
    createdAt: now
  });

  const job = queue.enqueue({
    id: 'job-3',
    campaignId: 'cmp-3',
    subscriberId: 'lead-3',
    toEmail: 'fail@example.com',
    payload: { templateId: 'tmpl-missing', subject: 'Test', variables: {} },
    runAt: now,
    maxAttempts: 1
  });

  try {
    await emailService.processEmailJob(job);
    assert.fail('expected render failure');
  } catch (error) {
    assert.ok(error);
  }

  job.attempts = 1;
  (queue as any).markJobFailure(job, 'Template not found');

  const logRow = db
    .prepare('SELECT status, error FROM email_send_logs WHERE id = ?')
    .get(job.id) as { status: string; error: string | null };
  const jobRow = db
    .prepare('SELECT status FROM email_jobs WHERE id = ?')
    .get(job.id) as { status: string };

  assert.equal(logRow.status, 'failed');
  assert.equal(jobRow.status, 'failed');
});
