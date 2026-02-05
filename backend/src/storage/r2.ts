import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';

const R2_ENDPOINT = process.env.R2_ENDPOINT || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_BUCKET || '';
const R2_PREFIX = process.env.R2_PREFIX || 'uploads/';

const missingConfig = () => {
  const missing: string[] = [];
  if (!R2_ENDPOINT) missing.push('R2_ENDPOINT');
  if (!R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
  if (!R2_BUCKET) missing.push('R2_BUCKET');
  return missing;
};

const getClient = () => {
  const missing = missingConfig();
  if (missing.length) {
    throw new Error(`Missing R2 configuration: ${missing.join(', ')}`);
  }
  return new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });
};

const normalizeKey = (name: string) => {
  const cleaned = name.replace(/^\/+/, '');
  if (cleaned.startsWith(R2_PREFIX)) return cleaned;
  return `${R2_PREFIX.replace(/\/?$/, '/')}${cleaned}`;
};

export const uploadBuffer = async (name: string, buffer: Buffer, contentType: string) => {
  const client = getClient();
  const key = normalizeKey(name);
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType
    })
  );
  return { key };
};

const streamToBuffer = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve());
    stream.on('error', (err) => reject(err));
  });
  return Buffer.concat(chunks);
};

export const getObjectBuffer = async (name: string) => {
  const client = getClient();
  const key = normalizeKey(name);
  const response = await client.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key
    })
  );
  const body = response.Body;
  if (!body) return null;
  if (Buffer.isBuffer(body)) return body;
  if (typeof (body as any).arrayBuffer === 'function') {
    const buf = await (body as any).arrayBuffer();
    return Buffer.from(buf);
  }
  return streamToBuffer(body as Readable);
};

export const getObjectText = async (name: string) => {
  const buffer = await getObjectBuffer(name);
  return buffer ? buffer.toString('utf8') : null;
};

export const uploadText = async (name: string, text: string, contentType = 'text/plain; charset=utf-8') => {
  return uploadBuffer(name, Buffer.from(text, 'utf8'), contentType);
};

export const deleteObject = async (name: string) => {
  const client = getClient();
  const key = normalizeKey(name);
  await client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key
    })
  );
  return { key };
};

export const objectExists = async (name: string) => {
  const client = getClient();
  const key = normalizeKey(name);
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET,
        Key: key
      })
    );
    return true;
  } catch {
    return false;
  }
};

export const listObjects = async () => {
  const client = getClient();
  const prefix = R2_PREFIX.replace(/\/?$/, '/');
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: prefix
    })
  );
  const contents = response.Contents || [];
  return contents
    .map((item) => item.Key || '')
    .filter((key) => key && key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
};
