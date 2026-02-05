import type { Handler } from '@netlify/functions';
import serverless from 'serverless-http';
import app from '../../src/app';

const handler = serverless(app);

export { handler };
export default handler as Handler;
