import crypto from 'crypto';
import db from '../../../db';
import { normalizeUploadUrl, resolveOptionalUpload } from '../utils';
import { emitContentUpdate } from '../../../events';

type DbRow = Record<string, any>;

export const listFeaturedSlots = async () => {
  const rows = await db.many<DbRow>('SELECT * FROM featured_slots ORDER BY sortOrder ASC');
  return rows;
};

export const createFeaturedSlot = async (payload: Record<string, unknown>) => {
  const {
    label,
    productId,
    title,
    subtitle,
    imageUrl,
    priceText,
    ctaLabel,
    ctaAction,
    ctaLink,
    sortOrder,
    isActive
  } = payload;
  if (!label || !ctaLabel || !ctaAction) {
    return { error: 'Missing required fields' };
  }
  const id = crypto.randomUUID();
  await db.exec(
    `INSERT INTO featured_slots (
      id, label, productId, title, subtitle, imageUrl, priceText, ctaLabel, ctaAction, ctaLink, sortOrder, isActive
    ) VALUES (
      @id, @label, @productId, @title, @subtitle, @imageUrl, @priceText, @ctaLabel, @ctaAction, @ctaLink, @sortOrder, @isActive
    )`,
    {
    id,
    label,
    productId: productId || null,
    title: title || null,
    subtitle: subtitle || null,
    imageUrl: normalizeUploadUrl(typeof imageUrl === 'string' ? imageUrl : null),
    priceText: typeof priceText === 'string' ? priceText : null,
    ctaLabel,
    ctaAction,
    ctaLink: ctaLink || null,
    sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
    isActive: isActive === false ? 0 : 1
    }
  );
  const row = await db.one<DbRow>('SELECT * FROM featured_slots WHERE id = ? LIMIT 1', [id]);
  emitContentUpdate('featured');
  return { row };
};

export const updateFeaturedSlot = async (id: string, payload: Record<string, unknown>) => {
  const existing = await db.one<DbRow>('SELECT * FROM featured_slots WHERE id = ? LIMIT 1', [id]);
  if (!existing) {
    return { error: 'Not found', status: 404 };
  }
  await db.exec(
    `UPDATE featured_slots SET
      label = @label,
      productId = @productId,
      title = @title,
      subtitle = @subtitle,
      imageUrl = @imageUrl,
      priceText = @priceText,
      ctaLabel = @ctaLabel,
      ctaAction = @ctaAction,
      ctaLink = @ctaLink,
      sortOrder = @sortOrder,
      isActive = @isActive
    WHERE id = @id`,
    {
    id,
    label: payload.label || existing.label,
    productId: payload.productId ?? existing.productId,
    title: payload.title ?? existing.title,
    subtitle: payload.subtitle ?? existing.subtitle,
    imageUrl: resolveOptionalUpload(payload.imageUrl, existing.imageUrl),
    priceText: payload.priceText ?? existing.priceText,
    ctaLabel: payload.ctaLabel || existing.ctaLabel,
    ctaAction: payload.ctaAction || existing.ctaAction,
    ctaLink: payload.ctaLink ?? existing.ctaLink,
    sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : existing.sortOrder,
    isActive: payload.isActive === false ? 0 : 1
    }
  );
  const row = await db.one<DbRow>('SELECT * FROM featured_slots WHERE id = ? LIMIT 1', [id]);
  emitContentUpdate('featured');
  return { row };
};

export const deleteFeaturedSlot = async (id: string) => {
  const result = await db.exec('DELETE FROM featured_slots WHERE id = ?', [id]);
  if (result.rowCount === 0) {
    return { error: 'Not found', status: 404 };
  }
  emitContentUpdate('featured');
  return { deleted: id };
};
