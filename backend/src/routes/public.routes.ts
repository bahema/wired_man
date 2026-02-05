import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import db from '../db';
import { contentEvents, emitContentUpdate, getMediaVersion } from '../events';
import { refreshSegmentsSummaryCache } from '../services/segmentsSummaryService';
import { broadcastSegmentsUpdate } from '../services/segmentsLiveService';
import { refreshSourcesSummaryCache } from '../services/sourcesSummaryService';
import { broadcastSourcesUpdate } from '../services/sourcesLiveService';
import { sendLoginAlertEmail, sendOtpEmail, sendWelcomeEmail } from '../services/mailer';
import { getContinentForCountry } from '../data/continents';
import { PUBLIC_URL, OTP_EMAIL_ENABLED, DEV_EXPOSE_OTP, DEBUG_LOGS_ENABLED } from '../config/env';
import { appendLogLine } from '../storage/logStore';

type DbRow = Record<string, any>;

const router = Router();
const streamConnectWindowMs = 60_000;
const streamConnectMax = 5;
const streamConnectHistory = new Map<string, number[]>();

const shouldLogDebug = () => DEBUG_LOGS_ENABLED === true;

const redactEmail = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const [user, domain] = value.split('@');
  if (!domain) return value;
  const safeUser = user.length <= 2 ? `${user[0] || ''}*` : `${user.slice(0, 2)}***`;
  return `${safeUser}@${domain}`;
};

const redactIp = (value: unknown) => {
  if (typeof value !== 'string') return value;
  if (value.includes(':')) {
    const parts = value.split(':');
    return `${parts.slice(0, 2).join(':')}:****`;
  }
  const parts = value.split('.');
  if (parts.length !== 4) return value;
  return `${parts[0]}.${parts[1]}.***.***`;
};

const getClientIp = (req: Request) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
};

const allowStreamConnection = (req: Request) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const existing = streamConnectHistory.get(ip) || [];
  const recent = existing.filter((ts) => now - ts < streamConnectWindowMs);
  if (recent.length >= streamConnectMax) {
    streamConnectHistory.set(ip, recent);
    return false;
  }
  recent.push(now);
  streamConnectHistory.set(ip, recent);
  return true;
};

const logAuthEvent = async (event: string, meta: Record<string, unknown>) => {
  if (!shouldLogDebug()) return;
  try {
    const safeMeta = {
      ...meta,
      email: redactEmail(meta.email),
      ip: redactIp(meta.ip)
    };
    const line = JSON.stringify({ at: new Date().toISOString(), event, ...safeMeta });
    await appendLogLine('auth-debug.log', line, 1000);
  } catch {
    // ignore logging errors
  }
};

const parseJsonArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};


const renderConfirmPage = (token?: string) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Subscription Confirmed</title>
    <style>
      body { font-family: Arial, sans-serif; background:#f3f4f6; color:#111827; }
      .card { max-width:520px; margin:60px auto; background:#fff; padding:28px; border-radius:14px; box-shadow:0 8px 24px rgba(15,23,42,0.08); }
      .muted { color:#6b7280; font-size:13px; margin-top:8px; }
      .actions { margin-top:18px; display:flex; flex-wrap:wrap; gap:10px; }
      .btn { display:inline-block; padding:10px 14px; border-radius:999px; text-decoration:none; font-size:13px; font-weight:600; }
      .btn-twitter { background:#111827; color:#fff; }
      .btn-facebook { background:#2563eb; color:#fff; }
      .btn-instagram { background:#ec4899; color:#fff; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Welcome aboard! 🎉</h1>
      <p class="muted">You are officially subscribed. We’re excited to have you here. ✅</p>
      <p class="muted">Check your inbox for your welcome email and future updates.</p>
      <div class="actions">
        <a class="btn btn-twitter" href="#" target="_blank" rel="noopener noreferrer">Follow on Twitter</a>
        <a class="btn btn-facebook" href="#" target="_blank" rel="noopener noreferrer">Follow on Facebook</a>
        <a class="btn btn-instagram" href="#" target="_blank" rel="noopener noreferrer">Follow on Instagram</a>
      </div>
      <p class="muted">You can close this window anytime.</p>
    </div>
  </body>
</html>
`;

const loadWelcomeEmailConfig = async () => {
  const settings = await db.one<DbRow>(
    'SELECT welcomeEmailConfig FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  if (!settings?.welcomeEmailConfig || typeof settings.welcomeEmailConfig !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(settings.welcomeEmailConfig) as Record<string, unknown>;
    return parsed;
  } catch {
    return null;
  }
};


const CLIENT_PAGE_KEYS = ['home', 'items', 'forex'] as const;

const isValidClientPage = (value: string) =>
  CLIENT_PAGE_KEYS.includes(value as (typeof CLIENT_PAGE_KEYS)[number]);

const hashPassword = (password: string, salt?: string) => {
  const passwordSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, passwordSalt, 310000, 32, 'sha256')
    .toString('hex');
  return { hash, salt: passwordSalt };
};

const OTP_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buffer: Buffer) => {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += OTP_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += OTP_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
};

const base32Decode = (value: string) => {
  const cleaned = value.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const char of cleaned) {
    const idx = OTP_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    buffer = (buffer << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
};

const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

const generateTotpCode = (secret: string, timeStepSeconds = 30) => {
  const counter = Math.floor(Date.now() / 1000 / timeStepSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter & 0xffffffff, 4);
  const key = base32Decode(secret);
  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
};

const verifyTotp = (secret: string, code: string, window = 1) => {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) return false;
  const now = Date.now();
  for (let offset = -window; offset <= window; offset += 1) {
    const time = now + offset * 30000;
    const counter = Math.floor(time / 1000 / 30);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuffer.writeUInt32BE(counter & 0xffffffff, 4);
    const key = base32Decode(secret);
    const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
    const hmacOffset = hmac[hmac.length - 1] & 0x0f;
    const value =
      ((hmac[hmacOffset] & 0x7f) << 24) |
      ((hmac[hmacOffset + 1] & 0xff) << 16) |
      ((hmac[hmacOffset + 2] & 0xff) << 8) |
      (hmac[hmacOffset + 3] & 0xff);
    const expected = String(value % 1000000).padStart(6, '0');
    if (expected === normalized) {
      return true;
    }
  }
  return false;
};

const createAdminSession = async (adminId: string, maxHours = 168) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + maxHours * 60 * 60 * 1000);
  const token = crypto.randomBytes(32).toString('hex');
  const id = crypto.randomUUID();
  await db.exec(
    `INSERT INTO admin_sessions (id, adminId, token, expiresAt, lastSeen, createdAt)
     VALUES (@id, @adminId, @token, @expiresAt, @lastSeen, @createdAt)`,
    {
    id,
    adminId,
    token,
    expiresAt: expiresAt.toISOString(),
    lastSeen: now.toISOString(),
    createdAt: now.toISOString()
    }
  );
  return { token, expiresAt: expiresAt.toISOString() };
};

const maybeSendLoginAlert = async (adminEmail: string, req: Request) => {
  const settings = await db.one<DbRow>(
    'SELECT id, alertsEnabled, alertRecipients, alertFrequency, alertLastSentAt FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  if (!settings?.alertsEnabled) return;
  const frequency = typeof settings.alertFrequency === 'string' ? settings.alertFrequency : 'instant';
  if (frequency !== 'instant' && settings.alertLastSentAt) {
    const lastSent = new Date(settings.alertLastSentAt).getTime();
    const now = Date.now();
    const windowMs = frequency === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    if (Number.isFinite(lastSent) && lastSent + windowMs > now) {
      return;
    }
  }
  const recipients = typeof settings.alertRecipients === 'string' && settings.alertRecipients.trim()
    ? settings.alertRecipients.trim()
    : adminEmail;
  await sendLoginAlertEmail(recipients, {
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  if (settings.id) {
    await db.exec('UPDATE admin_settings SET alertLastSentAt = ? WHERE id = ?', [
      new Date().toISOString(),
      settings.id
    ]);
  }
};

const createTrustedDevice = async (adminId: string, durationDays: number, label?: string) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const token = crypto.randomBytes(32).toString('hex');
  const id = crypto.randomUUID();
  await db.exec(
    `INSERT INTO admin_trusted_devices (id, adminId, token, label, expiresAt, createdAt)
     VALUES (@id, @adminId, @token, @label, @expiresAt, @createdAt)`,
    {
    id,
    adminId,
    token,
    label: label || null,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString()
    }
  );
  return { token, expiresAt: expiresAt.toISOString() };
};

const isTrustedDevice = async (token?: string | null, maxDays = 90) => {
  if (!token) return false;
  const row = await db.one<DbRow>(
    'SELECT id, expiresAt FROM admin_trusted_devices WHERE token = ? LIMIT 1',
    [token]
  );
  if (!row) return false;
  const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(row.expiresAt).getTime();
  if (expiresAt - maxAgeMs <= Date.now()) {
    await db.exec('DELETE FROM admin_trusted_devices WHERE id = ?', [row.id]);
    return false;
  }
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    await db.exec('DELETE FROM admin_trusted_devices WHERE id = ?', [row.id]);
    return false;
  }
  return true;
};
const createLoginChallenge = async (
  adminId: string,
  method: string,
  code: string | undefined,
  expiryMinutes: number
) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);
  const id = crypto.randomUUID();
  const payload =
    code !== undefined ? hashPassword(code) : { hash: null, salt: null };
  await db.exec(
    `INSERT INTO admin_login_challenges (
      id, adminId, method, codeHash, codeSalt, attempts, expiresAt, createdAt
    ) VALUES (
      @id, @adminId, @method, @codeHash, @codeSalt, @attempts, @expiresAt, @createdAt
    )`,
    {
    id,
    adminId,
    method,
    codeHash: payload.hash,
    codeSalt: payload.salt,
    attempts: 0,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString()
    }
  );
  return { id, expiresAt: expiresAt.toISOString() };
};

const loadAuthSettings = async () => {
  const row = await db.one<DbRow>(
    'SELECT require2fa, verificationMethod, otpLength, otpExpiry, maxFailedAttempts, trustDuration, cooldownSeconds, backupCodesEnabled, sessionIdleMins, sessionMaxHours FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  const otpLength = Number(row?.otpLength || 6);
  const otpExpiry = Number(row?.otpExpiry || 10);
  const maxFailedAttempts = Number(row?.maxFailedAttempts || 5);
  const trustDuration = Number(row?.trustDuration || 30);
  const cooldownSeconds = Number(row?.cooldownSeconds || 30);
  const sessionIdleMins = Number(row?.sessionIdleMins || 20);
  const sessionMaxHours = Number(row?.sessionMaxHours || 8);
  return {
    require2fa: row?.require2fa ? Boolean(row.require2fa) : false,
    verificationMethod: typeof row?.verificationMethod === 'string' ? row.verificationMethod : 'email',
    otpLength: Math.min(8, Math.max(4, otpLength)),
    otpExpiry: Math.min(60, Math.max(1, otpExpiry)),
    maxFailedAttempts: Math.min(10, Math.max(3, maxFailedAttempts)),
    trustDuration: Math.min(90, Math.max(7, trustDuration)),
    cooldownSeconds: Math.min(600, Math.max(10, cooldownSeconds)),
    backupCodesEnabled: row?.backupCodesEnabled ? Boolean(row.backupCodesEnabled) : false,
    sessionIdleMins: Math.min(240, Math.max(5, sessionIdleMins)),
    sessionMaxHours: Math.min(168, Math.max(1, sessionMaxHours))
  };
};

const generateNumericOtp = (length: number) => {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
};

const allowDevOtpExposure = () =>
  DEV_EXPOSE_OTP && process.env.NODE_ENV === 'development';

const getLoginLimit = async (email: string) =>
  db.one<DbRow>('SELECT * FROM admin_login_limits WHERE email = ? LIMIT 1', [email]);

const upsertLoginLimit = async (email: string, changes: Partial<DbRow>) => {
  const existing = await getLoginLimit(email);
  const now = new Date().toISOString();
  if (!existing) {
    await db.exec(
      `INSERT INTO admin_login_limits (id, email, failedAttempts, cooldownUntil, lastFailedAt, createdAt, updatedAt)
       VALUES (@id, @email, @failedAttempts, @cooldownUntil, @lastFailedAt, @createdAt, @updatedAt)`,
      {
      id: crypto.randomUUID(),
      email,
      failedAttempts: changes.failedAttempts ?? 0,
      cooldownUntil: changes.cooldownUntil ?? null,
      lastFailedAt: changes.lastFailedAt ?? null,
      createdAt: now,
      updatedAt: now
      }
    );
    return;
  }
  await db.exec(
    `UPDATE admin_login_limits SET
      failedAttempts = @failedAttempts,
      cooldownUntil = @cooldownUntil,
      lastFailedAt = @lastFailedAt,
      updatedAt = @updatedAt
    WHERE id = @id`,
    {
    id: existing.id,
    failedAttempts: changes.failedAttempts ?? existing.failedAttempts,
    cooldownUntil: changes.cooldownUntil ?? existing.cooldownUntil,
    lastFailedAt: changes.lastFailedAt ?? existing.lastFailedAt,
    updatedAt: now
    }
  );
};

router.get('/hero', async (_req, res) => {
  const hero = await db.one<DbRow>('SELECT * FROM hero_config WHERE isActive = 1 ORDER BY updatedAt DESC LIMIT 1');
  const featured = await db.many<DbRow>('SELECT * FROM featured_slots WHERE isActive = 1 ORDER BY sortOrder ASC');
  return res.json({
    hero: hero || null,
    featured
  });
});

router.get('/testimonials', async (_req, res) => {
  const rows = await db.many<DbRow>(
    "SELECT * FROM testimonials WHERE status = 'published' ORDER BY createdAt DESC"
  );
  return res.json(rows);
});

router.get('/upcoming', async (_req, res) => {
  const rows = await db.many<DbRow>(
    'SELECT * FROM upcoming_products WHERE isActive = 1 ORDER BY sortOrder ASC, createdAt DESC'
  );
  return res.json(rows);
});

router.get('/videos', async (_req, res) => {
  const rows = await db.many<DbRow>(
    'SELECT id, title, description, src, poster, isNew, isActive, sortOrder FROM videos WHERE isActive = 1 ORDER BY sortOrder ASC, updatedAt DESC'
  );
  return res.json(rows);
});

router.get('/client-pages/:page/sections', async (req, res) => {
  const { page } = req.params;
  if (!isValidClientPage(page)) {
    return res.status(400).json({ error: 'Invalid page key' });
  }
  const sections = await db.many<DbRow>(
    'SELECT * FROM client_sections WHERE pageKey = ? ORDER BY sortOrder ASC',
    [page]
  );
  return res.json(
    sections.map((row) => ({
      ...row,
      data: (() => {
        try {
          return JSON.parse(row.data || '{}');
        } catch {
          return {};
        }
      })()
    }))
  );
});

const DEFAULT_FAQS = [
  { question: 'How do I get access after subscribing?', answer: 'We email you access details.', isActive: true, sortOrder: 0 },
  { question: 'Do I need experience to start?', answer: 'No, beginners are welcome.', isActive: true, sortOrder: 1 }
];

const DEFAULT_PARTNERS = [
  { name: 'YouTube', logoUrl: '', linkUrl: '', isActive: true, sortOrder: 0 },
  { name: 'GetResponse', logoUrl: '', linkUrl: '', isActive: true, sortOrder: 1 }
];

const DEFAULT_MODAL_COPY = {
  title: 'Subscribe',
  subtitle: 'No account required. We will email you updates.',
  bulletPoints: [],
  ctaLabel: 'Submit',
  privacyNote: 'Please check your inbox. Look in Spam, Promotions, or Updates.'
};

const getSiteContentValue = async (key: string) => {
  const row = await db.one<DbRow>('SELECT valueJson FROM site_content WHERE key = ?', [key]);
  if (!row?.valueJson) return null;
  try {
    return JSON.parse(row.valueJson);
  } catch {
    return null;
  }
};

router.get('/faqs', async (_req, res) => {
  const value = await getSiteContentValue('faqs');
  const items = Array.isArray(value) ? value : DEFAULT_FAQS;
  return res.json({ items });
});

router.get('/partners', async (_req, res) => {
  const value = await getSiteContentValue('partners');
  const items = Array.isArray(value) ? value : DEFAULT_PARTNERS;
  return res.json({ items });
});

router.get('/modal-copy', async (_req, res) => {
  const value = await getSiteContentValue('subscribe_modal_copy');
  const payload = value && typeof value === 'object' ? value : DEFAULT_MODAL_COPY;
  return res.json(payload);
});

router.get('/hero-presenter', async (_req, res) => {
  const value = await getSiteContentValue('hero_presenter');
  const payload = value && typeof value === 'object' ? value : null;
  return res.json({ config: payload });
});

router.get('/stream', (req, res) => {
  if (!allowStreamConnection(req)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Too many stream connections' });
  }
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const safeWrite = (chunk: string) => {
    if (res.writableEnded || res.destroyed) return;
    try {
      res.write(chunk);
    } catch {
      // Ignore stream write errors from closed sockets.
    }
  };

  const send = (payload: unknown) => {
    safeWrite(`event: content\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  const keepAlive = setInterval(() => {
    safeWrite(': ping\n\n');
  }, 25000);

  const handler = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    const candidate = payload as {
      type?: unknown;
      changed?: unknown;
      version?: unknown;
      ts?: unknown;
    };
    if (candidate.type !== 'content_update') return;
    const changed = Array.isArray(candidate.changed)
      ? candidate.changed.filter((item) => typeof item === 'string')
      : [];
    if (!changed.length) return;
    const version = typeof candidate.version === 'number' ? candidate.version : Date.now();
    const ts = typeof candidate.ts === 'string' ? candidate.ts : new Date().toISOString();
    send({ type: 'content_update', changed, version, ts });
  };

  contentEvents.on('content', handler);

  req.on('close', () => {
    clearInterval(keepAlive);
    contentEvents.off('content', handler);
  });
});

router.get('/admin/status', async (_req, res) => {
  const row = await db.one<DbRow>('SELECT id FROM admin_users LIMIT 1');
  return res.json({ exists: Boolean(row) });
});

router.get('/admin/login-settings', async (_req, res) => {
  const settings = await db.one<DbRow>(
    'SELECT rememberDeviceDefault, trustDuration, smtpHost, smtpPort, smtpUser, smtpPass, smtpLastKnownGood FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  const adminCountRow = await db.one<DbRow>('SELECT COUNT(*) as count FROM admin_users');
  const adminCount = Number(adminCountRow?.count || 0);
  const isProduction = process.env.NODE_ENV === 'production';
  const signupEnabled = !isProduction && adminCount === 0;
  const smtpConfigured = Boolean(settings?.smtpHost && settings?.smtpPort && settings?.smtpUser && settings?.smtpPass);
  const smtpLastKnownGood = settings?.smtpLastKnownGood ? Boolean(settings.smtpLastKnownGood) : false;
  return res.json({
    rememberDeviceDefault: settings?.rememberDeviceDefault ? Boolean(settings.rememberDeviceDefault) : false,
    trustDuration: settings?.trustDuration ? Number(settings.trustDuration) : 30,
    signupEnabled,
    smtpConfigured,
    smtpLastKnownGood
  });
});

router.post('/admin/signup', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Signup is disabled in production.' });
  }
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const adminCountRow = await db.one<DbRow>('SELECT COUNT(*) as count FROM admin_users');
  const adminCount = Number(adminCountRow?.count || 0);
  if (adminCount >= 1) {
    return res.status(409).json({ error: 'Admin already exists' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const { hash, salt } = hashPassword(password);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.exec(
    `INSERT INTO admin_users (id, email, passwordHash, passwordSalt, createdAt, updatedAt)
     VALUES (@id, @email, @passwordHash, @passwordSalt, @createdAt, @updatedAt)`,
    {
    id,
    email: normalizedEmail,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: now,
    updatedAt: now
    }
  );
  const session = await createAdminSession(id);
  return res.status(201).json({ success: true, id, token: session.token, expiresAt: session.expiresAt });
});

router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };
  void logAuthEvent('login.request', {
    email,
    ip: req.ip,
    ua: req.headers['user-agent']
  });
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const settings = await loadAuthSettings();
  const limit = await getLoginLimit(normalizedEmail);
  if (limit?.cooldownUntil && new Date(limit.cooldownUntil).getTime() > Date.now()) {
    void logAuthEvent('login.cooldown', { email: normalizedEmail, cooldownUntil: limit.cooldownUntil });
    return res.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
  }
  const admin = await db.one<DbRow>(
    'SELECT id, email, passwordHash, passwordSalt, totpSecret FROM admin_users WHERE email = ? LIMIT 1',
    [normalizedEmail]
  );
  if (!admin) {
    await upsertLoginLimit(normalizedEmail, {
      failedAttempts: (limit?.failedAttempts || 0) + 1,
      lastFailedAt: new Date().toISOString()
    });
    void logAuthEvent('login.failed', { email: normalizedEmail, reason: 'not_found' });
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const { hash } = hashPassword(password, admin.passwordSalt);
  if (hash !== admin.passwordHash) {
    const nextFailed = (limit?.failedAttempts || 0) + 1;
    const cooldown =
      nextFailed >= settings.maxFailedAttempts
        ? new Date(Date.now() + settings.cooldownSeconds * 1000).toISOString()
        : null;
    await upsertLoginLimit(normalizedEmail, {
      failedAttempts: nextFailed,
      cooldownUntil: cooldown,
      lastFailedAt: new Date().toISOString()
    });
    void logAuthEvent('login.failed', { email: normalizedEmail, reason: 'bad_password', failedAttempts: nextFailed });
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const require2fa = settings.require2fa;
  const method = settings.verificationMethod;
  const trustedToken = Array.isArray(req.headers['x-trusted-device'])
    ? req.headers['x-trusted-device'][0]
    : req.headers['x-trusted-device'];
  if (require2fa && await isTrustedDevice(trustedToken, settings.trustDuration)) {
    const session = await createAdminSession(admin.id, settings.sessionMaxHours);
    await upsertLoginLimit(normalizedEmail, { failedAttempts: 0, cooldownUntil: null, lastFailedAt: null });
    void maybeSendLoginAlert(admin.email, req);
    void logAuthEvent('login.success', { email: normalizedEmail, method: 'trusted_device' });
    return res.json({ success: true, token: session.token, expiresAt: session.expiresAt });
  }
  if (!require2fa) {
    const session = await createAdminSession(admin.id, settings.sessionMaxHours);
    await upsertLoginLimit(normalizedEmail, { failedAttempts: 0, cooldownUntil: null, lastFailedAt: null });
    void maybeSendLoginAlert(admin.email, req);
    void logAuthEvent('login.success', { email: normalizedEmail, method: 'password' });
    return res.json({ success: true, token: session.token, expiresAt: session.expiresAt });
  }
  if (method === 'app' && !admin.totpSecret) {
    void logAuthEvent('login.otp_error', { email: normalizedEmail, method: 'app', reason: 'totp_not_configured' });
    return res.status(400).json({ error: 'Authenticator app not configured' });
  }
  if (method === 'app') {
    const challenge = await createLoginChallenge(admin.id, 'app', undefined, settings.otpExpiry);
    void logAuthEvent('login.otp_challenge', { email: normalizedEmail, method: 'app', otpId: challenge.id });
    return res.json({ success: false, requiresOtp: true, method: 'app', otpId: challenge.id });
  }
  const otpCode = generateNumericOtp(settings.otpLength);
  const challenge = await createLoginChallenge(admin.id, 'email', otpCode, settings.otpExpiry);
  if (!OTP_EMAIL_ENABLED) {
    void logAuthEvent('login.otp_dev_mode', {
      email: normalizedEmail,
      method: 'email',
      otpId: challenge.id,
      note: 'otp delivery disabled'
    });
    if (allowDevOtpExposure()) {
      return res.json({
        success: false,
        requiresOtp: true,
        method: 'email',
        otpId: challenge.id,
        devOtp: otpCode,
        warning: 'OTP email delivery is disabled; use this code instead.'
      });
    }
    await db.exec('DELETE FROM admin_login_challenges WHERE id = ?', [challenge.id]);
    return res.status(503).json({ error: 'OTP email delivery is disabled.' });
  }
  try {
    await sendOtpEmail(admin.email, otpCode);
    void logAuthEvent('login.otp_sent', { email: normalizedEmail, method: 'email', otpId: challenge.id });
  } catch (error) {
    void logAuthEvent('login.otp_error', {
      email: normalizedEmail,
      method: 'email',
      otpId: challenge.id,
      error: error instanceof Error ? error.message : 'send_failed'
    });
    if (allowDevOtpExposure()) {
      return res.json({
        success: false,
        requiresOtp: true,
        method: 'email',
        otpId: challenge.id,
        devOtp: otpCode,
        warning: error instanceof Error ? error.message : 'OTP email failed; using dev OTP.'
      });
    }
    await db.exec('DELETE FROM admin_login_challenges WHERE id = ?', [challenge.id]);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send OTP email.'
    });
  }
  return res.json({
    success: false,
    requiresOtp: true,
    method: 'email',
    otpId: challenge.id
  });
});

router.post('/admin/password-reset/request', async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const admin = await db.one<DbRow>('SELECT id, email FROM admin_users WHERE email = ? LIMIT 1', [normalizedEmail]);
  if (!admin) {
    return res.status(404).json({ error: 'Admin not found' });
  }
  const settings = await loadAuthSettings();
  const otpCode = generateNumericOtp(settings.otpLength);
  const challenge = await createLoginChallenge(admin.id, 'reset', otpCode, settings.otpExpiry);
  try {
    await sendOtpEmail(admin.email, otpCode);
  } catch (error) {
    if (allowDevOtpExposure()) {
      return res.json({
        success: true,
        otpId: challenge.id,
        devOtp: otpCode,
        warning: error instanceof Error ? error.message : 'Reset OTP email failed; using dev OTP.'
      });
    }
    await db.exec('DELETE FROM admin_login_challenges WHERE id = ?', [challenge.id]);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send reset code.'
    });
  }
  return res.json({ success: true, otpId: challenge.id });
});

router.post('/admin/password-reset/confirm', async (req, res) => {
  const { otpId, code, newPassword, confirmPassword } = req.body as {
    otpId?: string;
    code?: string;
    newPassword?: string;
    confirmPassword?: string;
  };
  if (!otpId || typeof otpId !== 'string' || !code || typeof code !== 'string') {
    return res.status(400).json({ error: 'OTP id and code are required' });
  }
  if (!newPassword || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'New password is required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Password confirmation does not match' });
  }
  const challenge = await db.one<DbRow>('SELECT * FROM admin_login_challenges WHERE id = ? LIMIT 1', [otpId]);
  if (!challenge || challenge.method !== 'reset') {
    return res.status(404).json({ error: 'Reset challenge not found' });
  }
  if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
    await db.exec('DELETE FROM admin_login_challenges WHERE id = ?', [otpId]);
    return res.status(400).json({ error: 'Reset code expired' });
  }
  const { hash } = hashPassword(code, challenge.codeSalt);
  if (hash !== challenge.codeHash) {
    await db.exec('UPDATE admin_login_challenges SET attempts = attempts + 1 WHERE id = ?', [otpId]);
    return res.status(401).json({ error: 'Invalid reset code' });
  }
  const admin = await db.one<DbRow>('SELECT id FROM admin_users WHERE id = ? LIMIT 1', [challenge.adminId]);
  if (!admin) {
    return res.status(404).json({ error: 'Admin not found' });
  }
  const { hash: passwordHash, salt: passwordSalt } = hashPassword(newPassword);
  await db.exec(
    `UPDATE admin_users SET
      passwordHash = @passwordHash,
      passwordSalt = @passwordSalt,
      updatedAt = @updatedAt
    WHERE id = @id`,
    {
    id: admin.id,
    passwordHash,
    passwordSalt,
    updatedAt: new Date().toISOString()
    }
  );
  await db.exec('DELETE FROM admin_login_challenges WHERE id = ?', [otpId]);
  return res.json({ success: true });
});

router.post('/admin/verify-otp', async (req, res) => {
  const { otpId, code, trustDevice, deviceLabel } = req.body as {
    otpId?: string;
    code?: string;
    trustDevice?: boolean;
    deviceLabel?: string;
  };
  void logAuthEvent('otp.verify_request', {
    otpId,
    ip: req.ip,
    ua: req.headers['user-agent']
  });
  if (!otpId || typeof otpId !== 'string' || !code || typeof code !== 'string') {
    return res.status(400).json({ error: 'OTP id and code are required' });
  }
  const challenge = await db.one<DbRow>('SELECT * FROM admin_login_challenges WHERE id = ? LIMIT 1', [otpId]);
  if (!challenge) {
    void logAuthEvent('otp.verify_failed', { otpId, reason: 'challenge_not_found' });
    return res.status(404).json({ error: 'OTP challenge not found' });
  }
  const settings = await loadAuthSettings();
  if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
    await db.exec('DELETE FROM admin_login_challenges WHERE id = ?', [otpId]);
    void logAuthEvent('otp.verify_failed', { otpId, reason: 'expired' });
    return res.status(400).json({ error: 'OTP expired' });
  }
  if (challenge.attempts >= settings.maxFailedAttempts) {
    await db.exec('DELETE FROM admin_login_challenges WHERE id = ?', [otpId]);
    void logAuthEvent('otp.verify_failed', { otpId, reason: 'too_many_attempts' });
    return res.status(429).json({ error: 'Too many attempts' });
  }
  const admin = await db.one<DbRow>(
    'SELECT id, email, totpSecret FROM admin_users WHERE id = ? LIMIT 1',
    [challenge.adminId]
  );
  if (!admin) {
    void logAuthEvent('otp.verify_failed', { otpId, reason: 'admin_not_found' });
    return res.status(404).json({ error: 'Admin not found' });
  }
  let isValid = false;
  if (challenge.method === 'app') {
    if (!admin.totpSecret) {
      void logAuthEvent('otp.verify_failed', { otpId, reason: 'totp_not_configured' });
      return res.status(400).json({ error: 'Authenticator app not configured' });
    }
    isValid = verifyTotp(admin.totpSecret, code);
  } else {
    const { hash } = hashPassword(code, challenge.codeSalt);
    isValid = hash === challenge.codeHash;
  }

  if (!isValid) {
    if (settings.backupCodesEnabled) {
      const backupCodes = await db.many<DbRow>(
        'SELECT id, codeHash, codeSalt FROM admin_backup_codes WHERE adminId = ? AND usedAt IS NULL',
        [admin.id]
      );
      const matchedBackup = backupCodes.find((backup) => {
        const { hash } = hashPassword(code, backup.codeSalt);
        return hash === backup.codeHash;
      });
      if (matchedBackup) {
        await db.exec('UPDATE admin_backup_codes SET usedAt = ? WHERE id = ?', [
          new Date().toISOString(),
          matchedBackup.id
        ]);
        const session = await createAdminSession(admin.id);
        void maybeSendLoginAlert(admin.email, req);
        return res.json({ success: true, token: session.token, expiresAt: session.expiresAt });
      }
    }

    await db.exec('UPDATE admin_login_challenges SET attempts = attempts + 1 WHERE id = ?', [otpId]);
    const updated = await db.one<DbRow>(
      'SELECT attempts FROM admin_login_challenges WHERE id = ?',
      [otpId]
    );
    if (updated?.attempts >= settings.maxFailedAttempts) {
      await db.exec('DELETE FROM admin_login_challenges WHERE id = ?', [otpId]);
      void logAuthEvent('otp.verify_failed', { otpId, reason: 'too_many_attempts' });
      return res.status(429).json({ error: 'Too many attempts' });
    }
    void logAuthEvent('otp.verify_failed', { otpId, reason: 'invalid_code' });
    return res.status(401).json({ error: 'Invalid OTP' });
  }

  await db.exec('DELETE FROM admin_login_challenges WHERE id = ?', [otpId]);
  const session = await createAdminSession(admin.id, settings.sessionMaxHours);
  await upsertLoginLimit(admin.email, { failedAttempts: 0, cooldownUntil: null, lastFailedAt: null });
  void maybeSendLoginAlert(admin.email, req);
  void logAuthEvent('otp.verify_success', { otpId, adminId: admin.id });
  let trustedDevice = null as null | { token: string; expiresAt: string };
  if (trustDevice) {
    const settings = await loadAuthSettings();
    const durationDays = Math.min(90, Math.max(7, Number(settings.trustDuration || 30)));
    trustedDevice = await createTrustedDevice(admin.id, durationDays, deviceLabel);
  }
  return res.json({
    success: true,
    token: session.token,
    expiresAt: session.expiresAt,
    trustedDevice
  });
});

router.post('/admin/logout', async (req, res) => {
  const header = req.headers['x-admin-session'];
  const token = Array.isArray(header) ? header[0] : header;
  if (token) {
    const session = await db.one<DbRow>('SELECT adminId FROM admin_sessions WHERE token = ?', [token]);
    await db.exec('DELETE FROM admin_sessions WHERE token = ?', [token]);
    if (session?.adminId) {
      await db.exec('DELETE FROM admin_trusted_devices WHERE adminId = ?', [session.adminId]);
    }
  }
  return res.json({ success: true });
});

router.get('/media-version', (_req, res) => {
  res.json({ version: getMediaVersion() });
});

router.get('/products', async (req, res) => {
  const placement = typeof req.query.placement === 'string' ? req.query.placement : undefined;
  const featured = typeof req.query.featured === 'string' ? req.query.featured : undefined;
  const limitParam = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const pageParam = typeof req.query.page === 'string' ? Number(req.query.page) : undefined;
  const conditions: string[] = ["status = 'published'"];
  const params: Record<string, string | number> = {};

  if (placement) {
    conditions.push('placement = @placement');
    params.placement = placement;
  }
  if (featured === 'true') {
    conditions.push('isFeatured = 1');
  }

  const sql = `
    SELECT * FROM products
    WHERE ${conditions.join(' AND ')}
    ORDER BY sortOrder ASC, createdAt DESC
  `;

  const safeLimit =
    typeof limitParam === 'number' && Number.isFinite(limitParam)
      ? Math.min(100, Math.max(1, Math.floor(limitParam)))
      : undefined;
  const safePage =
    typeof pageParam === 'number' && Number.isFinite(pageParam)
      ? Math.max(1, Math.floor(pageParam))
      : 1;

  const countRow = await db.one<DbRow>(
    `SELECT COUNT(*) as count FROM products WHERE ${conditions.join(' AND ')}`,
    params
  );
  if (safeLimit) {
    params.limit = safeLimit;
    params.offset = (safePage - 1) * safeLimit;
  }

  const rows = await db.many<DbRow>(
    safeLimit ? `${sql} LIMIT @limit OFFSET @offset` : sql,
    params
  );
  const products = rows.map((row) => ({
    ...row,
    galleryUrls: parseJsonArray(row.galleryUrls)
  }));
  res.setHeader('X-Total-Count', String(countRow?.count ?? products.length));
  return res.json(products);
});

router.get('/products/:id', async (req, res) => {
  const { id } = req.params;
  const row = await db.one<DbRow>(
    "SELECT * FROM products WHERE id = ? AND status = 'published' LIMIT 1",
    [id]
  );
  if (!row) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.json({ ...row, galleryUrls: parseJsonArray(row.galleryUrls) });
});

router.get('/theme', async (_req, res) => {
  const row = await db.one<DbRow>(
    'SELECT mode, seasonalTheme, customThemeId FROM theme_config ORDER BY updatedAt DESC LIMIT 1'
  );
  if (!row) {
    return res.json({ mode: 'light', seasonalTheme: 'none', customTheme: null });
  }
  let customTheme = null;
  if (row.customThemeId) {
    const custom = await db.one<DbRow>('SELECT id, name, themeValues FROM custom_themes WHERE id = ?', [
      row.customThemeId
    ]);
    if (custom) {
      customTheme = {
        id: custom.id,
        name: custom.name,
        values: JSON.parse(custom.themeValues || '{}')
      };
    }
  }
  return res.json({
    mode: row.mode,
    seasonalTheme: row.seasonalTheme,
    customTheme
  });
});

router.get('/ticker', async (_req, res) => {
  const value = await getSiteContentValue('hero_ticker');
  const items = Array.isArray(value) ? value : [];
  const leadRows = await db.many<DbRow>(
    "SELECT name, country, createdAt FROM leads WHERE isUnsubscribed = 0 AND name IS NOT NULL AND name <> '' ORDER BY createdAt DESC LIMIT 30"
  );
  const leadItems = leadRows.map((row, index) => ({
    name: String(row.name || '').trim(),
    country: typeof row.country === 'string' ? row.country : null,
    isActive: true,
    sortOrder: index
  })).filter((item) => item.name);
  const combined = leadItems.length ? leadItems : items;
  return res.json({ items: combined });
});

router.get('/footer-keywords', async (_req, res) => {
  const settings = await db.one<DbRow>(
    'SELECT footerKeywords FROM admin_settings ORDER BY updatedAt DESC LIMIT 1'
  );
  const fallback = [
    'Automation',
    'Affiliate Marketing',
    'Digital Products',
    'Email Funnels',
    'AI Content',
    'YouTube Growth'
  ];
  const rawItems = typeof settings?.footerKeywords === 'string'
    ? parseJsonArray(settings.footerKeywords)
    : fallback;
  const labels = rawItems
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        return typeof record.label === 'string' ? record.label.trim() : '';
      }
      return '';
    })
    .filter(Boolean);
  return res.json({ items: labels.length ? labels : fallback });
});

router.get('/cta-labels', async (_req, res) => {
  const settings = await db.one<DbRow>('SELECT ctaLabels FROM admin_settings ORDER BY updatedAt DESC LIMIT 1');
  const fallback = [
    'Subscribe for updates',
    'Get featured offers',
    'Subscribe to get access',
    'Notify me',
    'Proceed'
  ];
  const items = typeof settings?.ctaLabels === 'string'
    ? parseJsonArray(settings.ctaLabels)
    : fallback;
  return res.json({ items: items.length ? items : fallback });
});

router.get('/pages', async (_req, res) => {
  const rows = await db.many<DbRow>(
    "SELECT slug, title FROM pages WHERE status = 'published' ORDER BY createdAt DESC"
  );
  return res.json(rows);
});

router.get('/pages/:slug', async (req, res) => {
  const { slug } = req.params;
  const page = await db.one<DbRow>(
    "SELECT * FROM pages WHERE slug = ? AND status = 'published' LIMIT 1",
    [slug]
  );
  if (!page) {
    return res.status(404).json({ error: 'Not found' });
  }
  const sections = await db.many<DbRow>(
    'SELECT * FROM sections WHERE pageId = ? ORDER BY sortOrder ASC',
    [page.id]
  );
  return res.json({
    page,
    sections: sections.map((row) => ({
      ...row,
      data: (() => {
        try {
          return JSON.parse(row.data || '{}');
        } catch {
          return {};
        }
      })()
    }))
  });
});

const handlePublicSubscribe = async (req: Request, res: Response) => {
  const { name, email, phone, country, interests, source } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    country?: string;
    interests?: string[] | string;
    source?: string;
  };

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }
  if (!interests || (Array.isArray(interests) && interests.length === 0)) {
    return res.status(400).json({ success: false, error: 'Interests are required' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedInterests = Array.isArray(interests) ? interests : [String(interests)];
  const leadId = crypto.randomUUID();
  const now = new Date().toISOString();
  const unsubscribeToken = crypto.randomBytes(24).toString('hex');
  const confirmedAt = null;
  const continent = getContinentForCountry(typeof country === 'string' ? country : null);
  try {
    await db.exec(
      `INSERT INTO leads (
        id, name, email, phone, country, continent, interests, source,
        isUnsubscribed, unsubscribedAt, unsubscribeToken, confirmedAt, emailInvalid, emailFailureCount, isTestSubscriber, createdAt
      )
       VALUES (
        @id, @name, @email, @phone, @country, @continent, @interests, @source,
        @isUnsubscribed, @unsubscribedAt, @unsubscribeToken, @confirmedAt, @emailInvalid, @emailFailureCount, @isTestSubscriber, @createdAt
      )`,
      {
      id: leadId,
      name: name || null,
      email: normalizedEmail,
      phone: phone || null,
      country: typeof country === 'string' ? country : null,
      continent,
      interests: JSON.stringify(normalizedInterests),
      source: source || null,
      isUnsubscribed: 0,
      unsubscribedAt: null,
      unsubscribeToken,
      confirmedAt,
      emailInvalid: 0,
      emailFailureCount: 0,
      isTestSubscriber: 0,
      createdAt: now
      }
    );
  } catch (error) {
    const maybeCode = (error as { code?: string } | null)?.code;
    if (
      maybeCode === 'SQLITE_CONSTRAINT_UNIQUE' ||
      maybeCode === '23505' ||
      (error instanceof Error && error.message.includes('UNIQUE'))
    ) {
      const existing = await db.one<DbRow>(
        'SELECT id, isUnsubscribed, unsubscribeToken, confirmedAt FROM leads WHERE email = ? LIMIT 1',
        [normalizedEmail]
      );
      if (existing) {
        const wasUnsubscribed = Boolean(existing.isUnsubscribed);
        const updates: Record<string, unknown> = {
          id: existing.id,
          interests: JSON.stringify(normalizedInterests),
          updatedAt: now
        };
        const token = existing.unsubscribeToken || crypto.randomBytes(24).toString('hex');
        await db.exec(
          `UPDATE leads SET
            interests = @interests,
            isUnsubscribed = 0,
            unsubscribedAt = NULL,
            unsubscribeToken = @unsubscribeToken,
            confirmedAt = @confirmedAt,
            emailInvalid = 0,
            emailFailureCount = 0,
            isTestSubscriber = 0
          WHERE id = @id`,
          {
          id: existing.id,
          interests: JSON.stringify(normalizedInterests),
          unsubscribeToken: token,
          confirmedAt: wasUnsubscribed ? null : (existing.confirmedAt ?? null)
          }
        );
        const logWelcomeError = (error: unknown) => {
          const message = error instanceof Error ? error.message : 'Welcome email failed';
          console.warn(`[welcome-email] ${message}`);
        };
        const shouldSendWelcome = wasUnsubscribed || !existing.confirmedAt;
        if (shouldSendWelcome) {
          try {
            const config = await loadWelcomeEmailConfig();
            if (config && config.enabled) {
              const baseUrl = PUBLIC_URL || 'http://localhost:5173';
              const base = baseUrl.replace(/\/$/, '');
              const confirmationUrl = `${base}/api/public/confirm?token=${token}`;
              const unsubscribeUrl = `${base}/unsubscribe?token=${token}`;
              const preferencesUrl = `${base}/preferences?token=${token}`;
              const send = async () =>
                sendWelcomeEmail(
                  normalizedEmail,
                  {
                    subject: typeof config.subject === 'string' ? config.subject : 'Welcome!',
                    fromName: null,
                    fromEmail: null,
                    replyTo: null,
                    body: typeof config.body === 'string' ? config.body : ''
                  },
                  { confirmationUrl, unsubscribeUrl, preferencesUrl }
                );
              const delayMins = Number.isFinite(Number(config.sendDelayMins)) ? Number(config.sendDelayMins) : 0;
              if (delayMins > 0) {
                setTimeout(() => {
                  void send().catch(logWelcomeError);
                }, delayMins * 60 * 1000);
              } else {
                void send().catch(logWelcomeError);
              }
            }
          } catch (error) {
            logWelcomeError(error);
          }
        }
        if (wasUnsubscribed) {
          emitContentUpdate('subscriber', { source: source || null });
          void refreshSegmentsSummaryCache();
          void broadcastSegmentsUpdate();
          void refreshSourcesSummaryCache();
          void broadcastSourcesUpdate();
        }
        return res.json({
          success: true,
          leadId: existing.id,
          alreadySubscribed: !wasUnsubscribed,
          reactivated: wasUnsubscribed
        });
      }
      return res.json({ success: true, leadId: null, alreadySubscribed: true });
    }
    throw error;
  }
  emitContentUpdate('subscriber', { source: source || null });
  void refreshSegmentsSummaryCache();
  void broadcastSegmentsUpdate();
  void refreshSourcesSummaryCache();
  void broadcastSourcesUpdate();
  try {
    const { handleAutomationEnrollment } = require('../services/automationService');
    handleAutomationEnrollment('signup', leadId);
  } catch {
    // Ignore automation hook errors.
  }
  const logWelcomeError = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Welcome email failed';
    console.warn(`[welcome-email] ${message}`);
  };
  try {
    const config = await loadWelcomeEmailConfig();
    if (config && config.enabled) {
      const baseUrl = PUBLIC_URL || 'http://localhost:5173';
      const base = baseUrl.replace(/\/$/, '');
      const confirmationUrl = `${base}/api/public/confirm?token=${unsubscribeToken}`;
      const unsubscribeUrl = `${base}/unsubscribe?token=${unsubscribeToken}`;
      const preferencesUrl = `${base}/preferences?token=${unsubscribeToken}`;
      const send = async () =>
        sendWelcomeEmail(
          normalizedEmail,
          {
            subject: typeof config.subject === 'string' ? config.subject : 'Welcome!',
            fromName: null,
            fromEmail: null,
            replyTo: null,
            body: typeof config.body === 'string' ? config.body : ''
          },
          { confirmationUrl, unsubscribeUrl, preferencesUrl }
        );
      const delayMins = Number.isFinite(Number(config.sendDelayMins)) ? Number(config.sendDelayMins) : 0;
      if (delayMins > 0) {
        setTimeout(() => {
          void send().catch(logWelcomeError);
        }, delayMins * 60 * 1000);
      } else {
        void send().catch(logWelcomeError);
      }
    }
  } catch (error) {
    logWelcomeError(error);
  }
  return res.json({ success: true, leadId, alreadySubscribed: false });
};

router.post('/subscribe', handlePublicSubscribe);

router.get('/confirm', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const wantsJson =
    req.query.mode === 'json' ||
    (typeof req.headers.accept === 'string' && req.headers.accept.includes('application/json'));
  if (!token) {
    return wantsJson
      ? res.status(400).json({ error: 'Missing confirmation token.' })
      : res.status(400).send('Missing confirmation token.');
  }
  const lead = await db.one<DbRow>(
    'SELECT id, confirmedAt FROM leads WHERE unsubscribeToken = ? LIMIT 1',
    [token]
  );
  if (!lead) {
    return wantsJson
      ? res.status(404).json({ error: 'Invalid confirmation token.' })
      : res.status(404).send('Invalid confirmation token.');
  }
  if (!lead.confirmedAt) {
    await db.exec('UPDATE leads SET confirmedAt = @confirmedAt WHERE id = @id', {
      id: lead.id,
      confirmedAt: new Date().toISOString()
    });
  }
  if (wantsJson) {
    return res.json({ ok: true });
  }
  const baseUrl = PUBLIC_URL || 'http://localhost:5173';
  const base = baseUrl.replace(/\/$/, '');
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  return res.redirect(302, `${base}/confirm${qs}`);
});

router.post('/unsubscribe', async (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token is required' });
  }
  const lead = await db.one<DbRow>(
    'SELECT id, isUnsubscribed, source FROM leads WHERE unsubscribeToken = ? LIMIT 1',
    [token]
  );
  if (!lead) {
    return res.status(404).json({ error: 'Invalid token' });
  }
  const now = new Date().toISOString();
  await db.exec(
    `UPDATE leads SET
      isUnsubscribed = 1,
      unsubscribedAt = @unsubscribedAt
     WHERE id = @id`,
    { id: lead.id, unsubscribedAt: now }
  );
  await db.exec(
    `INSERT INTO email_events (id, eventType, subscriberId, campaignId, automationId, createdAt)
     VALUES (@id, @eventType, @subscriberId, @campaignId, @automationId, @createdAt)`,
    {
    id: crypto.randomUUID(),
    eventType: 'unsubscribe',
    subscriberId: lead.id,
    campaignId: null,
    automationId: null,
    createdAt: now
    }
  );
  emitContentUpdate('unsubscribe', { source: lead?.source || null });
  void refreshSegmentsSummaryCache();
  void broadcastSegmentsUpdate();
  void refreshSourcesSummaryCache();
  void broadcastSourcesUpdate();
  return res.json({ ok: true });
});

router.post('/preferences', async (req, res) => {
  const { token, topics } = req.body as { token?: string; topics?: string[] };
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token is required' });
  }
  const lead = await db.one<DbRow>('SELECT id FROM leads WHERE unsubscribeToken = ? LIMIT 1', [token]);
  if (!lead) {
    return res.status(404).json({ error: 'Invalid token' });
  }
  const normalizedTopics = Array.isArray(topics) ? topics.filter((item) => typeof item === 'string') : [];
  await db.exec('UPDATE leads SET interests = @interests WHERE id = @id', {
    id: lead.id,
    interests: JSON.stringify(normalizedTopics)
  });
  emitContentUpdate('preferences');
  return res.json({ ok: true });
});

router.get('/preferences', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    return res.status(400).json({ error: 'Invalid token' });
  }
  const lead = await db.one<DbRow>('SELECT interests FROM leads WHERE unsubscribeToken = ? LIMIT 1', [token]);
  if (!lead) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  let preferences = '';
  if (typeof lead.interests === 'string' && lead.interests.trim()) {
    try {
      const parsed = JSON.parse(lead.interests);
      if (Array.isArray(parsed)) {
        preferences = parsed.filter((item) => typeof item === 'string').join(', ');
      }
    } catch {
      preferences = '';
    }
  }
  return res.json({ preferences });
});

router.post('/track/click', async (req, res) => {
  const { productId, leadId, sessionId, source, campaignId, url } = req.body as {
    productId?: string;
    leadId?: string;
    sessionId?: string;
    source?: string;
    campaignId?: string;
    url?: string;
  };
  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ success: false, error: 'productId is required' });
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const resolvedUrl = typeof url === 'string' && url.trim()
    ? url.trim()
    : (await db.one<DbRow>('SELECT affiliateLink FROM products WHERE id = ? LIMIT 1', [productId]))?.affiliateLink || null;
  const metaParts: string[] = [];
  if (productId) metaParts.push(`product=${encodeURIComponent(productId)}`);
  if (source) metaParts.push(`source=${encodeURIComponent(source)}`);
  if (sessionId) metaParts.push(`session=${encodeURIComponent(sessionId)}`);
  const metaSuffix = metaParts.length ? `#${metaParts.join('&')}` : '';
  const trackedUrl = resolvedUrl ? `${resolvedUrl}${metaSuffix}` : `product:${productId}${metaSuffix}`;
  await db.exec(
    `INSERT INTO email_events (id, eventType, subscriberId, campaignId, automationId, url, userAgent, ip, createdAt)
     VALUES (@id, @eventType, @subscriberId, @campaignId, @automationId, @url, @userAgent, @ip, @createdAt)`,
    {
    id: crypto.randomUUID(),
    eventType: 'click',
    subscriberId: leadId || null,
    campaignId: typeof campaignId === 'string' ? campaignId : null,
    automationId: null,
    url: trackedUrl,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    ip: req.ip,
    createdAt: now
    }
  );
  emitContentUpdate('click', {
    campaignId: typeof campaignId === 'string' ? campaignId : null,
    subscriberId: leadId || null,
    url: trackedUrl,
    createdAt: now
  });
  return res.json({ success: true });
});

router.get('/track/open/:campaignId/:token.png', async (req, res) => {
  const { campaignId, token } = req.params;
  const isPreview = campaignId === 'preview' || token === 'preview' || campaignId === 'test' || token === 'test';
  const campaign = await db.one<DbRow>('SELECT id FROM email_campaigns WHERE id = ? LIMIT 1', [campaignId]);
  if (!campaign) {
    res.status(404);
  } else if (token && !isPreview) {
    const lead = await db.one<DbRow>('SELECT id FROM leads WHERE unsubscribeToken = ? LIMIT 1', [token]);
    const now = new Date().toISOString();
    await db.exec(
      `INSERT INTO email_events (id, eventType, subscriberId, campaignId, automationId, url, userAgent, ip, createdAt)
       VALUES (@id, @eventType, @subscriberId, @campaignId, @automationId, @url, @userAgent, @ip, @createdAt)`,
      {
      id: crypto.randomUUID(),
      eventType: 'open',
      subscriberId: lead?.id || null,
      campaignId,
      automationId: null,
      url: null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      ip: req.ip,
      createdAt: now
      }
    );
    emitContentUpdate('open', {
      campaignId,
      subscriberId: lead?.id || null,
      createdAt: now
    });
  }

  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
    'base64'
  );
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Content-Length', pixel.length);
  res.status(200).end(pixel);
});

router.get('/track/open/automation/:automationId/:token.png', async (req, res) => {
  const { automationId, token } = req.params;
  const isPreview = automationId === 'preview' || token === 'preview' || automationId === 'test' || token === 'test';
  const automation = await db.one<DbRow>('SELECT id FROM email_automations WHERE id = ? LIMIT 1', [automationId]);
  if (!automation) {
    res.status(404);
  } else if (token && !isPreview) {
    const lead = await db.one<DbRow>('SELECT id FROM leads WHERE unsubscribeToken = ? LIMIT 1', [token]);
    const now = new Date().toISOString();
    await db.exec(
      `INSERT INTO email_events (id, eventType, subscriberId, campaignId, automationId, url, userAgent, ip, createdAt)
       VALUES (@id, @eventType, @subscriberId, @campaignId, @automationId, @url, @userAgent, @ip, @createdAt)`,
      {
      id: crypto.randomUUID(),
      eventType: 'open',
      subscriberId: lead?.id || null,
      campaignId: null,
      automationId,
      url: null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      ip: req.ip,
      createdAt: now
      }
    );
    emitContentUpdate('open', {
      automationId,
      subscriberId: lead?.id || null,
      createdAt: now
    });
  }

  const pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
    'base64'
  );
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Content-Length', pixel.length);
  res.status(200).end(pixel);
});

export const handleTrackedClick = async (req: Request, res: Response) => {
  // Redirect through the tracker and log the destination click.
  const { campaignId, token } = req.params as { campaignId: string; token: string };
  const destination = typeof req.query.u === 'string' ? req.query.u : '';
  if (!destination) {
    return res.status(400).json({ error: 'Destination url is required' });
  }
  if (campaignId === 'preview' || token === 'preview' || campaignId === 'test' || token === 'test') {
    return res.redirect(302, destination);
  }
  const campaign = await db.one<DbRow>('SELECT id FROM email_campaigns WHERE id = ? LIMIT 1', [campaignId]);
  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }
  const lead = token
    ? await db.one<DbRow>('SELECT id FROM leads WHERE unsubscribeToken = ? LIMIT 1', [token])
    : undefined;
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO email_events (id, eventType, subscriberId, campaignId, automationId, url, userAgent, ip, createdAt)
     VALUES (@id, @eventType, @subscriberId, @campaignId, @automationId, @url, @userAgent, @ip, @createdAt)`,
    {
    id: crypto.randomUUID(),
    eventType: 'click',
    subscriberId: lead?.id || null,
    campaignId,
    automationId: null,
    url: destination,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    ip: req.ip,
    createdAt: now
    }
  );
  emitContentUpdate('click', {
    campaignId,
    subscriberId: lead?.id || null,
    url: destination,
    createdAt: now
  });
  return res.redirect(302, destination);
};

export const handleTrackedAutomationClick = async (req: Request, res: Response) => {
  const { automationId, token } = req.params as { automationId: string; token: string };
  const destination = typeof req.query.u === 'string' ? req.query.u : '';
  if (!destination) {
    return res.status(400).json({ error: 'Destination url is required' });
  }
  if (automationId === 'preview' || token === 'preview' || automationId === 'test' || token === 'test') {
    return res.redirect(302, destination);
  }
  const automation = await db.one<DbRow>('SELECT id FROM email_automations WHERE id = ? LIMIT 1', [automationId]);
  if (!automation) {
    return res.status(404).json({ error: 'Automation not found' });
  }
  const lead = token
    ? await db.one<DbRow>('SELECT id FROM leads WHERE unsubscribeToken = ? LIMIT 1', [token])
    : undefined;
  const now = new Date().toISOString();
  await db.exec(
    `INSERT INTO email_events (id, eventType, subscriberId, campaignId, automationId, url, userAgent, ip, createdAt)
     VALUES (@id, @eventType, @subscriberId, @campaignId, @automationId, @url, @userAgent, @ip, @createdAt)`,
    {
    id: crypto.randomUUID(),
    eventType: 'click',
    subscriberId: lead?.id || null,
    campaignId: null,
    automationId,
    url: destination,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    ip: req.ip,
    createdAt: now
    }
  );
  emitContentUpdate('click', {
    automationId,
    subscriberId: lead?.id || null,
    url: destination,
    createdAt: now
  });
  return res.redirect(302, destination);
};

export default router;
export { handlePublicSubscribe };
