import type { Handler } from '@netlify/functions';
import { processExportQueueOnce } from '../../src/services/exportJobService';

export const handler: Handler = async () => {
  try {
    const result = await processExportQueueOnce();
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ...result })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Export queue failed'
      })
    };
  }
};
