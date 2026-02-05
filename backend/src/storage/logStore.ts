import { getObjectText, objectExists, uploadText } from './r2';

const LOG_PREFIX = process.env.R2_LOG_PREFIX || 'logs/';

const buildKey = (name: string) => {
  const cleaned = name.replace(/^\/+/, '');
  const prefix = LOG_PREFIX.replace(/\/?$/, '/');
  return `${prefix}${cleaned}`;
};

const normalizeLines = (text: string) =>
  text.split('\n').map((line) => line.trim()).filter(Boolean);

const pruneLines = (lines: string[], maxLines: number) => {
  if (lines.length <= maxLines) return lines;
  return lines.slice(lines.length - maxLines);
};

export const readLogLines = async (name: string, limit: number) => {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit || 50)));
  const key = buildKey(name);
  const exists = await objectExists(key);
  if (!exists) return [];
  const text = await getObjectText(key);
  if (!text) return [];
  const lines = normalizeLines(text);
  return pruneLines(lines, safeLimit);
};

export const appendLogLine = async (name: string, line: string, maxLines = 1000) => {
  const key = buildKey(name);
  const exists = await objectExists(key);
  let lines: string[] = [];
  if (exists) {
    const text = await getObjectText(key);
    if (text) {
      lines = normalizeLines(text);
    }
  }
  lines.push(line.trim());
  const pruned = pruneLines(lines, maxLines);
  await uploadText(key, `${pruned.join('\n')}\n`);
};
