import crypto from 'crypto';
import db from '../db';
import { buildAudienceFilter } from './audience';
import { enqueueCampaignJobs, updateCampaignStatus } from './emailCampaignService';
import { DEBUG_LOGS_ENABLED, LEGACY_CAMPAIGN_BRIDGE_ENABLED } from '../config/env';

type DbRow = Record<string, any>;

const LEGACY_TEMPLATE_ID = 'legacy-bridge-template';
let loggedBridgeDisabled = false;

const ensureLegacyTemplate = async () => {
  const existing = await db.one<DbRow>('SELECT id FROM email_templates WHERE id = ?', [LEGACY_TEMPLATE_ID]);
  if (existing) return LEGACY_TEMPLATE_ID;
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO email_templates (
      id, name, subjectDefault, html, category, tags, thumbnailUrl, createdAt, updatedAt
    ) VALUES (
      @id, @name, @subjectDefault, @html, @category, @tags, @thumbnailUrl, @createdAt, @updatedAt
    )`,
    {
    id: LEGACY_TEMPLATE_ID,
    name: 'Legacy Bridge Template',
    subjectDefault: 'Campaign update',
    html: '<div></div>',
    category: 'legacy',
    tags: JSON.stringify(['legacy', 'bridge']),
    thumbnailUrl: null,
    createdAt: now,
    updatedAt: now
    }
  );
  return LEGACY_TEMPLATE_ID;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const mapLegacyAudienceToFilter = (audience: string) => {
  const result = buildAudienceFilter(audience);
  if ('error' in result) {
    throw new Error(result.error);
  }
  const parsed = result.parsed as {
    source?: string;
    continents?: string[];
    countries?: string[];
  };
  const sources = parsed.source && parsed.source !== 'All sources' ? [parsed.source] : [];
  const continents = Array.isArray(parsed.continents) ? parsed.continents : [];
  const countries = Array.isArray(parsed.countries)
    ? parsed.countries.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const location = !continents.length && countries.length === 1 ? countries[0] : '';
  return {
    sources,
    continents,
    countries,
    location
  };
};

const getCanonicalIdForLegacy = async (legacyId: string) => {
  const row = await db.one<DbRow>(
    'SELECT canonicalId FROM legacy_campaign_migrations WHERE legacyId = ?',
    [legacyId]
  );
  return row?.canonicalId ? String(row.canonicalId) : null;
};

const recordLegacyMigration = async (legacyId: string, canonicalId: string) => {
  await db.exec(
    `INSERT INTO legacy_campaign_migrations (legacyId, canonicalId, migratedAt)
     VALUES (@legacyId, @canonicalId, @migratedAt)
     ON CONFLICT (legacyId) DO UPDATE SET canonicalId = EXCLUDED.canonicalId, migratedAt = EXCLUDED.migratedAt`,
    {
    legacyId,
    canonicalId,
    migratedAt: new Date().toISOString()
    }
  );
};

const ensureCanonicalCampaign = async (legacy: DbRow, now: string) => {
  const legacyId = String(legacy.id);
  const existingCanonicalId = await getCanonicalIdForLegacy(legacyId);
  if (existingCanonicalId) {
    const canonical = await db.one<DbRow>('SELECT id FROM email_campaigns WHERE id = ?', [
      existingCanonicalId
    ]);
    if (canonical) {
      return existingCanonicalId;
    }
  }

  const templateId = await ensureLegacyTemplate();
  const subject = typeof legacy.subject === 'string' && legacy.subject.trim()
    ? legacy.subject.trim()
    : 'Campaign update';
  const rawHtml = typeof legacy.bodyHtml === 'string' ? legacy.bodyHtml.trim() : '';
  const rawText = typeof legacy.bodyText === 'string' ? legacy.bodyText.trim() : '';
  const htmlOverride = rawHtml || (rawText ? `<pre>${escapeHtml(rawText)}</pre>` : '');
  const audience = typeof legacy.audience === 'string' ? legacy.audience.trim() : '';
  if (!audience) {
    throw new Error('Audience is required');
  }
  const filterJson = JSON.stringify(mapLegacyAudienceToFilter(audience));
  const canonicalId = crypto.randomUUID();
  await db.exec(
    `INSERT INTO email_campaigns (
      id, name, templateId, subject, htmlOverride, abEnabled, subjectA, subjectB, templateIdA, templateIdB, splitRatio,
      status, filterJson, scheduledAt, createdAt, updatedAt
    ) VALUES (
      @id, @name, @templateId, @subject, @htmlOverride, @abEnabled, @subjectA, @subjectB, @templateIdA, @templateIdB, @splitRatio,
      @status, @filterJson, @scheduledAt, @createdAt, @updatedAt
    )`,
    {
    id: canonicalId,
    name: typeof legacy.name === 'string' && legacy.name.trim() ? legacy.name.trim() : `Legacy Campaign ${legacyId}`,
    templateId,
    subject,
    htmlOverride: htmlOverride || null,
    abEnabled: 0,
    subjectA: subject,
    subjectB: subject,
    templateIdA: templateId,
    templateIdB: null,
    splitRatio: 50,
    status: 'draft',
    filterJson,
    scheduledAt: typeof legacy.scheduledAt === 'string' ? legacy.scheduledAt : null,
    createdAt: now,
    updatedAt: now
    }
  );
  await recordLegacyMigration(legacyId, canonicalId);
  return canonicalId;
};

const enqueueLegacyCampaign = async (legacy: DbRow, now: string) => {
  const canonicalId = await ensureCanonicalCampaign(legacy, now);
  const queued = await enqueueCampaignJobs(canonicalId, now);
  await updateCampaignStatus(canonicalId, 'sending');
  return { canonicalId, queued };
};

export const runScheduledCampaignsOnce = async () => {
  if (!LEGACY_CAMPAIGN_BRIDGE_ENABLED) {
    if (!loggedBridgeDisabled) {
      console.warn('Legacy campaign bridge disabled: skipping legacy scheduler sends.');
      loggedBridgeDisabled = true;
    }
    return;
  }
  const now = new Date().toISOString();
  const pendingStatuses = ['scheduled'];
  const scheduled = await db.many<DbRow>(
    `SELECT * FROM campaigns
     WHERE status IN (${pendingStatuses.map(() => '?').join(', ')})
       AND scheduledAt IS NOT NULL
       AND scheduledAt <= ?
       AND (sentAt IS NULL OR sentAt = '')`,
    [...pendingStatuses, now]
  );

  if (DEBUG_LOGS_ENABLED) {
    console.warn(
      `[legacy-scheduler] pending=${scheduled.length} at=${now}`
    );
  }

  for (const campaign of scheduled) {
    try {
      const { queued } = await enqueueLegacyCampaign(campaign, now);
      await db.exec(
        `UPDATE campaigns SET
          status = 'queued',
          updatedAt = @updatedAt
        WHERE id = @id`,
        {
        id: campaign.id,
        updatedAt: now
        }
      );
      console.log(`Legacy campaign bridged: ${campaign.id} (queued ${queued})`);
    } catch (error) {
      console.error(
        `Legacy campaign bridge failed: ${campaign.id}`,
        error instanceof Error ? error.message : error
      );
    }
  }
};

export const startCampaignScheduler = (intervalMs = 60000) => {
  const tick = async () => {
    try {
      await runScheduledCampaignsOnce();
    } catch (error) {
      console.error('Campaign scheduler error', error);
    }
  };
  void tick();
  return setInterval(tick, intervalMs);
};
