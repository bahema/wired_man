import type { Handler } from '@netlify/functions';
import { processEmailQueueOnce } from '../../src/services/emailCampaignService';

export const handler: Handler = async () => {
  try {
    const result = await processEmailQueueOnce(25);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ...result })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Email queue failed'
      })
    };
  }
};
