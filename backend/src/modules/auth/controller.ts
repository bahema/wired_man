import type { Request, Response } from 'express';
import { getAdminSessionInfo } from './service';

export const getSession = async (req: Request, res: Response) => {
  const header = req.headers['x-admin-session'];
  const token = Array.isArray(header) ? header[0] : header;
  const payload = await getAdminSessionInfo(token || null);
  return res.json(payload);
};
