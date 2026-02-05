import { Request, Response, NextFunction } from 'express';
import { ADMIN_API_KEY } from '../config/env';

export const requireAdminKey = (req: Request, res: Response, next: NextFunction) => {
  if (!ADMIN_API_KEY) {
    return next();
  }
  const header = req.headers['x-admin-key'];
  const key = Array.isArray(header) ? header[0] : header;
  if (key && key === ADMIN_API_KEY) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
};
