import type { Request, Response } from 'express';
import { addSourcesStreamClient } from '../../services/sourcesLiveService';
import {
  createSourceAlias,
  createSourcesExport,
  createSourcesExportSchedule,
  deleteSourceAlias,
  deleteSourcesExportSchedule,
  getSourceDetail,
  getSourcesSummary,
  listSourceAliases,
  listSourcesExportSchedules,
  listSourcesExports,
  suggestSourceAlias
} from './service';

export const getSourcesSummaryHandler = async (_req: Request, res: Response) => {
  return res.json(await getSourcesSummary());
};

export const getSourcesStream = async (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`event: sources\ndata: ${JSON.stringify(await getSourcesSummary())}\n\n`);
  addSourcesStreamClient(res);
};

export const getSourceAliases = async (_req: Request, res: Response) => {
  return res.json(await listSourceAliases());
};

export const postSourceAliasSuggest = async (req: Request, res: Response) => {
  const result = await suggestSourceAlias(req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(Number(result.status ?? 400)).json({ error: result.error });
  }
  return res.json(result);
};

export const postSourceAlias = async (req: Request, res: Response) => {
  const result = await createSourceAlias(req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(Number(result.status ?? 400)).json({ error: result.error });
  }
  return res.status(201).json(result);
};

export const removeSourceAlias = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await deleteSourceAlias(id);
  if ('error' in result) {
    return res.status(Number(result.status ?? 400)).json({ error: result.error });
  }
  return res.json(result);
};

export const getSourceDetailHandler = async (req: Request, res: Response) => {
  const result = await getSourceDetail(req.query as Record<string, unknown>);
  if ('error' in result) {
    return res.status(Number(result.status ?? 400)).json({ error: result.error });
  }
  return res.json(result);
};

export const postSourcesExport = async (req: Request, res: Response) => {
  const result = await createSourcesExport(req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(Number(result.status ?? 400)).json({ error: result.error });
  }
  return res.status(201).json(result);
};

export const getSourcesExports = async (req: Request, res: Response) => {
  const limit = Number(req.query.limit || 50);
  return res.json(await listSourcesExports(limit));
};

export const getSourcesExportSchedules = async (req: Request, res: Response) => {
  return res.json(await listSourcesExportSchedules(req.query as Record<string, unknown>));
};

export const postSourcesExportSchedule = async (req: Request, res: Response) => {
  const result = await createSourcesExportSchedule(req.body as Record<string, unknown>);
  if ('error' in result) {
    return res.status(Number(result.status ?? 400)).json({ error: result.error });
  }
  return res.status(201).json(result);
};

export const removeSourcesExportSchedule = async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await deleteSourcesExportSchedule(id);
  if ('error' in result) {
    return res.status(Number(result.status ?? 400)).json({ error: result.error });
  }
  return res.json(result);
};
