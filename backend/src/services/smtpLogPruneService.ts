import fs from 'fs';
import path from 'path';
import { R2_PUBLIC_BASE_URL } from '../config/env';

const LOG_PATH = path.resolve('data', 'smtp-debug.log');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const pruneSmtpLog = () => {
  try {
    if (!fs.existsSync(LOG_PATH)) return;
    const raw = fs.readFileSync(LOG_PATH, 'utf8');
    const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    const cutoff = Date.now() - ONE_DAY_MS;
    const kept = lines.filter((line) => {
      const match = line.match(/^\[(?<ts>[^\]]+)\]/);
      if (!match?.groups?.ts) return true;
      const ts = Date.parse(match.groups.ts);
      if (Number.isNaN(ts)) return true;
      return ts >= cutoff;
    });
    if (kept.length !== lines.length) {
      fs.writeFileSync(LOG_PATH, `${kept.join('\n')}\n`);
    }
  } catch {
    // Ignore pruning failures.
  }
};

export const startSmtpLogPruneScheduler = () => {
  if (process.env.NETLIFY || R2_PUBLIC_BASE_URL) {
    return null;
  }
  pruneSmtpLog();
  return setInterval(pruneSmtpLog, 6 * 60 * 60 * 1000);
};
