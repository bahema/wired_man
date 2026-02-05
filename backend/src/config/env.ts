import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const localEnvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
dotenv.config();

export const PORT = Number(process.env.PORT ?? 4000);
if (!Number.isFinite(PORT)) {
  throw new Error('PORT must be a number.');
}
const defaultUploadDir = path.resolve(process.cwd(), 'src', 'storage', 'uploads');
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : defaultUploadDir;
export const R2_ENDPOINT = process.env.R2_ENDPOINT || '';
export const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
export const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
export const R2_BUCKET = process.env.R2_BUCKET || '';
export const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL || '';
export const R2_PREFIX = process.env.R2_PREFIX || 'uploads/';
export const DATABASE_URL = process.env.DATABASE_URL || '';
export const DATABASE_SSL = process.env.DATABASE_SSL !== 'false';
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
export const SMTP_HOST = process.env.SMTP_HOST || '';
export const SMTP_PORT = Number(process.env.SMTP_PORT || 0);
export const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
export const SMTP_USER = process.env.SMTP_USER || '';
export const SMTP_PASS = (process.env.SMTP_PASS || '').replace(/\s/g, '');
export const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
export const SMTP_TLS_REJECT_UNAUTHORIZED = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false';
export const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:5173';
export const SEND_RATE_PER_MINUTE = Number(process.env.SEND_RATE_PER_MINUTE || process.env.MAX_EMAILS_PER_MINUTE || 0);
export const SEND_RATE_PER_HOUR = Number(process.env.SEND_RATE_PER_HOUR || process.env.MAX_EMAILS_PER_HOUR || 0);
export const MAX_CAMPAIGNS_PER_HOUR = Number(process.env.MAX_CAMPAIGNS_PER_HOUR || 0);
export const MAX_CAMPAIGNS_PER_DAY = Number(process.env.MAX_CAMPAIGNS_PER_DAY || 0);
export const SPF_CONFIGURED = process.env.SPF_CONFIGURED === 'true';
export const DKIM_CONFIGURED = process.env.DKIM_CONFIGURED === 'true';
export const DMARC_CONFIGURED = process.env.DMARC_CONFIGURED === 'true';
export const DELIVERABILITY_DOMAIN = process.env.DELIVERABILITY_DOMAIN || '';
export const DKIM_SELECTOR = process.env.DKIM_SELECTOR || '';
export const DELIVERABILITY_WARNINGS_ENABLED = process.env.DELIVERABILITY_WARNINGS_ENABLED !== 'false';
export const DRY_RUN_MODE = process.env.DRY_RUN_MODE === 'true';
export const TEST_SEND_ALLOWLIST = (process.env.TEST_SEND_ALLOWLIST || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter((item) => item);
export const UNSUBSCRIBE_URL_ALLOWLIST = (process.env.UNSUBSCRIBE_URL_ALLOWLIST || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter((item) => item);
export const LOCK_TTL_MINUTES = Number(process.env.LOCK_TTL_MINUTES || 10);
export const OTP_EMAIL_ENABLED = process.env.OTP_EMAIL_ENABLED !== 'false';
export const DEV_EXPOSE_OTP = process.env.DEV_EXPOSE_OTP === 'true';
export const DEBUG_LOGS_ENABLED = process.env.DEBUG_LOGS_ENABLED === 'true';
export const LEGACY_CAMPAIGN_BRIDGE_ENABLED = process.env.LEGACY_CAMPAIGN_BRIDGE_ENABLED !== 'false';
export const LEGACY_SCHEDULER_ENABLED = process.env.LEGACY_SCHEDULER_ENABLED !== 'false';
export const CLICK_BACKFILL_ON_STARTUP = process.env.CLICK_BACKFILL_ON_STARTUP === 'true';
export const DROP_CLICKS_TABLE = process.env.DROP_CLICKS_TABLE === 'true';
const resolveDbPath = () => {
  if (process.env.DB_PATH) {
    return path.resolve(process.env.DB_PATH);
  }
  const candidates = [
    path.resolve(process.cwd(), 'data', 'app.db'),
    path.resolve(process.cwd(), '..', 'data', 'app.db'),
    path.resolve(__dirname, '..', '..', 'data', 'app.db')
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing || candidates[0];
};

export const DB_PATH = resolveDbPath();

export const validateConfig = () => {
  const required = [
    'PUBLIC_URL',
    'SEND_RATE_PER_MINUTE',
    'SEND_RATE_PER_HOUR',
    'DELIVERABILITY_WARNINGS_ENABLED',
    'DRY_RUN_MODE',
    'TEST_SEND_ALLOWLIST',
    'LOCK_TTL_MINUTES'
  ];
  const missing = required.filter((key) => !(key in process.env));
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  if (!PUBLIC_URL) {
    throw new Error('PUBLIC_URL is required.');
  }
  const isNumber = (value: number) => Number.isFinite(value) && value >= 0;
  if (!isNumber(SEND_RATE_PER_MINUTE) || !isNumber(SEND_RATE_PER_HOUR)) {
    throw new Error('SEND_RATE_PER_MINUTE and SEND_RATE_PER_HOUR must be numbers >= 0.');
  }
  if (!Number.isFinite(LOCK_TTL_MINUTES) || LOCK_TTL_MINUTES <= 0) {
    throw new Error('LOCK_TTL_MINUTES must be a number > 0.');
  }
};
