import db from '../db';

type DbRow = Record<string, any>;

const normalizeKey = (value?: string | null) =>
  (typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '') || 'unknown';

export const getSourceAliasMap = async () => {
  const rows = await db.many<DbRow>('SELECT alias, canonical FROM source_aliases');
  const map = new Map<string, string>();
  rows.forEach((row) => {
    const alias = normalizeKey(row.alias);
    const canonical = typeof row.canonical === 'string' ? row.canonical.trim() : '';
    if (alias && canonical) {
      map.set(alias, canonical);
    }
  });
  return map;
};

export const resolveSourceLabel = (value?: string | null, aliasMap?: Map<string, string>) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  const aliasKey = normalizeKey(trimmed);
  if (aliasMap && aliasMap.has(aliasKey)) {
    return aliasMap.get(aliasKey) as string;
  }
  return trimmed || 'Unknown';
};

export const normalizeSourceKey = (value?: string | null, aliasMap?: Map<string, string>) => {
  const label = resolveSourceLabel(value, aliasMap);
  return normalizeKey(label);
};
