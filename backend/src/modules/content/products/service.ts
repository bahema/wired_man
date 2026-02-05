import crypto from 'crypto';
import db from '../../../db';
import {
  normalizeAffiliateLink,
  normalizeUploadArray,
  normalizeUploadUrl,
  parseJsonArray,
  resolveOptionalUpload
} from '../utils';
import { emitContentUpdate } from '../../../events';

type DbRow = Record<string, any>;

type ProductInput = Record<string, unknown>;

export const listProducts = async (limit?: number, page?: number) => {
  const safeLimit =
    typeof limit === 'number' && Number.isFinite(limit)
      ? Math.min(200, Math.max(1, Math.floor(limit)))
      : undefined;
  const safePage =
    typeof page === 'number' && Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const params: Record<string, number> = {};
  if (safeLimit) {
    params.limit = safeLimit;
    params.offset = (safePage - 1) * safeLimit;
  }
  const countRow = await db.one<DbRow>('SELECT COUNT(*) as count FROM products');
  const rows = await db.many<DbRow>(
    safeLimit
      ? 'SELECT * FROM products ORDER BY sortOrder ASC, createdAt DESC LIMIT @limit OFFSET @offset'
      : 'SELECT * FROM products ORDER BY sortOrder ASC, createdAt DESC',
    params
  );
  const products = rows.map((row) => ({
    ...row,
    galleryUrls: parseJsonArray(row.galleryUrls)
  }));
  return { products, total: Number(countRow?.count ?? products.length) };
};

export const createProduct = async (payload: ProductInput) => {
  const {
    slug,
    name,
    tagline,
    description,
    placement,
    imageUrl,
    galleryUrls,
    affiliateLink,
    ctaLabel,
    priceText,
    rating,
    isFeatured,
    isNew,
    status,
    sortOrder
  } = payload;

  if (!slug || !name || !description || !placement) {
    return { error: 'Missing required fields' };
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const normalizedImageUrl = normalizeUploadUrl(typeof imageUrl === 'string' ? imageUrl : null);
  const normalizedGallery = normalizeUploadArray(galleryUrls);

  await db.exec(
    `INSERT INTO products (
      id, slug, name, tagline, description, category, placement, imageUrl, galleryUrls,
      affiliateLink, ctaLabel, priceText, rating, isFeatured, isNew, status, sortOrder,
      createdAt, updatedAt
    ) VALUES (
      @id, @slug, @name, @tagline, @description, @category, @placement, @imageUrl, @galleryUrls,
      @affiliateLink, @ctaLabel, @priceText, @rating, @isFeatured, @isNew, @status, @sortOrder,
      @createdAt, @updatedAt
    )`,
    {
    id,
    slug,
    name,
    tagline: tagline || null,
    description,
    category: 'general',
    placement,
    imageUrl: normalizedImageUrl,
    galleryUrls: JSON.stringify(normalizedGallery),
    affiliateLink: normalizeAffiliateLink(affiliateLink),
    ctaLabel: ctaLabel || 'Get Access',
    priceText: priceText || null,
    rating: rating ?? null,
    isFeatured: isFeatured ? 1 : 0,
    isNew: isNew ? 1 : 0,
    status: status || 'draft',
    sortOrder: typeof sortOrder === 'number' ? sortOrder : 0,
    createdAt: now,
    updatedAt: now
    }
  );

  const product = await db.one<DbRow>('SELECT * FROM products WHERE id = ?', [id]);
  emitContentUpdate('products');
  return {
    product: {
      ...product,
      galleryUrls: parseJsonArray(product.galleryUrls)
    }
  };
};

export const updateProduct = async (id: string, payload: ProductInput) => {
  const existing = await db.one<DbRow>('SELECT * FROM products WHERE id = ?', [id]);
  if (!existing) {
    return { error: 'Not found', status: 404 };
  }
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE products SET
      slug = @slug,
      name = @name,
      tagline = @tagline,
      description = @description,
      placement = @placement,
      imageUrl = @imageUrl,
      galleryUrls = @galleryUrls,
      affiliateLink = @affiliateLink,
      ctaLabel = @ctaLabel,
      priceText = @priceText,
      rating = @rating,
      isFeatured = @isFeatured,
      isNew = @isNew,
      status = @status,
      sortOrder = @sortOrder,
      updatedAt = @updatedAt
    WHERE id = @id`,
    {
    id,
    slug: payload.slug || existing.slug,
    name: payload.name || existing.name,
    tagline: payload.tagline ?? existing.tagline,
    description: payload.description || existing.description,
    placement: payload.placement || existing.placement,
    imageUrl: resolveOptionalUpload(payload.imageUrl, existing.imageUrl),
    galleryUrls: JSON.stringify(
      payload.galleryUrls !== undefined
        ? normalizeUploadArray(payload.galleryUrls)
        : parseJsonArray(existing.galleryUrls)
    ),
    affiliateLink: normalizeAffiliateLink(payload.affiliateLink, existing.affiliateLink ?? null),
    ctaLabel: payload.ctaLabel || existing.ctaLabel,
    priceText: payload.priceText ?? existing.priceText,
    rating: payload.rating ?? existing.rating,
    isFeatured: payload.isFeatured ? 1 : 0,
    isNew: payload.isNew ? 1 : 0,
    status: payload.status || existing.status,
    sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : existing.sortOrder,
    updatedAt: now
    }
  );
  const product = await db.one<DbRow>('SELECT * FROM products WHERE id = ?', [id]);
  emitContentUpdate('products');
  return {
    product: {
      ...product,
      galleryUrls: parseJsonArray(product.galleryUrls)
    }
  };
};

export const deleteProduct = async (id: string) => {
  const result = await db.exec('DELETE FROM products WHERE id = ?', [id]);
  if (result.rowCount === 0) {
    return { error: 'Not found', status: 404 };
  }
  emitContentUpdate('products');
  return { deleted: id };
};
