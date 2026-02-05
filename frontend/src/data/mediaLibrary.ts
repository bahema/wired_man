export type MediaAssetType = 'Images' | 'Videos' | 'Documents' | 'Icons';

export type MediaAsset = {
  name: string;
  path: string;
  type: MediaAssetType;
};

export const API_BASE_URL =
  (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL || '';
export const MEDIA_BASE_URL =
  (import.meta as { env?: { VITE_MEDIA_BASE_URL?: string } }).env?.VITE_MEDIA_BASE_URL ||
  API_BASE_URL ||
  '';

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '');
const normalizeMediaBase = (baseUrl: string) => {
  const trimmed = normalizeBaseUrl(baseUrl);
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
};

const joinApiUrl = (base: string, path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!base) return normalizedPath;
  const trimmedBase = normalizeBaseUrl(base);
  if (trimmedBase.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${trimmedBase}${normalizedPath.replace(/^\/api/, '')}`;
  }
  return `${trimmedBase}${normalizedPath}`;
};

export const buildApiUrl = (path: string) => {
  const base = normalizeBaseUrl(API_BASE_URL);
  return joinApiUrl(base, path);
};

export const toMediaUrl = (value?: string | null) => {
  if (!value) return '';
  if (value.includes('\\')) {
    const fileName = value.split(/[/\\]+/).pop() || '';
    return fileName ? toMediaUrl(`/uploads/${fileName}`) : '';
  }
  if (/^(https?:)?\/\//.test(value) || value.startsWith('data:')) return value;
  const base = normalizeMediaBase(MEDIA_BASE_URL);
  if (value.startsWith('/uploads/')) {
    return base ? `${base}${value}` : value;
  }
  if (value.startsWith('/')) {
    return base ? `${base}${value}` : value;
  }
  const normalized = value.startsWith('uploads/') ? `/${value}` : `/uploads/${value}`;
  return base ? `${base}${normalized}` : normalized;
};

export const resolveMediaUrl = toMediaUrl;

export const appendMediaVersion = (value?: string | null, version?: number) => {
  const resolved = toMediaUrl(value);
  if (!resolved || !version) return resolved;
  if (!resolved.includes('/uploads/')) return resolved;
  const separator = resolved.includes('?') ? '&' : '?';
  return `${resolved}${separator}v=${version}`;
};

export const getAssetType = (path: string): MediaAssetType => {
  const lower = path.toLowerCase();
  const fileName = lower.split('/').pop() || '';
  if (lower.startsWith('/icons/') || fileName.endsWith('.ico') || fileName.startsWith('icon-') || fileName.startsWith('icon_')) {
    return 'Icons';
  }
  if (lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm')) return 'Videos';
  if (
    lower.endsWith('.pdf') ||
    lower.endsWith('.doc') ||
    lower.endsWith('.docx') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.csv') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.xlsx')
  ) {
    return 'Documents';
  }
  return 'Images';
};
