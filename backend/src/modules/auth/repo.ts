import db from '../../db';
import type { SessionRow } from './types';

export const getSessionByToken = async (token: string) =>
  db.one<SessionRow>(
    `SELECT admin_users.email as email,
            admin_sessions.expiresAt as expiresAt
     FROM admin_sessions
     JOIN admin_users ON admin_sessions.adminId = admin_users.id
     WHERE admin_sessions.token = ?
     LIMIT 1`,
    [token]
  );

export const deleteSessionByToken = async (token: string) => {
  await db.exec('DELETE FROM admin_sessions WHERE token = ?', [token]);
};
