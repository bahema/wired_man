import { Response } from 'express';
import { getSourcesSummaryCached, refreshSourcesSummaryCache } from './sourcesSummaryService';

const clients = new Set<Response>();

export const addSourcesStreamClient = (res: Response) => {
  clients.add(res);
  res.on('close', () => {
    clients.delete(res);
  });
};

export const broadcastSourcesUpdate = async () => {
  const payload = JSON.stringify(await getSourcesSummaryCached());
  clients.forEach((client) => {
    client.write(`event: sources\ndata: ${payload}\n\n`);
  });
};

export const startSourcesLiveTicker = (intervalMs = 15000) => {
  const timer = setInterval(() => {
    void refreshSourcesSummaryCache();
    void broadcastSourcesUpdate();
  }, intervalMs);
  return timer;
};
