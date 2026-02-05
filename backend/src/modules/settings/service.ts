import db from '../../db';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { SMTP_TLS_REJECT_UNAUTHORIZED, DEBUG_LOGS_ENABLED } from '../../config/env';
import { buildOtpAuthUrl, generateTotpSecret, verifyTotp } from './totp';
import { resetMailer, sendPasswordChangeEmail, sendTestEmail } from '../../services/mailer';
import { appendLogLine, readLogLines } from '../../storage/logStore';

type DbRow = Record<string, any>;

const toBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return fallback;
};

const shouldLogDebug = () => DEBUG_LOGS_ENABLED === true;

export const getSettingsPayload = async () => {
  const settings = await db.one<DbRow>('SELECT * FROM admin_settings ORDER BY updatedAt DESC LIMIT 1');
  const admin = await db.one<DbRow>('SELECT email FROM admin_users ORDER BY createdAt ASC LIMIT 1');
  const adminCountRow = await db.one<DbRow>('SELECT COUNT(*) as count FROM admin_users');
  if (!settings) {
    return null;
  }
  const adminCount = Number(adminCountRow?.count || 0);
  return {
    senderName: settings.senderName,
    senderEmail: settings.senderEmail,
    replyToEmail: settings.replyToEmail,
    organizationName: settings.organizationName,
    adminEmail: admin?.email || settings.adminEmail,
    smtpProvider: settings.smtpProvider,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: Boolean(settings.smtpSecure),
    smtpUser: settings.smtpUser,
    smtpPass: '',
    smtpFrom: settings.smtpFrom,
    deliverabilityDomain: settings.deliverabilityDomain,
    dkimSelector: settings.dkimSelector,
    smtpLastKnownGood: Boolean(settings.smtpLastKnownGood),
    smtpConfigured: Boolean(settings.smtpHost && settings.smtpPort && settings.smtpUser && settings.smtpPass),
    smtpHasBackup: Boolean(settings.smtpLastKnownGoodSnapshot),
    require2fa: Boolean(settings.require2fa),
    verificationMethod: settings.verificationMethod,
    otpLength: settings.otpLength,
    otpExpiry: settings.otpExpiry,
    backupCodesEnabled: Boolean(settings.backupCodesEnabled),
    trustDuration: settings.trustDuration,
    rememberDeviceDefault: Boolean(settings.rememberDeviceDefault),
    alertsEnabled: Boolean(settings.alertsEnabled),
    alertRecipients: settings.alertRecipients,
    alertFrequency: settings.alertFrequency,
    deliverabilityLive: Boolean(settings.deliverabilityLive),
    maxFailedAttempts: settings.maxFailedAttempts,
    cooldownSeconds: settings.cooldownSeconds,
    sessionIdleMins: settings.sessionIdleMins,
    sessionMaxHours: settings.sessionMaxHours,
    singleAdminMode: adminCount <= 1,
    updatedAt: settings.updatedAt
  };
};

export const setupTotp = async () => {
  const admin = await db.one<DbRow>('SELECT id, email, totpSecret FROM admin_users ORDER BY createdAt ASC LIMIT 1');
  if (!admin) {
    return { error: 'Admin not found', status: 404 };
  }
  let secret = admin.totpSecret as string | null;
  if (!secret) {
    secret = generateTotpSecret();
    await db.exec('UPDATE admin_users SET totpSecret = ?, updatedAt = ? WHERE id = ?', [
      secret,
      new Date().toISOString(),
      admin.id
    ]);
  }
  const otpauthUrl = buildOtpAuthUrl(secret, admin.email || 'boss-admin');
  return { secret, otpauthUrl };
};

export const verifyTotpCode = async (code: string) => {
  const admin = await db.one<DbRow>('SELECT id, totpSecret FROM admin_users ORDER BY createdAt ASC LIMIT 1');
  if (!admin?.totpSecret) {
    return { error: 'Authenticator app not configured', status: 404 };
  }
  const ok = verifyTotp(admin.totpSecret, code);
  if (!ok) {
    return { error: 'Invalid OTP code', status: 401 };
  }
  return { success: true };
};

export const generateBackupCodes = async () => {
  const admin = await db.one<DbRow>('SELECT id FROM admin_users ORDER BY createdAt ASC LIMIT 1');
  if (!admin) {
    return { error: 'Admin not found', status: 404 };
  }
  const now = new Date().toISOString();
  await db.exec('DELETE FROM admin_backup_codes WHERE adminId = ?', [admin.id]);
  const codes: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const raw = crypto.randomBytes(4).toString('hex');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .pbkdf2Sync(raw, salt, 310000, 32, 'sha256')
      .toString('hex');
    await db.exec(
      `INSERT INTO admin_backup_codes (id, adminId, codeHash, codeSalt, usedAt, createdAt)
       VALUES (@id, @adminId, @codeHash, @codeSalt, @usedAt, @createdAt)`,
      {
      id: crypto.randomUUID(),
      adminId: admin.id,
      codeHash: hash,
      codeSalt: salt,
      usedAt: null,
      createdAt: now
      }
    );
    codes.push(raw);
  }
  return { codes };
};

export const revokeTrustedDevices = async () => {
  const admin = await db.one<DbRow>('SELECT id FROM admin_users ORDER BY createdAt ASC LIMIT 1');
  if (!admin) {
    return { error: 'Admin not found', status: 404 };
  }
  await db.exec('DELETE FROM admin_trusted_devices WHERE adminId = ?', [admin.id]);
  return { success: true };
};

const readSmtpLogLines = async (limit: number) => {
  try {
    const lines = await readLogLines('smtp-debug.log', limit);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return lines.filter((line) => {
      const match = line.match(/^\[(?<ts>[^\]]+)\]/);
      if (!match?.groups?.ts) return true;
      const ts = Date.parse(match.groups.ts);
      if (Number.isNaN(ts)) return true;
      return ts >= cutoff;
    });
  } catch {
    return [];
  }
};

const parseSmtpLogLine = (line: string) => {
  const match = line.match(/^\[(?<ts>[^\]]+)\]\s+(?<rest>.+)$/);
  if (!match?.groups) {
    return { createdAt: '', message: line, type: 'info' as const };
  }
  const createdAt = match.groups.ts || '';
  const rest = match.groups.rest || '';
  const type = rest.includes('error') ? 'error' : 'info';
  return { createdAt, message: rest, type };
};

export const testSmtp = async (to: string) => {
  const settings = await db.one<DbRow>('SELECT id FROM admin_settings ORDER BY updatedAt DESC LIMIT 1');
  if (!settings) {
    return { error: 'Settings not found', status: 404 };
  }
  try {
    await sendTestEmail(to);
    const snapshot = await db.one<DbRow>(
      `SELECT smtpProvider, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom
       FROM admin_settings WHERE id = ?`,
      [settings.id]
    );
    await db.exec(
      'UPDATE admin_settings SET smtpLastKnownGood = 1, smtpLastKnownGoodSnapshot = ? WHERE id = ?',
      [JSON.stringify(snapshot || {}), settings.id]
    );
    resetMailer();
    return { success: true };
  } catch (error) {
    await db.exec('UPDATE admin_settings SET smtpLastKnownGood = 0 WHERE id = ?', [settings.id]);
    return { error: error instanceof Error ? error.message : 'SMTP test failed', status: 500 };
  }
};

export const verifySmtp = async (payload: {
  smtpHost?: string;
  smtpPort?: number | string;
  smtpSecure?: boolean | string;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
}) => {
  const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, smtpFrom } = payload;
  if (shouldLogDebug()) {
    try {
      const logLine = `[${new Date().toISOString()}] SMTP verify payload host=${smtpHost} port=${smtpPort} secure=${smtpSecure} user=${smtpUser} from=${smtpFrom} passLen=${typeof smtpPass === 'string' ? smtpPass.length : 0}\n`;
      await appendLogLine('smtp-debug.log', logLine, 1000);
    } catch {
      // ignore logging errors
    }
  }
  const host = typeof smtpHost === 'string' ? smtpHost.trim() : '';
  const port = Number(smtpPort || 0);
  const secure = smtpSecure === true || smtpSecure === 'true';
  const user = typeof smtpUser === 'string' ? smtpUser.trim() : '';
  const pass = typeof smtpPass === 'string' ? smtpPass.replace(/\s/g, '') : '';
  const from = typeof smtpFrom === 'string' ? smtpFrom.trim() : '';
  if (!host || !port || !user || !pass || !from) {
    return { error: 'SMTP settings are incomplete.', status: 400 };
  }
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      tls: { rejectUnauthorized: SMTP_TLS_REJECT_UNAUTHORIZED },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });
    await transporter.verify();
    return { success: true };
  } catch (error) {
    const err = error as { code?: string; response?: string; message?: string };
    if (shouldLogDebug()) {
      try {
        const logLine = `[${new Date().toISOString()}] SMTP verify error code=${err?.code || 'unknown'} response=${err?.response || 'n/a'} message=${err?.message || 'n/a'}\n`;
        await appendLogLine('smtp-debug.log', logLine, 1000);
      } catch {
        // ignore logging errors
      }
    }
    return { error: err?.message || 'SMTP verify failed.', status: 400 };
  }
};

export const restoreSmtp = async () => {
  const settings = await db.one<DbRow>(
    'SELECT id, smtpLastKnownGoodSnapshot FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  if (!settings?.smtpLastKnownGoodSnapshot) {
    return { error: 'No SMTP backup available', status: 404 };
  }
  let snapshot: DbRow | null = null;
  try {
    snapshot = JSON.parse(settings.smtpLastKnownGoodSnapshot);
  } catch {
    return { error: 'SMTP backup is corrupted', status: 400 };
  }
  await db.exec(
    `UPDATE admin_settings SET
      smtpProvider = @smtpProvider,
      smtpHost = @smtpHost,
      smtpPort = @smtpPort,
      smtpSecure = @smtpSecure,
      smtpUser = @smtpUser,
      smtpPass = @smtpPass,
      smtpFrom = @smtpFrom,
      smtpLastKnownGood = 1
    WHERE id = @id`,
    {
    id: settings.id,
    smtpProvider: snapshot.smtpProvider || 'custom',
    smtpHost: snapshot.smtpHost || null,
    smtpPort: snapshot.smtpPort || null,
    smtpSecure: snapshot.smtpSecure ? 1 : 0,
    smtpUser: snapshot.smtpUser || null,
    smtpPass: snapshot.smtpPass || null,
    smtpFrom: snapshot.smtpFrom || null
    }
  );
  return { success: true };
};

export const getSmtpLogs = async (limit: number) => {
  const safeLimit = Math.max(1, Math.min(200, Number(limit || 50)));
  const lines = await readSmtpLogLines(safeLimit);
  const items = lines.map(parseSmtpLogLine);
  return { items };
};

export const updateSettings = async (updates: Record<string, unknown>) => {
  const settings = await db.one<DbRow>('SELECT * FROM admin_settings ORDER BY updatedAt DESC LIMIT 1');
  if (!settings) {
    return { error: 'Settings not found', status: 404 };
  }
  const now = new Date().toISOString();
  const admin = await db.one<DbRow>(
    'SELECT id, email, passwordHash, passwordSalt FROM admin_users ORDER BY createdAt ASC LIMIT 1'
  );

  const nextAdminEmail = typeof updates.adminEmail === 'string' ? updates.adminEmail.trim().toLowerCase() : null;
  const currentPassword = typeof updates.currentPassword === 'string' ? updates.currentPassword : '';
  const newPassword = typeof updates.newPassword === 'string' ? updates.newPassword : '';
  const confirmPassword = typeof updates.confirmPassword === 'string' ? updates.confirmPassword : '';

  const smtpHost = typeof updates.smtpHost === 'string' ? updates.smtpHost.trim() : '';
  const smtpPort = Number.isFinite(Number(updates.smtpPort)) ? Number(updates.smtpPort) : null;
  const smtpUser = typeof updates.smtpUser === 'string' ? updates.smtpUser.trim() : '';
  const smtpFrom = typeof updates.smtpFrom === 'string' ? updates.smtpFrom.trim() : '';
  const smtpPass = typeof updates.smtpPass === 'string' ? updates.smtpPass.replace(/\s/g, '') : '';
  const smtpSecure = updates.smtpSecure === true || updates.smtpSecure === 'true';
  const deliverabilityDomain =
    typeof updates.deliverabilityDomain === 'string' ? updates.deliverabilityDomain.trim() : '';
  const dkimSelector = typeof updates.dkimSelector === 'string' ? updates.dkimSelector.trim() : '';
  const deliverabilityLive = toBoolean(updates.deliverabilityLive, Boolean(settings.deliverabilityLive));
  const hasSmtpChanges =
    'smtpHost' in updates ||
    'smtpPort' in updates ||
    'smtpUser' in updates ||
    'smtpPass' in updates ||
    'smtpFrom' in updates ||
    'smtpSecure' in updates;
  if (hasSmtpChanges || smtpPass) {
    const nextHost = smtpHost || settings.smtpHost || '';
    const nextPort = smtpPort ?? settings.smtpPort ?? 0;
    const nextUser = smtpUser || settings.smtpUser || '';
    const nextPass = smtpPass || settings.smtpPass || '';
    const nextFrom = smtpFrom || settings.smtpFrom || '';
    if (!nextHost || !nextUser || !nextPass || !nextFrom || !Number(nextPort)) {
      return { error: 'SMTP settings are incomplete.', status: 400 };
    }
  }
  if (smtpFrom && !smtpFrom.includes('@')) {
    return { error: 'SMTP from email is invalid.', status: 400 };
  }
  if (newPassword || confirmPassword) {
    if (!admin) {
      return { error: 'Admin account not found', status: 400 };
    }
    if (!currentPassword) {
      return { error: 'Current password is required', status: 400 };
    }
    if (newPassword.length < 8) {
      return { error: 'New password must be at least 8 characters', status: 400 };
    }
    if (newPassword !== confirmPassword) {
      return { error: 'Password confirmation does not match', status: 400 };
    }
    const hash = crypto
      .pbkdf2Sync(currentPassword, admin.passwordSalt, 310000, 32, 'sha256')
      .toString('hex');
    if (hash !== admin.passwordHash) {
      return { error: 'Current password is incorrect', status: 401 };
    }
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = crypto
      .pbkdf2Sync(newPassword, newSalt, 310000, 32, 'sha256')
      .toString('hex');
    await db.exec(
      `UPDATE admin_users SET
        email = @email,
        passwordHash = @passwordHash,
        passwordSalt = @passwordSalt,
        updatedAt = @updatedAt
      WHERE id = @id`,
      {
      id: admin.id,
      email: nextAdminEmail || admin.email,
      passwordHash: newHash,
      passwordSalt: newSalt,
      updatedAt: now
      }
    );
    await db.exec('DELETE FROM admin_trusted_devices WHERE adminId = ?', [admin.id]);
    try {
      resetMailer();
      await sendPasswordChangeEmail(nextAdminEmail || admin.email);
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Failed to send password change email.',
        status: 500
      };
    }
  } else if (nextAdminEmail && admin && nextAdminEmail !== admin.email) {
    await db.exec('UPDATE admin_users SET email = ?, updatedAt = ? WHERE id = ?', [
      nextAdminEmail,
      now,
      admin.id
    ]);
    await db.exec('DELETE FROM admin_trusted_devices WHERE adminId = ?', [admin.id]);
  }

  await db.exec(
    `UPDATE admin_settings SET
      senderName = @senderName,
      senderEmail = @senderEmail,
      replyToEmail = @replyToEmail,
      organizationName = @organizationName,
      adminEmail = @adminEmail,
      smtpProvider = @smtpProvider,
      smtpHost = @smtpHost,
      smtpPort = @smtpPort,
      smtpSecure = @smtpSecure,
      smtpUser = @smtpUser,
      smtpPass = @smtpPass,
      smtpFrom = @smtpFrom,
      deliverabilityDomain = @deliverabilityDomain,
      dkimSelector = @dkimSelector,
      require2fa = @require2fa,
      verificationMethod = @verificationMethod,
      otpLength = @otpLength,
      otpExpiry = @otpExpiry,
      backupCodesEnabled = @backupCodesEnabled,
      trustDuration = @trustDuration,
      rememberDeviceDefault = @rememberDeviceDefault,
      alertsEnabled = @alertsEnabled,
      alertRecipients = @alertRecipients,
      alertFrequency = @alertFrequency,
      deliverabilityLive = @deliverabilityLive,
      maxFailedAttempts = @maxFailedAttempts,
      cooldownSeconds = @cooldownSeconds,
      sessionIdleMins = @sessionIdleMins,
      sessionMaxHours = @sessionMaxHours,
      updatedAt = @updatedAt
    WHERE id = @id`,
    {
    id: settings.id,
    senderName: updates.senderName || settings.senderName,
    senderEmail: updates.senderEmail || settings.senderEmail,
    replyToEmail: updates.replyToEmail || settings.replyToEmail,
    organizationName: updates.organizationName || settings.organizationName,
    adminEmail: nextAdminEmail || settings.adminEmail,
    smtpProvider: updates.smtpProvider || settings.smtpProvider || 'custom',
    smtpHost: smtpHost || settings.smtpHost,
    smtpPort: smtpPort ?? settings.smtpPort,
    smtpSecure: smtpSecure ? 1 : 0,
    smtpUser: smtpUser || settings.smtpUser,
    smtpPass: smtpPass || settings.smtpPass,
    smtpFrom: smtpFrom || settings.smtpFrom,
    deliverabilityDomain:
      'deliverabilityDomain' in updates ? (deliverabilityDomain || null) : settings.deliverabilityDomain,
    dkimSelector: 'dkimSelector' in updates ? (dkimSelector || null) : settings.dkimSelector,
    smtpLastKnownGood: hasSmtpChanges ? 0 : settings.smtpLastKnownGood,
    require2fa: toBoolean(updates.require2fa, Boolean(settings.require2fa)) ? 1 : 0,
    verificationMethod: updates.verificationMethod || settings.verificationMethod,
    otpLength: Number.isFinite(Number(updates.otpLength)) ? Number(updates.otpLength) : settings.otpLength,
    otpExpiry: Number.isFinite(Number(updates.otpExpiry)) ? Number(updates.otpExpiry) : settings.otpExpiry,
    backupCodesEnabled: toBoolean(updates.backupCodesEnabled, Boolean(settings.backupCodesEnabled)) ? 1 : 0,
    trustDuration: Number.isFinite(Number(updates.trustDuration)) ? Number(updates.trustDuration) : settings.trustDuration,
    rememberDeviceDefault: toBoolean(updates.rememberDeviceDefault, Boolean(settings.rememberDeviceDefault)) ? 1 : 0,
    alertsEnabled: toBoolean(updates.alertsEnabled, Boolean(settings.alertsEnabled)) ? 1 : 0,
    alertRecipients: updates.alertRecipients || settings.alertRecipients,
    alertFrequency: updates.alertFrequency || settings.alertFrequency,
    deliverabilityLive: deliverabilityLive ? 1 : 0,
    maxFailedAttempts: Number.isFinite(Number(updates.maxFailedAttempts))
      ? Number(updates.maxFailedAttempts)
      : settings.maxFailedAttempts,
    cooldownSeconds: Number.isFinite(Number(updates.cooldownSeconds))
      ? Number(updates.cooldownSeconds)
      : settings.cooldownSeconds,
    sessionIdleMins: Number.isFinite(Number(updates.sessionIdleMins))
      ? Number(updates.sessionIdleMins)
      : settings.sessionIdleMins,
    sessionMaxHours: Number.isFinite(Number(updates.sessionMaxHours))
      ? Number(updates.sessionMaxHours)
      : settings.sessionMaxHours,
    updatedAt: now
    }
  );
  if (hasSmtpChanges) {
    resetMailer();
  }

  const updated = await db.one<DbRow>('SELECT * FROM admin_settings WHERE id = ?', [settings.id]);
  return {
    senderName: updated.senderName,
    senderEmail: updated.senderEmail,
    replyToEmail: updated.replyToEmail,
    organizationName: updated.organizationName,
    adminEmail: nextAdminEmail || updated.adminEmail,
    deliverabilityDomain: updated.deliverabilityDomain,
    dkimSelector: updated.dkimSelector,
    require2fa: Boolean(updated.require2fa),
    verificationMethod: updated.verificationMethod,
    otpLength: updated.otpLength,
    otpExpiry: updated.otpExpiry,
    backupCodesEnabled: Boolean(updated.backupCodesEnabled),
    trustDuration: updated.trustDuration,
    rememberDeviceDefault: Boolean(updated.rememberDeviceDefault),
    alertsEnabled: Boolean(updated.alertsEnabled),
    alertRecipients: updated.alertRecipients,
    alertFrequency: updated.alertFrequency,
    deliverabilityLive: Boolean(updated.deliverabilityLive),
    maxFailedAttempts: updated.maxFailedAttempts,
    cooldownSeconds: updated.cooldownSeconds,
    sessionIdleMins: updated.sessionIdleMins,
    sessionMaxHours: updated.sessionMaxHours,
    updatedAt: updated.updatedAt
  };
};
