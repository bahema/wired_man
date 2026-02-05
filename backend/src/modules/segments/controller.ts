import type { Request, Response } from 'express';
import { addSegmentsStreamClient } from '../../services/segmentsLiveService';
import {
  createSavedSegment,
  createSegmentsExport,
  deleteSavedSegment,
  getSegmentDetail,
  getSegmentsExportJob,
  getSegmentsSummary,
  listSavedSegments,
  listSegmentsExports,
  renameSavedSegment
} from './service';

export const getSegmentsSummaryHandler = async (_req: Request, res: Response) => {
  return res.json(await getSegmentsSummary());
};

export const getSegmentsStream = async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`event: segments\ndata: ${JSON.stringify(await getSegmentsSummary())}\n\n`);
  addSegmentsStreamClient(res);
};

export const getSegmentDetailHandler = async (req: Request, res: Response) => {
  const result = await getSegmentDetail(req.query as Record<string, unknown>);
  if ('error' in result) {
    return res.status(Number(result.status ?? 400)).json({ error: result.error });
  }
  return res.json(result);
};

export const postSegmentsExport = async (req: Request, res: Response) => {
  const result = await createSegmentsExport(req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(Number(result.status ?? 400)).json({ error: result.error });
  }
  return res.status(201).json(result);
};

export const getSegmentsExport = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await getSegmentsExportJob(id);
  if ('error' in result) {
    return res.status(Number(result.status ?? 400)).json({ error: result.error });
  }
  return res.json(result);
};

export const getSegmentsExports = async (req: Request, res: Response) => {
  const limit = Number(req.query.limit || 50);
  return res.json(await listSegmentsExports(limit));
};

export const getSavedSegments = async (_req: Request, res: Response) => {
  return res.json(await listSavedSegments());
};

export const postSavedSegment = async (req: Request, res: Response) => {
  const result = await createSavedSegment(req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(Number(result.status ?? 400)).json({ error: result.error });
  }
  return res.status(201).json(result);
};

export const putSavedSegment = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await renameSavedSegment(id, req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(Number(result.status ?? 400)).json({ error: result.error });
  }
  return res.json(result);
};

export const removeSavedSegment = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await deleteSavedSegment(id);
  if ('error' in result) {
    return res.status(Number(result.status ?? 400)).json({ error: result.error });
  }
  return res.json(result);
};
