import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

process.env.DB_PATH = path.join(os.tmpdir(), `boss-queue-recovery-${Date.now()}.db`);
process.env.LOCK_TTL_MINUTES = '1';
process.env.PUBLIC_URL = 'http://localhost:5173';
process.env.SEND_RATE_PER_MINUTE = '0';
process.env.SEND_RATE_PER_HOUR = '0';
process.env.DELIVERABILITY_WARNINGS_ENABLED = 'true';
process.env.DRY_RUN_MODE = 'true';
process.env.TEST_SEND_ALLOWLIST = '';

let db: typeof import('../src/db').default;
let DBQueue: typeof import('../src/queue/dbQueue').DBQueue;

before(async () => {
  const dbModule = await import('../src/db');
  db = dbModule.default;
  const queueModule = await import('../src/queue/dbQueue');
  DBQueue = queueModule.DBQueue;
});

test('recoverStaleLocks requeues stale processing jobs', () => {
  const queue = new DBQueue('test-worker');
  const now = new Date();
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
  db.prepare(
    `INSERT INTO email_jobs (
      id, campaignId, subscriberId, toEmail, payloadJson, status,
      attempts, maxAttempts, runAt, lockedAt, lockedBy, lastError, createdAt, updatedAt
    ) VALUES (
      @id, @campaignId, @subscriberId, @toEmail, @payloadJson, @status,
      @attempts, @maxAttempts, @runAt, @lockedAt, @lockedBy, @lastError, @createdAt, @updatedAt
    )`
  ).run({
    id: 'job-stale',
    campaignId: 'cmp-1',
    subscriberId: 'lead-1',
    toEmail: 'qa@example.com',
    payloadJson: '{}',
    status: 'processing',
    attempts: 1,
    maxAttempts: 3,
    runAt: now.toISOString(),
    lockedAt: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
    lockedBy: 'worker-old',
    lastError: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  });

  const recovered = queue.recoverStaleLocks();
  assert.equal(recovered, 1);
  const row = db.prepare('SELECT status, lockedAt, lockedBy, lastError FROM email_jobs WHERE id = ?').get('job-stale') as {
    status: string;
    lockedAt: string | null;
    lockedBy: string | null;
    lastError: string | null;
  };
  assert.equal(row.status, 'queued');
  assert.equal(row.lockedAt, null);
  assert.equal(row.lockedBy, null);
  assert.equal(row.lastError, 'Recovered from stale lock');
});
