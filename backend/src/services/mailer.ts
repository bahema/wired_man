import nodemailer from 'nodemailer';
import {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  SMTP_TLS_REJECT_UNAUTHORIZED,
  UPLOAD_DIR,
  DEBUG_LOGS_ENABLED,
  R2_PUBLIC_BASE_URL
} from '../config/env';
import db from '../db';
import { logAdminActivity } from './activityLogService';
import fs from 'fs';
import path from 'path';
import { appendLogLine } from '../storage/logStore';

let transporter: nodemailer.Transporter | null = null;

export const resetMailer = () => {
  transporter = null;
};

const shouldLogDebug = () => DEBUG_LOGS_ENABLED === true;

const getSettingsSmtp = async () => {
  const settings = await db.one<{
    smtpHost?: string | null;
    smtpPort?: number | null;
    smtpSecure?: number | boolean | null;
    smtpUser?: string | null;
    smtpPass?: string | null;
    smtpFrom?: string | null;
    senderName?: string | null;
    replyToEmail?: string | null;
  }>(
    `SELECT smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom, senderName, replyToEmail
     FROM admin_settings
     ORDER BY updatedAt DESC
     LIMIT 1`
  );
  if (!settings) return null;
  if (!settings.smtpHost || !settings.smtpPort || !settings.smtpUser || !settings.smtpPass) {
    return null;
  }
  return {
    host: settings.smtpHost,
    port: Number(settings.smtpPort),
    secure: Boolean(settings.smtpSecure),
    user: settings.smtpUser,
    pass: settings.smtpPass.replace(/\s/g, ''),
    from: settings.smtpFrom || settings.smtpUser,
    senderName: settings.senderName || '',
    replyToEmail: settings.replyToEmail || ''
  };
};

const getTransporter = async () => {
  if (transporter) return transporter;
  const dbSmtp = await getSettingsSmtp();
  const host = dbSmtp?.host || SMTP_HOST;
  const port = dbSmtp?.port || SMTP_PORT;
  let secure = typeof dbSmtp?.secure === 'boolean' ? dbSmtp.secure : SMTP_SECURE;
  const user = dbSmtp?.user || SMTP_USER;
  const pass = (dbSmtp?.pass || SMTP_PASS || '').replace(/\s/g, '');
  const from = dbSmtp?.from || SMTP_FROM;
  if (port === 465 && !secure) {
    secure = true;
  }
  if (!host || !port || !user || !pass || !from) {
    throw new Error('SMTP is not configured.');
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    tls: {
      rejectUnauthorized: SMTP_TLS_REJECT_UNAUTHORIZED
    },
    auth: {
      user,
      pass
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  });
  return transporter;
};

type CampaignEmail = {
  subject?: string | null;
  previewText?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  replyToEmail?: string | null;
};

type InlineAttachment = {
  filename: string;
  path: string;
  cid: string;
};

const resolveFromProfile = async () => {
  const settings = await getSettingsSmtp();
  if (shouldLogDebug()) {
    console.log('Mailer settings snapshot', {
      host: settings?.host || SMTP_HOST,
      port: settings?.port || SMTP_PORT,
      user: settings?.user || SMTP_USER,
      from: settings?.from || SMTP_FROM,
      secure: typeof settings?.secure === 'boolean' ? settings?.secure : SMTP_SECURE
    });
    try {
      const logLine = `[${new Date().toISOString()}] Mailer settings host=${settings?.host || SMTP_HOST} port=${settings?.port || SMTP_PORT} user=${settings?.user || SMTP_USER} from=${settings?.from || SMTP_FROM} secure=${typeof settings?.secure === 'boolean' ? settings?.secure : SMTP_SECURE}\n`;
      await appendLogLine('smtp-debug.log', logLine, 1000);
    } catch {
      // ignore logging errors
    }
  }
  const fromAddress = settings?.from || SMTP_FROM;
  const fromName = settings?.senderName || '';
  const replyTo = settings?.replyToEmail || undefined;
  const from = fromName ? `"${fromName}" <${fromAddress}>` : fromAddress;
  return { from, replyTo };
};

const toHtmlFromText = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('');

const resolveUploadPath = (src: string) => {
  if (process.env.NETLIFY || R2_PUBLIC_BASE_URL) return null;
  if (!src || src.startsWith('cid:') || src.startsWith('data:')) return null;
  let pathname = src;
  if (/^https?:\/\//i.test(src)) {
    try {
      pathname = new URL(src).pathname;
    } catch {
      return null;
    }
  }
  if (!pathname.startsWith('/uploads/')) return null;
  const rel = decodeURIComponent(pathname.replace(/^\/uploads\//, ''));
  const filePath = path.resolve(UPLOAD_DIR, rel);
  if (!filePath.startsWith(path.resolve(UPLOAD_DIR))) return null;
  return fs.existsSync(filePath) ? filePath : null;
};

const inlineUploadImages = (html: string) => {
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  const matches = [...html.matchAll(imgRegex)];
  if (matches.length === 0) {
    return { html, attachments: [] as InlineAttachment[] };
  }

  let updatedHtml = html;
  const attachments: InlineAttachment[] = [];
  let count = 0;

  matches.forEach((match) => {
    const src = match[1];
    const filePath = resolveUploadPath(src);
    if (!filePath) return;
    count += 1;
    const cid = `upload-${count}@bossdesk`;
    if (!updatedHtml.includes(src)) return;
    updatedHtml = updatedHtml.replace(src, `cid:${cid}`);
    attachments.push({
      filename: path.basename(filePath),
      path: filePath,
      cid
    });
  });

  return { html: updatedHtml, attachments };
};

export const sendOtpEmail = async (to: string, code: string) => {
  const mailer = await getTransporter();
  const { from, replyTo } = await resolveFromProfile();
  await mailer.sendMail({
    from,
    replyTo,
    to,
    subject: 'Your BossDesk login code',
    text: `Your one-time login code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your one-time login code is <strong>${code}</strong>. It expires in 10 minutes.</p>`
  });
};

export const sendPasswordChangeEmail = async (to: string) => {
  const mailer = await getTransporter();
  const { from, replyTo } = await resolveFromProfile();
  await mailer.sendMail({
    from,
    replyTo,
    to,
    subject: 'BossDesk password updated',
    text: 'Your BossDesk admin password was just changed. If this was not you, contact support immediately.',
    html:
      '<p>Your BossDesk admin password was just changed.</p><p>If this was not you, contact support immediately.</p>'
  });
};

export const sendLoginAlertEmail = async (to: string, info: { ip?: string; userAgent?: string }) => {
  const mailer = await getTransporter();
  const ip = info.ip || 'Unknown IP';
  const ua = info.userAgent || 'Unknown device';
  const { from, replyTo } = await resolveFromProfile();
  await mailer.sendMail({
    from,
    replyTo,
    to,
    subject: 'BossDesk login alert',
    text: `A new login just occurred.\nIP: ${ip}\nDevice: ${ua}`,
    html: `<p>A new login just occurred.</p><p><strong>IP:</strong> ${ip}<br/><strong>Device:</strong> ${ua}</p>`
  });
};

export const sendTestEmail = async (to: string) => {
  const mailer = await getTransporter();
  const { from, replyTo } = await resolveFromProfile();
  await mailer.sendMail({
    from,
    replyTo,
    to,
    subject: 'BossDesk SMTP test',
    text: 'This is a test email from BossDesk settings.',
    html: '<p>This is a test email from BossDesk settings.</p>'
  });
};

export const sendWelcomeEmail = async (
  to: string,
  config: {
    subject: string;
    fromName?: string | null;
    fromEmail?: string | null;
    replyTo?: string | null;
    body: string;
  },
  links: {
    confirmationUrl: string;
    unsubscribeUrl?: string;
    preferencesUrl?: string;
  }
) => {
  const mailer = await getTransporter();
  const profile = await resolveFromProfile();
  const fromAddress = config.fromEmail?.trim() || null;
  const fromName = config.fromName?.trim() || '';
  const replyToOverride = config.replyTo?.trim() || '';
  const from = fromAddress ? (fromName ? `"${fromName}" <${fromAddress}>` : fromAddress) : profile.from;
  const replyTo = replyToOverride || profile.replyTo;
  const subject = config.subject?.trim() || 'Welcome!';
  let body = config.body || '';
  body = body.replace(/\{\{\s*confirmationUrl\s*\}\}/g, links.confirmationUrl || '');
  if (links.unsubscribeUrl) {
    body = body.replace(/\{\{\s*unsubscribeUrl\s*\}\}/g, links.unsubscribeUrl);
  }
  if (links.preferencesUrl) {
    body = body.replace(/\{\{\s*preferencesUrl\s*\}\}/g, links.preferencesUrl);
  }
  const needsFooter =
    !/\{\{\s*unsubscribeUrl\s*\}\}/.test(config.body || '') &&
    !/\{\{\s*preferencesUrl\s*\}\}/.test(config.body || '');
  if (needsFooter && (links.unsubscribeUrl || links.preferencesUrl)) {
    const prefLine = links.preferencesUrl
      ? `<a href="${links.preferencesUrl}" style="color:#6b7280;text-decoration:underline;">Preferences</a>`
      : '';
    const unsubLine = links.unsubscribeUrl
      ? `<a href="${links.unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>`
      : '';
    const divider = prefLine && unsubLine ? ' · ' : '';
    body += `
<div style="margin-top:24px;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;text-align:center;">
  ${prefLine}${divider}${unsubLine}
</div>`;
  }
  const text = body.replace(/<[^>]+>/g, '').trim();
  const { html, attachments } = inlineUploadImages(body);
  console.info(`[welcome-email] dispatching to ${to}`);
  await mailer.sendMail({
    from,
    replyTo,
    to,
    subject,
    text,
    html,
    attachments
  });
  await logAdminActivity('welcome_email_sent', { to }, 'system');
};

export const sendCampaignEmail = async (to: string, campaign: CampaignEmail) => {
  const mailer = await getTransporter();
  const { from, replyTo } = await resolveFromProfile();
  const subject = campaign.subject?.trim() || 'Campaign update';
  const text = campaign.bodyText?.trim() || campaign.bodyHtml?.replace(/<[^>]+>/g, '') || '';
  const rawHtml =
    campaign.bodyHtml?.trim() ||
    (campaign.bodyText ? toHtmlFromText(campaign.bodyText) : '');
  const { html, attachments } = inlineUploadImages(rawHtml);
  await mailer.sendMail({
    from,
    replyTo,
    to,
    subject,
    text,
    html,
    attachments
  });
};

export const sendTemplateTestEmail = async (to: string, subject: string, html: string) => {
  const mailer = await getTransporter();
  const { from, replyTo } = await resolveFromProfile();
  const safeSubject = subject?.trim() || 'Template preview';
  const text = html?.replace(/<[^>]+>/g, '') || '';
  const { html: inlinedHtml, attachments } = inlineUploadImages(html || '');
  await mailer.sendMail({
    from,
    replyTo,
    to,
    subject: safeSubject,
    text,
    html: inlinedHtml,
    attachments
  });
};

export const sendReportEmail = async (recipients: string[], subject: string, text: string) => {
  const mailer = await getTransporter();
  const { from, replyTo } = await resolveFromProfile();
  await mailer.sendMail({
    from,
    replyTo,
    to: recipients,
    subject,
    text,
    html: toHtmlFromText(text)
  });
};
