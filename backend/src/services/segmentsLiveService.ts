import { Response } from 'express';
import { getSegmentsSummaryCached, refreshSegmentsSummaryCache } from './segmentsSummaryService';

const clients = new Set<Response>();

export const addSegmentsStreamClient = (res: Response) => {
  clients.add(res);
  res.on('close', () => {
    clients.delete(res);
  });
};

export const broadcastSegmentsUpdate = async () => {
  const payload = JSON.stringify(await getSegmentsSummaryCached());
  clients.forEach((client) => {
    client.write(`event: segments\ndata: ${payload}\n\n`);
  });
};

export const startSegmentsLiveTicker = (intervalMs = 15000) => {
  const timer = setInterval(() => {
    void refreshSegmentsSummaryCache();
    void broadcastSegmentsUpdate();
  }, intervalMs);
  return timer;
};
