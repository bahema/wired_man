import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || '';
const DATABASE_SSL = process.env.DATABASE_SSL !== 'false';

if (!DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn('DATABASE_URL is not set. Postgres client will fail until configured.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_SSL ? { rejectUnauthorized: false } : undefined
});

type Params = Record<string, unknown> | unknown[] | undefined;

const toParams = (params?: Params) => {
  if (!params) return { text: '', values: [] as unknown[] };
  if (Array.isArray(params)) return { text: '', values: params };
  const keys = Object.keys(params);
  const values = keys.map((key) => (params as Record<string, unknown>)[key]);
  return { text: '', values };
};

const normalizeNamedParams = (sql: string, params?: Record<string, unknown>) => {
  if (!params) return { text: sql, values: [] as unknown[] };
  const keys = Object.keys(params);
  if (!keys.length) return { text: sql, values: [] as unknown[] };
  const values: unknown[] = [];
  let index = 1;
  const text = sql.replace(/@([a-zA-Z0-9_]+)/g, (_match, key) => {
    if (!(key in params)) {
      values.push(null);
    } else {
      values.push(params[key]);
    }
    const placeholder = `$${index}`;
    index += 1;
    return placeholder;
  });
  return { text, values };
};

const normalizePositionalParams = (sql: string, params?: unknown[]) => {
  if (!params || !params.length) return { text: sql, values: [] as unknown[] };
  let index = 1;
  const text = sql.replace(/\?/g, () => {
    const placeholder = `$${index}`;
    index += 1;
    return placeholder;
  });
  return { text, values: params };
};

export const query = async (sql: string, params?: Params) => {
  if (Array.isArray(params)) {
    const normalized = sql.includes('?') ? normalizePositionalParams(sql, params) : { text: sql, values: params };
    return pool.query(normalized.text, normalized.values);
  }
  if (params && typeof params === 'object') {
    const normalized = normalizeNamedParams(sql, params as Record<string, unknown>);
    return pool.query(normalized.text, normalized.values);
  }
  return pool.query(sql);
};

export const one = async <T = Record<string, unknown>>(sql: string, params?: Params) => {
  const result = await query(sql, params);
  return (result.rows[0] as T | undefined) ?? null;
};

export const many = async <T = Record<string, unknown>>(sql: string, params?: Params) => {
  const result = await query(sql, params);
  return result.rows as T[];
};

export const exec = async (sql: string, params?: Params) => {
  return query(sql, params);
};

export const withTransaction = async <T>(fn: (client: Pool) => Promise<T>) => {
  return fn(pool);
};

export default {
  query,
  one,
  many,
  exec,
  withTransaction
};
