import Handlebars from 'handlebars';
import { PUBLIC_URL } from '../config/env';
import { rewriteTrackingLinks } from '../utils/emailTracking';

type RenderOptions = {
  htmlSource: string;
  subjectSource?: string | null;
  variables: Record<string, unknown>;
  campaignId?: string;
  trackingToken?: string;
  trackingKind?: 'campaign' | 'automation';
  publicUrl?: string;
  includeUnsubscribeFooter?: boolean;
  forceFooter?: boolean;
  includeOpenPixel?: boolean;
};

type RenderWarning = {
  code: 'UNSUBSCRIBE_URL_DUMMY';
  message: string;
};

const stripScriptTags = (value: string) =>
  value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

const ensureUnsubscribeFooter = (html: string, hasToken: boolean) => {
  if (!hasToken) return html;
  const footer = `
<div style="margin-top:24px;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;text-align:center;">
  <a href="{{unsubscribeUrl}}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
</div>`;
  return `${html}${footer}`;
};

const ensureOpenPixel = (html: string, hasTracking: boolean) => {
  if (!hasTracking) return html;
  const pixel = `
<img src="{{trackingOpenUrl}}" width="1" height="1" style="display:none;opacity:0" alt="" />`;
  return `${html}${pixel}`;
};

export const renderEmailWithPostProcess = (options: RenderOptions) => {
  const includeUnsubscribeFooter = options.includeUnsubscribeFooter ?? true;
  const forceFooter = options.forceFooter ?? false;
  const includeOpenPixel = options.includeOpenPixel ?? true;
  const warnings: RenderWarning[] = [];
  const variables: Record<string, unknown> = { ...(options.variables || {}) };

  if (includeUnsubscribeFooter && forceFooter) {
    const existing = typeof variables.unsubscribeUrl === 'string' ? variables.unsubscribeUrl : '';
    if (!existing) {
      const baseUrl = (options.publicUrl || PUBLIC_URL).replace(/\/+$/, '');
      variables.unsubscribeUrl = `${baseUrl}/unsubscribe?token=preview`;
      warnings.push({
        code: 'UNSUBSCRIBE_URL_DUMMY',
        message: 'Preview uses a dummy unsubscribe URL because none was provided.'
      });
    }
  }

  const hasUnsubscribeToken =
    typeof variables.unsubscribeUrl === 'string' && variables.unsubscribeUrl.length > 0;
  const hasTrackingUrl =
    typeof variables.trackingOpenUrl === 'string' && variables.trackingOpenUrl.length > 0;

  let htmlSource = stripScriptTags(options.htmlSource || '');
  if (includeUnsubscribeFooter) {
    const shouldAppendFooter = forceFooter || !htmlSource.includes('{{unsubscribeUrl}}');
    if (shouldAppendFooter) {
      htmlSource = ensureUnsubscribeFooter(htmlSource, hasUnsubscribeToken);
    }
  }
  if (includeOpenPixel && !htmlSource.includes('{{trackingOpenUrl}}')) {
    htmlSource = ensureOpenPixel(htmlSource, hasTrackingUrl);
  }

  const compiledHtml = Handlebars.compile(htmlSource);
  const renderedHtml = compiledHtml(variables);

  let finalHtml = renderedHtml;
  if (options.campaignId && options.trackingToken && options.publicUrl) {
    finalHtml = rewriteTrackingLinks(renderedHtml, {
      campaignId: options.campaignId,
      subscriberToken: options.trackingToken,
      publicUrl: options.publicUrl,
      trackingKind: options.trackingKind
    });
  }

  if (!options.subjectSource) {
    return { renderedHtml: finalHtml, renderedSubject: null, warnings };
  }
  const compiledSubject = Handlebars.compile(options.subjectSource);
  const renderedSubject = compiledSubject(variables);
  return { renderedHtml: finalHtml, renderedSubject, warnings };
};
