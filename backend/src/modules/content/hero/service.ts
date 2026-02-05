import crypto from 'crypto';
import db from '../../../db';
import { normalizeUploadUrl } from '../utils';
import { emitContentUpdate } from '../../../events';

type DbRow = Record<string, any>;

export const getHero = async () => {
  const row = await db.one<DbRow>(
    'SELECT * FROM hero_config WHERE isActive = 1 ORDER BY updatedAt DESC LIMIT 1'
  );
  return row || null;
};

export const upsertHero = async (payload: Record<string, unknown>) => {
  if (!payload.title || !payload.subtitle || !payload.primaryCtaLabel || !payload.primaryCtaAction) {
    return { error: 'Missing required fields' };
  }
  const id = typeof payload.id === 'string' ? payload.id : crypto.randomUUID();
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO hero_config (
      id, isActive, theme, title, subtitle, highlightText, backgroundImageUrl, heroBadge,
      primaryCtaLabel, primaryCtaAction, primaryCtaLink, secondaryCtaLabel, secondaryCtaLink, updatedAt
    ) VALUES (
      @id, @isActive, @theme, @title, @subtitle, @highlightText, @backgroundImageUrl, @heroBadge,
      @primaryCtaLabel, @primaryCtaAction, @primaryCtaLink, @secondaryCtaLabel, @secondaryCtaLink, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      isActive = excluded.isActive,
      theme = excluded.theme,
      title = excluded.title,
      subtitle = excluded.subtitle,
      highlightText = excluded.highlightText,
      backgroundImageUrl = excluded.backgroundImageUrl,
      heroBadge = excluded.heroBadge,
      primaryCtaLabel = excluded.primaryCtaLabel,
      primaryCtaAction = excluded.primaryCtaAction,
      primaryCtaLink = excluded.primaryCtaLink,
      secondaryCtaLabel = excluded.secondaryCtaLabel,
      secondaryCtaLink = excluded.secondaryCtaLink,
      updatedAt = excluded.updatedAt
    `,
    {
    id,
    isActive: payload.isActive === false ? 0 : 1,
    theme: payload.theme || 'general',
    title: payload.title,
    subtitle: payload.subtitle,
    highlightText: payload.highlightText || null,
    backgroundImageUrl: normalizeUploadUrl(
      typeof payload.backgroundImageUrl === 'string' ? payload.backgroundImageUrl : null
    ),
    heroBadge: payload.heroBadge || null,
    primaryCtaLabel: payload.primaryCtaLabel,
    primaryCtaAction: payload.primaryCtaAction,
    primaryCtaLink: payload.primaryCtaLink || null,
    secondaryCtaLabel: payload.secondaryCtaLabel || null,
    secondaryCtaLink: payload.secondaryCtaLink || null,
    updatedAt: now
    }
  );
  const row = await db.one<DbRow>('SELECT * FROM hero_config WHERE id = ? LIMIT 1', [id]);
  emitContentUpdate('hero');
  return { row };
};
