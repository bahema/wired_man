import * as cheerio from 'cheerio';
import { UNSUBSCRIBE_URL_ALLOWLIST } from '../config/env';

type RewriteOptions = {
  campaignId: string;
  subscriberToken: string;
  publicUrl: string;
  trackingKind?: 'campaign' | 'automation';
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

const isSkippableHref = (href: string) => {
  const trimmed = href.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('#')) return true;
  const lower = trimmed.toLowerCase();
  return lower.startsWith('mailto:') || lower.startsWith('tel:') || lower.startsWith('sms:');
};

const isUnsubscribeOrPreferences = (href: string, baseUrl: string) => {
  const normalized = href.trim();
  const lower = normalized.toLowerCase();
  if (lower.includes('/unsubscribe') || lower.includes('/preferences')) return true;
  if (lower.includes('unsubscribe')) return true;
  if (normalized.startsWith(`${baseUrl}/unsubscribe`) || normalized.startsWith(`${baseUrl}/preferences`)) {
    return true;
  }
  if (UNSUBSCRIBE_URL_ALLOWLIST.length) {
    return UNSUBSCRIBE_URL_ALLOWLIST.some((entry) => entry && lower.includes(entry));
  }
  return false;
};

const isAlreadyTracked = (href: string, baseUrl: string) => {
  const normalized = href.trim();
  if (normalized.startsWith('/t/c/')) return true;
  if (normalized.startsWith('/t/a/')) return true;
  return normalized.startsWith(`${baseUrl}/t/c/`) || normalized.startsWith(`${baseUrl}/t/a/`);
};

const buildTrackingClickUrl = (
  baseUrl: string,
  trackingId: string,
  token: string,
  destination: string,
  kind: 'campaign' | 'automation' = 'campaign'
) => {
  const prefix = kind === 'automation' ? 'a' : 'c';
  return `${baseUrl}/t/${prefix}/${trackingId}/${token}?u=${encodeURIComponent(destination)}`;
};

export const rewriteTrackingLinks = (html: string, options: RewriteOptions) => {
  // Skip rewriting when we do not have the data needed to track.
  if (!html || !options.campaignId || !options.subscriberToken || !options.publicUrl) {
    return html;
  }
  const baseUrl = normalizeBaseUrl(options.publicUrl);
  const trackingKind = options.trackingKind === 'automation' ? 'automation' : 'campaign';
  const $ = cheerio.load(html);

  $('a[href]').each((_, element) => {
    const current = $(element).attr('href');
    if (!current) return;
    if (isSkippableHref(current)) return;
    if (isAlreadyTracked(current, baseUrl)) return;
    if (isUnsubscribeOrPreferences(current, baseUrl)) return;
    $(element).attr(
      'href',
      buildTrackingClickUrl(baseUrl, options.campaignId, options.subscriberToken, current, trackingKind)
    );
  });

  return $.html();
};

export { buildTrackingClickUrl };
