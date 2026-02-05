import type { Request, Response } from 'express';
import { getHero, upsertHero } from './service';

export const getHeroHandler = async (_req: Request, res: Response) => {
  return res.json(await getHero());
};

export const putHeroHandler = async (req: Request, res: Response) => {
  const result = await upsertHero(req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(400).json({ error: result.error });
  }
  return res.json(result.row);
};
