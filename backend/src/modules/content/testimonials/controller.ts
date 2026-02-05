import type { Request, Response } from 'express';
import { createTestimonial, deleteTestimonial, listTestimonials, updateTestimonial } from './service';

export const getTestimonials = async (_req: Request, res: Response) => {
  return res.json(await listTestimonials());
};

export const postTestimonial = async (req: Request, res: Response) => {
  const result = await createTestimonial(req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.row);
};

export const putTestimonial = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await updateTestimonial(id, req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result.row);
};

export const removeTestimonial = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await deleteTestimonial(id);
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result);
};
