import { deleteSessionByToken, getSessionByToken } from './repo';
import type { SessionInfo } from './types';

export const getAdminSessionInfo = async (token?: string | null): Promise<SessionInfo> => {
  if (!token) {
    return { ok: true, adminEmail: null };
  }
  const row = await getSessionByToken(token);
  if (!row) {
    return { ok: true, adminEmail: null };
  }
  const expiresAt = row.expiresAt ? new Date(row.expiresAt).getTime() : 0;
  if (expiresAt && expiresAt <= Date.now()) {
    await deleteSessionByToken(token);
    return { ok: true, adminEmail: null };
  }
  return { ok: true, adminEmail: row.email || null };
};
