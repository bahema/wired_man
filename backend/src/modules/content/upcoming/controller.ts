import type { Request, Response } from 'express';
import { createUpcoming, deleteUpcoming, listUpcoming, updateUpcoming } from './service';

export const getUpcoming = async (_req: Request, res: Response) => {
  return res.json(await listUpcoming());
};

export const postUpcoming = async (req: Request, res: Response) => {
  const result = await createUpcoming(req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.row);
};

export const putUpcoming = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await updateUpcoming(id, req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result.row);
};

export const removeUpcoming = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await deleteUpcoming(id);
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result);
};
