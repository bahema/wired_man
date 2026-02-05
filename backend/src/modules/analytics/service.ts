import db from '../../db';
import type { AdminAnalytics } from './types';

type DbRow = Record<string, any>;

const buildDayLabels = (days: number, offsetDays = 0) => {
  const labels: string[] = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset - offsetDays)
    );
    labels.push(date.toISOString().slice(0, 10));
  }
  return labels;
};

const countByDay = (rows: DbRow[], labels: string[], dateKey: 'createdAt' | 'updatedAt' | 'unsubscribedAt' = 'createdAt') => {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const raw = typeof row[dateKey] === 'string' ? row[dateKey] : '';
    const dayKey = raw ? raw.slice(0, 10) : '';
    if (!dayKey) return;
    map.set(dayKey, (map.get(dayKey) || 0) + 1);
  });
  return labels.map((label) => map.get(label) || 0);
};

export const getAnalyticsPayload = async (
  options?: { includeUnsubscribed?: boolean }
): Promise<AdminAnalytics> => {
  const includeUnsubscribed = Boolean(options?.includeUnsubscribed);
  const dayLabels = buildDayLabels(7);
  const prevDayLabels = buildDayLabels(7, 7);
  const startDate = new Date(`${dayLabels[0]}T00:00:00.000Z`).toISOString();
  const prevStartDate = new Date(`${prevDayLabels[0]}T00:00:00.000Z`).toISOString();

  const totalSubscribersRow = await db.one<DbRow>('SELECT COUNT(*) as count FROM leads WHERE isUnsubscribed = 0');
  const totalUnsubscribedRow = await db.one<DbRow>('SELECT COUNT(*) as count FROM leads WHERE isUnsubscribed = 1');
  const totalClicksRow = await db.one<DbRow>("SELECT COUNT(*) as count FROM email_events WHERE eventType = 'click'");
  const totalOpensRow = await db.one<DbRow>("SELECT COUNT(*) as count FROM email_events WHERE eventType = 'open'");
  const totalUniqueOpenersRow = await db.one<DbRow>(
    "SELECT COUNT(DISTINCT subscriberId) as count FROM email_events WHERE eventType = 'open' AND subscriberId IS NOT NULL"
  );
  const lastWelcomeRow = await db.one<DbRow>(
    "SELECT MAX(createdAt) as lastAt FROM admin_activity WHERE action = 'welcome_email_sent'"
  );

  const newSubscribersRow = await db.one<DbRow>(
    'SELECT COUNT(*) as count FROM leads WHERE createdAt >= @start',
    { start: startDate }
  );
  const prevSubscribersRow = await db.one<DbRow>(
    'SELECT COUNT(*) as count FROM leads WHERE createdAt >= @start AND createdAt < @end',
    { start: prevStartDate, end: startDate }
  );
  const clicks7dRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_events WHERE eventType = 'click' AND createdAt >= @start",
    { start: startDate }
  );
  const prevClicks7dRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_events WHERE eventType = 'click' AND createdAt >= @start AND createdAt < @end",
    { start: prevStartDate, end: startDate }
  );
  const opens7dRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_events WHERE eventType = 'open' AND createdAt >= @start",
    { start: startDate }
  );
  const prevOpens7dRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_events WHERE eventType = 'open' AND createdAt >= @start AND createdAt < @end",
    { start: prevStartDate, end: startDate }
  );
  const uniqueOpens7dRow = await db.one<DbRow>(
    "SELECT COUNT(DISTINCT subscriberId) as count FROM email_events WHERE eventType = 'open' AND createdAt >= @start AND subscriberId IS NOT NULL",
    { start: startDate }
  );
  const prevUniqueOpens7dRow = await db.one<DbRow>(
    "SELECT COUNT(DISTINCT subscriberId) as count FROM email_events WHERE eventType = 'open' AND createdAt >= @start AND createdAt < @end AND subscriberId IS NOT NULL",
    { start: prevStartDate, end: startDate }
  );

  const leadQuery = includeUnsubscribed
    ? 'SELECT id, name, email, source, country, createdAt FROM leads WHERE createdAt >= @start ORDER BY createdAt DESC'
    : 'SELECT id, name, email, source, country, createdAt FROM leads WHERE createdAt >= @start AND isUnsubscribed = 0 ORDER BY createdAt DESC';
  const leadRows = await db.many<DbRow>(leadQuery, { start: startDate });
  const clickRows = await db.many<DbRow>(
    "SELECT id, subscriberId, campaignId, url, createdAt FROM email_events WHERE eventType = 'click' AND createdAt >= @start",
    { start: startDate }
  );
  const openRows = await db.many<DbRow>(
    "SELECT id, subscriberId, campaignId, createdAt FROM email_events WHERE eventType = 'open' AND createdAt >= @start",
    { start: startDate }
  );
  const unsubscribeRows = await db.many<DbRow>(
    'SELECT id, unsubscribedAt FROM leads WHERE isUnsubscribed = 1 AND unsubscribedAt >= @start',
    { start: startDate }
  );
  const recentSubscribersRows = await db.many<DbRow>(
    'SELECT id, name, email, phone, country, source, confirmedAt, createdAt FROM leads WHERE isUnsubscribed = 0 ORDER BY createdAt DESC LIMIT 8'
  );
  const recentSubscribers = recentSubscribersRows.map((row) => ({
    id: String(row.id),
    name: row.name ? String(row.name) : null,
    email: String(row.email || ''),
    phone: row.phone ? String(row.phone) : null,
    country: row.country ? String(row.country) : null,
    source: row.source ? String(row.source) : null,
    confirmedAt: row.confirmedAt ? String(row.confirmedAt) : null,
    createdAt: String(row.createdAt || '')
  }));

  const subscribersByDay = countByDay(leadRows, dayLabels);
  const clicksByDay = countByDay(clickRows, dayLabels);
  const opensByDay = countByDay(openRows, dayLabels);
  const unsubscribesByDay = countByDay(unsubscribeRows, dayLabels, 'unsubscribedAt');

  const sourceCounts = new Map<string, number>();
  leadRows.forEach((row) => {
    const source = typeof row.source === 'string' && row.source.trim() ? row.source.trim() : 'Unknown';
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
  });
  const sourceTotal = leadRows.length || 1;
  const sources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({
      label,
      count,
      percent: Math.round((count / sourceTotal) * 1000) / 10
    }));
  const topSources = sources.map((source) => source.label);
  const sourcesByDay = topSources.map((label) => {
    const map = new Map<string, number>();
    leadRows.forEach((row) => {
      const source = typeof row.source === 'string' && row.source.trim() ? row.source.trim() : 'Unknown';
      if (source !== label) return;
      const createdDay = typeof row.createdAt === 'string' ? row.createdAt.slice(0, 10) : '';
      if (!createdDay) return;
      map.set(createdDay, (map.get(createdDay) || 0) + 1);
    });
    return { label, counts: dayLabels.map((day) => map.get(day) || 0) };
  });

  const deliverabilityQueuedRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_jobs WHERE status = 'queued' AND createdAt >= @start",
    { start: startDate }
  );
  const deliverabilitySentRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_jobs WHERE status = 'sent' AND updatedAt >= @start",
    { start: startDate }
  );
  const deliverabilityFailedRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_jobs WHERE status = 'failed' AND updatedAt >= @start",
    { start: startDate }
  );
  const deliverabilitySkippedRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_jobs WHERE status = 'skipped' AND updatedAt >= @start",
    { start: startDate }
  );
  const prevDeliverabilityQueuedRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_jobs WHERE status = 'queued' AND createdAt >= @start AND createdAt < @end",
    { start: prevStartDate, end: startDate }
  );
  const prevDeliverabilitySentRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_jobs WHERE status = 'sent' AND updatedAt >= @start AND updatedAt < @end",
    { start: prevStartDate, end: startDate }
  );
  const prevDeliverabilityFailedRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_jobs WHERE status = 'failed' AND updatedAt >= @start AND updatedAt < @end",
    { start: prevStartDate, end: startDate }
  );
  const prevDeliverabilitySkippedRow = await db.one<DbRow>(
    "SELECT COUNT(*) as count FROM email_jobs WHERE status = 'skipped' AND updatedAt >= @start AND updatedAt < @end",
    { start: prevStartDate, end: startDate }
  );
  const sent7d = Number(deliverabilitySentRow?.count || 0);
  const failed7d = Number(deliverabilityFailedRow?.count || 0);
  const skipped7d = Number(deliverabilitySkippedRow?.count || 0);
  const failureRate = sent7d + failed7d > 0 ? Math.round((failed7d / (sent7d + failed7d)) * 1000) / 10 : 0;
  const deliveryRate = sent7d + failed7d > 0 ? Math.round((sent7d / (sent7d + failed7d)) * 1000) / 10 : 0;
  const avgSendSpeed = Math.round((sent7d / (7 * 24)) * 10) / 10;

  const deliverabilityRows = await db.many<DbRow>(
    `SELECT status, createdAt, updatedAt
     FROM email_jobs
     WHERE createdAt >= @start`,
    { start: startDate }
  );
  const queuedByDay = countByDay(deliverabilityRows.filter((row) => row.status === 'queued'), dayLabels, 'createdAt');
  const sentByDay = countByDay(deliverabilityRows.filter((row) => row.status === 'sent'), dayLabels, 'updatedAt');
  const failedByDay = countByDay(deliverabilityRows.filter((row) => row.status === 'failed'), dayLabels, 'updatedAt');
  const skippedByDay = countByDay(deliverabilityRows.filter((row) => row.status === 'skipped'), dayLabels, 'updatedAt');

  const recentErrors = await db.many<DbRow>(
    `SELECT campaignId, subscriberId, lastError, updatedAt
     FROM email_jobs
     WHERE status = 'failed' AND lastError IS NOT NULL
     ORDER BY updatedAt DESC
     LIMIT 5`
  );

  const campaignsSummaryRows = await db.many<DbRow>(
    `SELECT status, COUNT(*) as count
     FROM email_campaigns
     GROUP BY status`
  );
  const campaignsSummary: { total: number; byStatus: Record<string, number> } = campaignsSummaryRows.reduce<{
    total: number;
    byStatus: Record<string, number>;
  }>(
    (acc, row) => {
      const status = typeof row.status === 'string' ? row.status : 'unknown';
      acc.total += Number(row.count || 0);
      acc.byStatus[status] = Number(row.count || 0);
      return acc;
    },
    { total: 0, byStatus: {} as Record<string, number> }
  );

  const automationsSummaryRows = await db.many<DbRow>(
    `SELECT status, COUNT(*) as count
     FROM email_automations
     GROUP BY status`
  );
  const automationsSummary: { total: number; byStatus: Record<string, number> } = automationsSummaryRows.reduce<{
    total: number;
    byStatus: Record<string, number>;
  }>(
    (acc, row) => {
      const status = typeof row.status === 'string' ? row.status : 'unknown';
      acc.total += Number(row.count || 0);
      acc.byStatus[status] = Number(row.count || 0);
      return acc;
    },
    { total: 0, byStatus: {} as Record<string, number> }
  );

  const topCampaigns = await db.many<DbRow>(
    `SELECT c.id,
            c.name,
            SUM(CASE WHEN j.status = 'sent' THEN 1 ELSE 0 END) as sentCount,
            SUM(CASE WHEN e.eventType = 'click' THEN 1 ELSE 0 END) as clickCount,
            COUNT(DISTINCT CASE WHEN e.eventType = 'click' THEN e.subscriberId END) as uniqueClickers,
            COUNT(DISTINCT CASE WHEN e.eventType = 'open' THEN e.subscriberId END) as uniqueOpens,
            SUM(CASE WHEN e.eventType = 'open' THEN 1 ELSE 0 END) as totalOpens
     FROM email_campaigns c
     LEFT JOIN email_jobs j ON j.campaignId = c.id
     LEFT JOIN email_events e ON e.campaignId = c.id
     GROUP BY c.id
     ORDER BY clickCount DESC, sentCount DESC
     LIMIT 5`
  );

  const topAutomations = await db.many<DbRow>(
    `SELECT a.id,
            a.name,
            SUM(CASE WHEN l.status = 'sent' THEN 1 ELSE 0 END) as sentCount,
            SUM(CASE WHEN e.eventType = 'click' THEN 1 ELSE 0 END) as clickCount,
            COUNT(DISTINCT CASE WHEN e.eventType = 'click' THEN e.subscriberId END) as uniqueClickers,
            COUNT(DISTINCT CASE WHEN e.eventType = 'open' THEN e.subscriberId END) as uniqueOpens,
            SUM(CASE WHEN e.eventType = 'open' THEN 1 ELSE 0 END) as totalOpens
     FROM email_automations a
     LEFT JOIN email_automation_logs l ON l.automationId = a.id
     LEFT JOIN email_events e ON e.automationId = a.id
     GROUP BY a.id
     ORDER BY clickCount DESC, sentCount DESC
     LIMIT 5`
  );

  const topLinksLast7Days = await db.many<DbRow>(
    `SELECT url,
            COUNT(*) as clicks
     FROM email_events
     WHERE eventType = 'click' AND url IS NOT NULL AND url <> ''
       AND createdAt >= @start
     GROUP BY url
     ORDER BY clicks DESC
     LIMIT 10`,
    { start: startDate }
  );

  const topLinksAllTime = await db.many<DbRow>(
    `SELECT url,
            COUNT(*) as clicks
     FROM email_events
     WHERE eventType = 'click' AND url IS NOT NULL AND url <> ''
     GROUP BY url
     ORDER BY clicks DESC
     LIMIT 10`
  );

  const totalClickersRow = await db.one<DbRow>(
    "SELECT COUNT(DISTINCT subscriberId) as count FROM email_events WHERE eventType = 'click' AND subscriberId IS NOT NULL"
  );
  const totalSentRow = await db.one<DbRow>("SELECT COUNT(*) as count FROM email_jobs WHERE status = 'sent'");
  const totalClickers = Number(totalClickersRow?.count || 0);
  const totalClicks = Number(totalClicksRow?.count || 0);
  const totalSent = Number(totalSentRow?.count || 0);
  const clickRate = totalSent > 0 ? Math.round((totalClicks / totalSent) * 1000) / 10 : 0;

  const unsubscribes7dRow = await db.one<DbRow>(
    'SELECT COUNT(*) as count FROM leads WHERE isUnsubscribed = 1 AND unsubscribedAt >= @start',
    { start: startDate }
  );
  const prevUnsubscribes7dRow = await db.one<DbRow>(
    'SELECT COUNT(*) as count FROM leads WHERE isUnsubscribed = 1 AND unsubscribedAt >= @start AND unsubscribedAt < @end',
    { start: prevStartDate, end: startDate }
  );

  return {
    totals: {
      subscribers: Number(totalSubscribersRow?.count || 0),
      totalUnsubscribed: Number(totalUnsubscribedRow?.count || 0),
      clicksTotal: Number(totalClicksRow?.count || 0),
      opensTotal: Number(totalOpensRow?.count || 0),
      uniqueOpenersTotal: Number(totalUniqueOpenersRow?.count || 0)
    },
    last7Days: {
      subscribers: Number(newSubscribersRow?.count || 0),
      clicks: Number(clicks7dRow?.count || 0),
      opens: Number(opens7dRow?.count || 0),
      uniqueOpens: Number(uniqueOpens7dRow?.count || 0)
    },
    previous7Days: {
      subscribers: Number(prevSubscribersRow?.count || 0),
      clicks: Number(prevClicks7dRow?.count || 0),
      opens: Number(prevOpens7dRow?.count || 0),
      uniqueOpens: Number(prevUniqueOpens7dRow?.count || 0),
      unsubscribes: Number(prevUnsubscribes7dRow?.count || 0),
      deliverability: {
        queued7d: Number(prevDeliverabilityQueuedRow?.count || 0),
        sent7d: Number(prevDeliverabilitySentRow?.count || 0),
        failed7d: Number(prevDeliverabilityFailedRow?.count || 0),
        skipped7d: Number(prevDeliverabilitySkippedRow?.count || 0)
      }
    },
    trends: {
      labels: dayLabels,
      subscribersByDay,
      clicksByDay,
      opensByDay,
      unsubscribesByDay,
      sourcesByDay,
      queuedByDay,
      sentByDay,
      failedByDay,
      skippedByDay
    },
    sources,
    recentSubscribers,
    welcomeEmailLastSentAt: typeof lastWelcomeRow?.lastAt === 'string' ? lastWelcomeRow.lastAt : null,
    campaignsSummary,
    automationsSummary,
    topCampaigns: topCampaigns.map((row) => ({
      id: row.id,
      name: row.name,
      sentCount: Number(row.sentCount || 0),
      totalClicks: Number(row.clickCount || 0),
      uniqueClickers: Number(row.uniqueClickers || 0),
      uniqueOpens: Number(row.uniqueOpens || 0),
      totalOpens: Number(row.totalOpens || 0)
    })),
    topAutomations: topAutomations.map((row) => ({
      id: row.id,
      name: row.name,
      sentCount: Number(row.sentCount || 0),
      totalClicks: Number(row.clickCount || 0),
      uniqueClickers: Number(row.uniqueClickers || 0),
      uniqueOpens: Number(row.uniqueOpens || 0),
      totalOpens: Number(row.totalOpens || 0)
    })),
    topLinksLast7Days: topLinksLast7Days.map((row) => ({
      url: row.url,
      clicks: Number(row.clicks || 0)
    })),
    topLinksAllTime: topLinksAllTime.map((row) => ({
      url: row.url,
      clicks: Number(row.clicks || 0)
    })),
    campaignClickStats: {
      uniqueClickers: totalClickers,
      totalClicks,
      clickRate
    },
    deliverability: {
      queued7d: Number(deliverabilityQueuedRow?.count || 0),
      sent7d,
      failed7d,
      skipped7d,
      failureRate,
      deliveryRate,
      avgSendSpeed,
      recentErrors: recentErrors.map((row) => ({
        campaignId: row.campaignId,
        subscriberId: row.subscriberId,
        message: row.lastError,
        createdAt: row.updatedAt
      }))
    },
    unsubscribes: {
      last7Days: Number(unsubscribes7dRow?.count || 0),
      total: Number(totalUnsubscribedRow?.count || 0)
    }
  };
};

export const resetAnalyticsData = async () => {
  await db.exec('DELETE FROM leads');
  await db.exec('DELETE FROM email_events');
  await db.exec('DELETE FROM email_jobs');
  await db.exec('DELETE FROM email_send_logs');
};
