import { buildApiUrl } from '../data/mediaLibrary';

// Configure admin access in `.env` via VITE_ADMIN_TOKEN.
const ADMIN_TOKEN =
  (import.meta as { env?: { VITE_ADMIN_TOKEN?: string } }).env?.VITE_ADMIN_TOKEN || '';
const SESSION_KEY = 'boss-admin-session';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  admin?: boolean;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const headers: Record<string, string> = { ...(options.headers || {}) };
  if (options.admin && ADMIN_TOKEN) {
    headers['x-admin-token'] = ADMIN_TOKEN;
  }
  if (options.admin) {
    const sessionToken =
      sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || '';
    if (sessionToken) {
      headers['x-admin-session'] = sessionToken;
    }
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(buildApiUrl(path), {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    const err = new Error(data.error || `Request failed (${res.status})`);
    (err as { data?: unknown }).data = data;
    throw err;
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
};

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' })
};
