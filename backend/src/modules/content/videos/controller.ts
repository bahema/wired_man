import type { Request, Response } from 'express';
import { createVideo, deleteVideo, listVideos, updateVideo } from './service';

export const getVideos = async (_req: Request, res: Response) => {
  return res.json(await listVideos());
};

export const postVideo = async (req: Request, res: Response) => {
  const result = await createVideo(req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.row);
};

export const putVideo = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await updateVideo(id, req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result.row);
};

export const removeVideo = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await deleteVideo(id);
  if ('error' in result) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json(result);
};
