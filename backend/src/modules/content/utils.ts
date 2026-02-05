export const parseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const normalizeUploadUrl = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/uploads/')) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;
  if (/^(https?:)?\/\//.test(trimmed)) return trimmed;
  return `/uploads/${trimmed}`;
};

export const normalizeUploadArray = (value: unknown) =>
  (Array.isArray(value) ? value : [])
    .map((item) => (typeof item === 'string' ? normalizeUploadUrl(item) : null))
    .filter((item): item is string => Boolean(item));

export const normalizeAffiliateLink = (value: unknown, fallback: string | null = null) => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const normalized = value.trim();
  if (normalized.startsWith('/')) return normalized;
  if (/^(https?:)?\/\//.test(normalized)) return normalized;
  return `https://${normalized}`;
};

export const resolveOptionalUpload = (value: unknown, fallback: string | null) => {
  if (value === null) return null;
  if (value === undefined) return fallback;
  return normalizeUploadUrl(value as string | null);
};
