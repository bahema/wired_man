import type { Handler } from '@netlify/functions';
import { runAutomationScheduler } from '../../src/services/automationService';

export const handler: Handler = async () => {
  try {
    await runAutomationScheduler();
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Automation scheduler failed'
      })
    };
  }
};
