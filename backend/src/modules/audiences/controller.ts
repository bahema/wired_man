import type { Request, Response } from 'express';
import { getAudiencesSummary } from './service';

export const getAudiencesSummaryHandler = async (_req: Request, res: Response) => {
  return res.json(await getAudiencesSummary());
};
