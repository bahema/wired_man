import type { Request, Response } from 'express';
import { createFeaturedSlot, deleteFeaturedSlot, listFeaturedSlots, updateFeaturedSlot } from './service';

export const getFeaturedSlots = async (_req: Request, res: Response) => {
  return res.json(await listFeaturedSlots());
};

export const postFeaturedSlot = async (req: Request, res: Response) => {
  const result = await createFeaturedSlot(req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.row);
};

export const putFeaturedSlot = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await updateFeaturedSlot(id, req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result.row);
};

export const removeFeaturedSlot = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await deleteFeaturedSlot(id);
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result);
};
