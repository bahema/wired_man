import {
  PORT,
  LEGACY_SCHEDULER_ENABLED,
  CLICK_BACKFILL_ON_STARTUP,
  DROP_CLICKS_TABLE,
  validateConfig
} from './config/env';
import './db';
import { startCampaignScheduler } from './services/campaignScheduler';
import { startEmailJobWorker } from './services/emailCampaignService';
import { runAutomationScheduler } from './services/automationService';
import { startExportJobWorker } from './services/exportJobService';
import { dropClicksTable, runClickBackfill } from './services/clickBackfillService';
import { startSegmentsSummaryScheduler } from './services/segmentsSummaryService';
import { startSegmentsLiveTicker } from './services/segmentsLiveService';
import { startSourcesSummaryScheduler } from './services/sourcesSummaryService';
import { startSourcesLiveTicker } from './services/sourcesLiveService';
import { startSmtpLogPruneScheduler } from './services/smtpLogPruneService';
import app from './app';

try {
  validateConfig();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Invalid configuration.';
  console.error(`Backend config error: ${message}`);
  process.exit(1);
}

// Windows port cleanup: netstat -ano | findstr :4000  then  taskkill /PID <pid> /F
const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

const isServerless = Boolean(
  process.env.NETLIFY || process.env.NETLIFY_LOCAL || process.env.AWS_LAMBDA_FUNCTION_NAME
);

const scheduler = !isServerless && LEGACY_SCHEDULER_ENABLED ? startCampaignScheduler() : null;
const segmentsScheduler = !isServerless ? startSegmentsSummaryScheduler() : null;
const segmentsLiveTicker = !isServerless ? startSegmentsLiveTicker() : null;
const sourcesScheduler = !isServerless ? startSourcesSummaryScheduler() : null;
const sourcesLiveTicker = !isServerless ? startSourcesLiveTicker() : null;
if (!isServerless) {
  startEmailJobWorker();
  startExportJobWorker();
}
const smtpLogPruner = !isServerless ? startSmtpLogPruneScheduler() : null;
if (!isServerless && CLICK_BACKFILL_ON_STARTUP) {
  void (async () => {
    try {
      const result = await runClickBackfill();
      console.log(`Click backfill complete: migrated ${result.migrated} rows.`);
      if (DROP_CLICKS_TABLE) {
        await dropClicksTable();
        console.log('Clicks table dropped.');
      }
    } catch (error) {
      console.error('Click backfill failed', error instanceof Error ? error.message : error);
    }
  })();
}
const automationTicker = !isServerless
  ? setInterval(() => {
      runAutomationScheduler();
    }, 5000)
  : null;

const shutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down.`);
  if (scheduler) {
    clearInterval(scheduler);
  }
  if (segmentsScheduler) {
    clearInterval(segmentsScheduler);
  }
  if (segmentsLiveTicker) {
    clearInterval(segmentsLiveTicker);
  }
  if (sourcesScheduler) {
    clearInterval(sourcesScheduler);
  }
  if (sourcesLiveTicker) {
    clearInterval(sourcesLiveTicker);
  }
  if (smtpLogPruner) {
    clearInterval(smtpLogPruner);
  }
  if (automationTicker) {
    clearInterval(automationTicker);
  }
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
