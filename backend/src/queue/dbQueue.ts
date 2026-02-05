import crypto from 'crypto';
import db from '../db';
import { LOCK_TTL_MINUTES } from '../config/env';

type DbRow = Record<string, any>;

export type QueueJobInput = {
  id?: string;
  campaignId: string;
  subscriberId?: string | null;
  toEmail: string;
  payload: Record<string, unknown>;
  runAt: string;
  maxAttempts?: number;
};

export type QueueJob = {
  id: string;
  campaignId: string;
  subscriberId?: string | null;
  toEmail: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lockedAt?: string | null;
  lockedBy?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QueueWorkerOptions = {
  batchSize?: number;
  pollIntervalMs?: number;
};

export type QueueHandlerResult = 'success' | 'skip' | 'requeue';
export type QueueHandler = (job: QueueJob) => Promise<QueueHandlerResult | void>;

export interface Queue {
  enqueue(job: QueueJobInput): Promise<QueueJob>;
  enqueueBatch(jobs: QueueJobInput[]): Promise<QueueJob[]>;
  startWorker(handler: QueueHandler, options?: QueueWorkerOptions): void;
  processOnce(handler: QueueHandler, options?: QueueWorkerOptions): Promise<{ processed: number }>;
}

const parsePayload = (value: string | null): Record<string, unknown> => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const rowToJob = (row: DbRow): QueueJob => ({
  id: row.id,
  campaignId: row.campaignId,
  subscriberId: row.subscriberId,
  toEmail: row.toEmail,
  payload: parsePayload(row.payloadJson),
  status: row.status,
  attempts: row.attempts ?? 0,
  maxAttempts: row.maxAttempts ?? 3,
  runAt: row.runAt,
  lockedAt: row.lockedAt,
  lockedBy: row.lockedBy,
  lastError: row.lastError,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export class DBQueue implements Queue {
  private workerId: string;
  private timer: NodeJS.Timeout | null = null;
  private recoveryTimer: NodeJS.Timeout | null = null;

  constructor(workerId: string) {
    this.workerId = workerId;
  }

  async enqueue(job: QueueJobInput): Promise<QueueJob> {
    const now = new Date().toISOString();
    const id = job.id || crypto.randomUUID();
    const maxAttempts = job.maxAttempts ?? 3;
    await db.exec(
      `INSERT INTO email_jobs (
        id, campaignId, subscriberId, toEmail, payloadJson, status,
        attempts, maxAttempts, runAt, lockedAt, lockedBy, lastError, createdAt, updatedAt
      ) VALUES (
        @id, @campaignId, @subscriberId, @toEmail, @payloadJson, @status,
        @attempts, @maxAttempts, @runAt, @lockedAt, @lockedBy, @lastError, @createdAt, @updatedAt
      )`,
      {
      id,
      campaignId: job.campaignId,
      subscriberId: job.subscriberId ?? null,
      toEmail: job.toEmail,
      payloadJson: JSON.stringify(job.payload || {}),
      status: 'queued',
      attempts: 0,
      maxAttempts,
      runAt: job.runAt,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      createdAt: now,
      updatedAt: now
      }
    );
    const row = await db.one<DbRow>('SELECT * FROM email_jobs WHERE id = ?', [id]);
    if (!row) {
      throw new Error('Failed to enqueue job');
    }
    return rowToJob(row);
  }

  async enqueueBatch(jobs: QueueJobInput[]): Promise<QueueJob[]> {
    if (jobs.length === 0) return [];
    const now = new Date().toISOString();
    const jobIds: string[] = [];
    for (const job of jobs) {
      const id = job.id || crypto.randomUUID();
      jobIds.push(id);
      const maxAttempts = job.maxAttempts ?? 3;
      await db.exec(
        `INSERT INTO email_jobs (
          id, campaignId, subscriberId, toEmail, payloadJson, status,
          attempts, maxAttempts, runAt, lockedAt, lockedBy, lastError, createdAt, updatedAt
        ) VALUES (
          @id, @campaignId, @subscriberId, @toEmail, @payloadJson, @status,
          @attempts, @maxAttempts, @runAt, @lockedAt, @lockedBy, @lastError, @createdAt, @updatedAt
        )`,
        {
          id,
          campaignId: job.campaignId,
          subscriberId: job.subscriberId ?? null,
          toEmail: job.toEmail,
          payloadJson: JSON.stringify(job.payload || {}),
          status: 'queued',
          attempts: 0,
          maxAttempts,
          runAt: job.runAt,
          lockedAt: null,
          lockedBy: null,
          lastError: null,
          createdAt: now,
          updatedAt: now
        }
      );
    }
    if (!jobIds.length) return [];
    const rows = await db.many<DbRow>('SELECT * FROM email_jobs WHERE id = ANY($1)', [jobIds]);
    return rows.map(rowToJob);
  }

  startWorker(handler: QueueHandler, options?: QueueWorkerOptions) {
    if (this.timer) return;
    const pollIntervalMs = options?.pollIntervalMs ?? 2000;
    const batchSize = options?.batchSize ?? 10;
    const recoveryIntervalMs = 60000;

    const run = async () => {
      await this.processOnce(handler, { batchSize });
    };

    this.timer = setInterval(() => {
      void run();
    }, pollIntervalMs);

    if (!this.recoveryTimer) {
      this.recoveryTimer = setInterval(() => {
        void (async () => {
          const recovered = await this.recoverStaleLocks();
          if (recovered > 0) {
            console.log(`[DBQueue] Recovered ${recovered} stale job(s).`);
          }
        })();
      }, recoveryIntervalMs);
    }
  }

  async recoverStaleLocks() {
    const now = Date.now();
    const ttlMs = Math.max(1, LOCK_TTL_MINUTES) * 60 * 1000;
    const cutoff = new Date(now - ttlMs).toISOString();
    const nextRun = new Date(now + (1000 + Math.floor(Math.random() * 10000))).toISOString();
    const result = await db.exec(
      `UPDATE email_jobs
       SET status = 'queued',
           runAt = @runAt,
           lockedAt = NULL,
           lockedBy = NULL,
           lastError = @lastError,
           updatedAt = @updatedAt
       WHERE status = 'processing'
         AND lockedAt IS NOT NULL
         AND lockedAt < @cutoff`,
      {
      runAt: nextRun,
      lastError: 'Recovered from stale lock',
      updatedAt: new Date().toISOString(),
      cutoff
      }
    );
    return Number(result.rowCount || 0);
  }

  async processOnce(handler: QueueHandler, options?: QueueWorkerOptions) {
    const batchSize = options?.batchSize ?? 10;
    const jobs = await this.lockJobs(batchSize);
    let processed = 0;
    for (const job of jobs) {
      try {
        const result = await handler(job);
        if (result === 'skip' || result === 'requeue') {
          processed += 1;
          continue;
        }
        await this.markJobSuccess(job.id);
        processed += 1;
      } catch (error) {
        await this.markJobFailure(job, error instanceof Error ? error.message : 'Job failed');
        processed += 1;
      }
    }
    return { processed };
  }

  private async lockJobs(limit: number) {
    const now = new Date().toISOString();
    const rows = await db.many<DbRow>(
      `UPDATE email_jobs
       SET status = 'processing',
           attempts = attempts + 1,
           lockedAt = @lockedAt,
           lockedBy = @lockedBy,
           updatedAt = @updatedAt
       WHERE id IN (
         SELECT id
         FROM email_jobs
         WHERE status = 'queued'
           AND runAt <= @now
           AND lockedAt IS NULL
           AND attempts < maxAttempts
         ORDER BY runAt ASC
         LIMIT @limit
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      {
        now,
        limit,
        lockedAt: now,
        lockedBy: this.workerId,
        updatedAt: now
      }
    );
    return rows.map(rowToJob);
  }

  private async markJobSuccess(id: string) {
    const now = new Date().toISOString();
    await db.exec(
      `UPDATE email_jobs
       SET status = 'sent',
           lockedAt = NULL,
           lockedBy = NULL,
           lastError = NULL,
           updatedAt = @updatedAt
       WHERE id = @id`,
      { id, updatedAt: now }
    );
  }

  private async markJobFailure(job: QueueJob, error: string) {
    const now = new Date().toISOString();
    const backoffMs = Math.min(60000, 2000 * job.attempts);
    if (job.attempts < job.maxAttempts) {
      const nextRun = new Date(Date.now() + backoffMs).toISOString();
      await db.exec(
        `UPDATE email_jobs
         SET status = 'queued',
             runAt = @runAt,
             lockedAt = NULL,
             lockedBy = NULL,
             lastError = @lastError,
             updatedAt = @updatedAt
         WHERE id = @id`,
        {
        id: job.id,
        runAt: nextRun,
        lastError: error,
        updatedAt: now
        }
      );
      return;
    }

    await db.exec(
      `UPDATE email_jobs
       SET status = 'failed',
           lockedAt = NULL,
           lockedBy = NULL,
           lastError = @lastError,
           updatedAt = @updatedAt
       WHERE id = @id`,
      { id: job.id, lastError: error, updatedAt: now }
    );
  }
}
