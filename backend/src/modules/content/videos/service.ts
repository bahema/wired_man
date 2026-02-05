import crypto from 'crypto';
import db from '../../../db';
import { normalizeUploadUrl, resolveOptionalUpload } from '../utils';
import { emitContentUpdate } from '../../../events';

type DbRow = Record<string, any>;

const isValidUrl = (value?: string | null) => {
  if (!value) return false;
  if (value.startsWith('/')) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

export const listVideos = async () => {
  const rows = await db.many<DbRow>('SELECT * FROM videos ORDER BY sortOrder ASC, updatedAt DESC');
  return rows;
};

export const createVideo = async (payload: Record<string, unknown>) => {
  const { title, description, src, poster, isActive, sortOrder, isNew } = payload;
  if (!title || typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 80) {
    return { error: 'Title must be 3-80 characters' };
  }
  if (!src || typeof src !== 'string' || !isValidUrl(src)) {
    return { error: 'Valid video URL is required' };
  }
  if (poster && typeof poster === 'string' && !isValidUrl(poster)) {
    return { error: 'Poster must be a valid URL' };
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO videos (
      id, title, description, src, poster, isActive, sortOrder, isNew, createdAt, updatedAt
    ) VALUES (
      @id, @title, @description, @src, @poster, @isActive, @sortOrder, @isNew, @createdAt, @updatedAt
    )`,
    {
    id,
    title: title.trim(),
    description: typeof description === 'string' ? description.trim() : null,
    src,
    poster: normalizeUploadUrl(typeof poster === 'string' ? poster : null),
    isActive: isActive === false ? 0 : 1,
    sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
    isNew: isNew ? 1 : 0,
    createdAt: now,
    updatedAt: now
    }
  );
  const row = await db.one<DbRow>('SELECT * FROM videos WHERE id = ?', [id]);
  emitContentUpdate('videos');
  return { row };
};

export const updateVideo = async (id: string, payload: Record<string, unknown>) => {
  const existing = await db.one<DbRow>('SELECT * FROM videos WHERE id = ?', [id]);
  if (!existing) {
    return { error: 'Not found', status: 404 };
  }
  const { title, description, src, poster, isActive, sortOrder, isNew } = payload;
  if (title && typeof title === 'string' && (title.trim().length < 3 || title.trim().length > 80)) {
    return { error: 'Title must be 3-80 characters' };
  }
  if (src && typeof src === 'string' && !isValidUrl(src)) {
    return { error: 'Valid video URL is required' };
  }
  if (poster && typeof poster === 'string' && !isValidUrl(poster)) {
    return { error: 'Poster must be a valid URL' };
  }
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE videos SET
      title = @title,
      description = @description,
      src = @src,
      poster = @poster,
      isActive = @isActive,
      sortOrder = @sortOrder,
      isNew = @isNew,
      updatedAt = @updatedAt
    WHERE id = @id`,
    {
    id,
    title: typeof title === 'string' ? title.trim() : existing.title,
    description: typeof description === 'string' ? description.trim() : existing.description,
    src: typeof src === 'string' ? src : existing.src,
    poster: resolveOptionalUpload(poster, existing.poster),
    isActive: isActive === false ? 0 : 1,
    sortOrder: typeof sortOrder === 'number' ? sortOrder : existing.sortOrder,
    isNew: isNew ? 1 : 0,
    updatedAt: now
    }
  );
  const row = await db.one<DbRow>('SELECT * FROM videos WHERE id = ?', [id]);
  emitContentUpdate('videos');
  return { row };
};

export const deleteVideo = async (id: string) => {
  const result = await db.exec('DELETE FROM videos WHERE id = ?', [id]);
  if (result.rowCount === 0) {
    return { error: 'Not found', status: 404 };
  }
  emitContentUpdate('videos');
  return { deleted: id };
};
