import crypto from 'crypto';
import db from '../../../db';
import { normalizeUploadUrl, resolveOptionalUpload } from '../utils';
import { emitContentUpdate } from '../../../events';

type DbRow = Record<string, any>;

export const listTestimonials = async () => {
  const rows = await db.many<DbRow>('SELECT * FROM testimonials ORDER BY createdAt DESC');
  return rows;
};

export const createTestimonial = async (payload: Record<string, unknown>) => {
  const { authorName, authorRole, authorLocation, quote, avatarUrl, rating, isFeatured, status } = payload;
  if (!authorName || !quote) {
    return { error: 'Missing required fields' };
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO testimonials (
      id, authorName, authorRole, authorLocation, quote, avatarUrl,
      rating, isFeatured, status, createdAt
    ) VALUES (
      @id, @authorName, @authorRole, @authorLocation, @quote, @avatarUrl,
      @rating, @isFeatured, @status, @createdAt
    )`,
    {
    id,
    authorName,
    authorRole: authorRole || null,
    authorLocation: authorLocation || null,
    quote,
    avatarUrl: normalizeUploadUrl(typeof avatarUrl === 'string' ? avatarUrl : null),
    rating: rating ?? null,
    isFeatured: isFeatured ? 1 : 0,
    status: status || 'draft',
    createdAt: now
    }
  );
  const row = await db.one<DbRow>('SELECT * FROM testimonials WHERE id = ?', [id]);
  emitContentUpdate('testimonials');
  return { row };
};

export const updateTestimonial = async (id: string, payload: Record<string, unknown>) => {
  const existing = await db.one<DbRow>('SELECT * FROM testimonials WHERE id = ?', [id]);
  if (!existing) {
    return { error: 'Not found', status: 404 };
  }
  await db.exec(
    `UPDATE testimonials SET
      authorName = @authorName,
      authorRole = @authorRole,
      authorLocation = @authorLocation,
      quote = @quote,
      avatarUrl = @avatarUrl,
      rating = @rating,
      isFeatured = @isFeatured,
      status = @status
    WHERE id = @id`,
    {
    id,
    authorName: payload.authorName || existing.authorName,
    authorRole: payload.authorRole ?? existing.authorRole,
    authorLocation: payload.authorLocation ?? existing.authorLocation,
    quote: payload.quote || existing.quote,
    avatarUrl: resolveOptionalUpload(payload.avatarUrl, existing.avatarUrl),
    rating: payload.rating ?? existing.rating,
    isFeatured: payload.isFeatured ? 1 : 0,
    status: payload.status || existing.status
    }
  );
  const row = await db.one<DbRow>('SELECT * FROM testimonials WHERE id = ?', [id]);
  emitContentUpdate('testimonials');
  return { row };
};

export const deleteTestimonial = async (id: string) => {
  const result = await db.exec('DELETE FROM testimonials WHERE id = ?', [id]);
  if (result.rowCount === 0) {
    return { error: 'Not found', status: 404 };
  }
  emitContentUpdate('testimonials');
  return { deleted: id };
};
