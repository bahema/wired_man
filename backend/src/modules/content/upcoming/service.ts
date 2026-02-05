import crypto from 'crypto';
import db from '../../../db';
import { normalizeUploadUrl, resolveOptionalUpload } from '../utils';
import { emitContentUpdate } from '../../../events';

type DbRow = Record<string, any>;

export const listUpcoming = async () => {
  const rows = await db.many<DbRow>('SELECT * FROM upcoming_products ORDER BY sortOrder ASC, createdAt DESC');
  return rows;
};

export const createUpcoming = async (payload: Record<string, unknown>) => {
  const { title, dateLabel, details, imageUrl, isActive, isNew, sortOrder } = payload;
  if (!title || !dateLabel || !details) {
    return { error: 'Missing required fields' };
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO upcoming_products (
      id, title, dateLabel, details, imageUrl, isActive, isNew, sortOrder, createdAt
    ) VALUES (
      @id, @title, @dateLabel, @details, @imageUrl, @isActive, @isNew, @sortOrder, @createdAt
    )`,
    {
    id,
    title,
    dateLabel,
    details,
    imageUrl: normalizeUploadUrl(typeof imageUrl === 'string' ? imageUrl : null),
    isActive: isActive === false ? 0 : 1,
    isNew: isNew ? 1 : 0,
    sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
    createdAt: now
    }
  );
  const row = await db.one<DbRow>('SELECT * FROM upcoming_products WHERE id = ?', [id]);
  emitContentUpdate('upcoming');
  return { row };
};

export const updateUpcoming = async (id: string, payload: Record<string, unknown>) => {
  const existing = await db.one<DbRow>('SELECT * FROM upcoming_products WHERE id = ?', [id]);
  if (!existing) {
    return { error: 'Not found', status: 404 };
  }
  await db.exec(
    `UPDATE upcoming_products SET
      title = @title,
      dateLabel = @dateLabel,
      details = @details,
      imageUrl = @imageUrl,
      isActive = @isActive,
      isNew = @isNew,
      sortOrder = @sortOrder
    WHERE id = @id`,
    {
    id,
    title: payload.title || existing.title,
    dateLabel: payload.dateLabel || existing.dateLabel,
    details: payload.details || existing.details,
    imageUrl: resolveOptionalUpload(payload.imageUrl, existing.imageUrl),
    isActive: payload.isActive === false ? 0 : 1,
    isNew: payload.isNew ? 1 : 0,
    sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : existing.sortOrder
    }
  );
  const row = await db.one<DbRow>('SELECT * FROM upcoming_products WHERE id = ?', [id]);
  emitContentUpdate('upcoming');
  return { row };
};

export const deleteUpcoming = async (id: string) => {
  const result = await db.exec('DELETE FROM upcoming_products WHERE id = ?', [id]);
  if (result.rowCount === 0) {
    return { error: 'Not found', status: 404 };
  }
  emitContentUpdate('upcoming');
  return { deleted: id };
};
