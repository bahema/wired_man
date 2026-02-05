-- Supabase Postgres schema (generated from sqlite schema)
CREATE TABLE IF NOT EXISTS hero_config (
  id TEXT PRIMARY KEY,
  isActive INTEGER NOT NULL DEFAULT 1,
  theme TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  highlightText TEXT,
  backgroundImageUrl TEXT,
  heroBadge TEXT,
  primaryCtaLabel TEXT NOT NULL,
  primaryCtaAction TEXT NOT NULL,
  primaryCtaLink TEXT,
  secondaryCtaLabel TEXT,
  secondaryCtaLink TEXT,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS featured_slots (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  productId TEXT,
  title TEXT,
  subtitle TEXT,
  imageUrl TEXT,
  priceText TEXT,
  ctaLabel TEXT NOT NULL,
  ctaAction TEXT NOT NULL,
  ctaLink TEXT,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isActive INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  placement TEXT NOT NULL DEFAULT 'home',
  imageUrl TEXT,
  galleryUrls TEXT,
  affiliateLink TEXT,
  ctaLabel TEXT NOT NULL DEFAULT 'Get Access',
  priceText TEXT,
  rating REAL,
  isFeatured INTEGER NOT NULL DEFAULT 0,
  isNew INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS testimonials (
  id TEXT PRIMARY KEY,
  authorName TEXT NOT NULL,
  authorRole TEXT,
  authorLocation TEXT,
  quote TEXT NOT NULL,
  avatarUrl TEXT,
  rating REAL,
  isFeatured INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  country TEXT,
  continent TEXT,
  interests TEXT NOT NULL,
  source TEXT,
  isUnsubscribed INTEGER NOT NULL DEFAULT 0,
  unsubscribedAt TEXT,
  unsubscribeToken TEXT,
  confirmedAt TEXT,
  emailInvalid INTEGER NOT NULL DEFAULT 0,
  emailFailureCount INTEGER NOT NULL DEFAULT 0,
  isTestSubscriber INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saved_segments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  continent TEXT NOT NULL,
  source TEXT NOT NULL,
  engagement TEXT NOT NULL DEFAULT 'all',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  paramsJson TEXT NOT NULL,
  filePath TEXT,
  fileUrl TEXT,
  error TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  completedAt TEXT
);

CREATE TABLE IF NOT EXISTS schedule_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'campaign',
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'draft',
  scheduledAt TEXT NOT NULL,
  durationMins INTEGER NOT NULL DEFAULT 60,
  ownerId TEXT,
  notes TEXT,
  relatedType TEXT,
  relatedId TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_activity (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT,
  metaJson TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS segments_summary_cache (
  id TEXT PRIMARY KEY,
  payloadJson TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources_summary_cache (
  id TEXT PRIMARY KEY,
  payloadJson TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_aliases (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL UNIQUE,
  canonical TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS export_schedules (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  frequency TEXT NOT NULL,
  paramsJson TEXT NOT NULL,
  nextRunAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clicks (
  id TEXT PRIMARY KEY,
  productId TEXT NOT NULL,
  leadId TEXT,
  sessionId TEXT,
  source TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS click_migrations (
  clickId TEXT PRIMARY KEY,
  migratedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS upcoming_products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  dateLabel TEXT NOT NULL,
  details TEXT NOT NULL,
  imageUrl TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  isNew INTEGER NOT NULL DEFAULT 0,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  src TEXT NOT NULL,
  poster TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  isNew INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS theme_config (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'light',
  seasonalTheme TEXT NOT NULL DEFAULT 'none',
  customThemeId TEXT,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  themeValues TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  templateId TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  pageId TEXT NOT NULL,
  type TEXT NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client_sections (
  id TEXT PRIMARY KEY,
  pageKey TEXT NOT NULL,
  type TEXT NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sections TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subjectDefault TEXT,
  html TEXT NOT NULL,
  category TEXT,
  tags TEXT,
  thumbnailUrl TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  valueJson TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_campaign_migrations (
  legacyId TEXT PRIMARY KEY,
  canonicalId TEXT NOT NULL,
  migratedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  audience TEXT,
  scheduledAt TEXT,
  templateId TEXT,
  productId TEXT,
  heroImage TEXT,
  ctaText TEXT,
  ctaLink TEXT,
  notes TEXT,
  subject TEXT,
  previewText TEXT,
  bodyHtml TEXT,
  bodyText TEXT,
  senderName TEXT,
  senderEmail TEXT,
  replyToEmail TEXT,
  sentAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  templateId TEXT NOT NULL,
  subject TEXT,
  htmlOverride TEXT,
  abEnabled INTEGER NOT NULL DEFAULT 0,
  subjectA TEXT,
  subjectB TEXT,
  templateIdA TEXT,
  templateIdB TEXT,
  splitRatio INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'draft',
  filterJson TEXT,
  scheduledAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_send_logs (
  id TEXT PRIMARY KEY,
  campaignId TEXT NOT NULL,
  subscriberId TEXT,
  toEmail TEXT NOT NULL,
  variant TEXT,
  skipReason TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  sentAt TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_events (
  id TEXT PRIMARY KEY,
  eventType TEXT NOT NULL,
  subscriberId TEXT,
  campaignId TEXT,
  automationId TEXT,
  url TEXT,
  userAgent TEXT,
  ip TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  triggerType TEXT NOT NULL,
  triggerJson TEXT,
  filterJson TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_automation_steps (
  id TEXT PRIMARY KEY,
  automationId TEXT NOT NULL,
  stepOrder INTEGER NOT NULL DEFAULT 0,
  stepType TEXT NOT NULL,
  templateId TEXT,
  subjectOverride TEXT,
  htmlOverride TEXT,
  delayMinutes INTEGER,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_automation_enrollments (
  id TEXT PRIMARY KEY,
  automationId TEXT NOT NULL,
  subscriberId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  currentStep INTEGER NOT NULL DEFAULT 0,
  nextRunAt TEXT,
  lastError TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_automation_logs (
  id TEXT PRIMARY KEY,
  automationId TEXT NOT NULL,
  subscriberId TEXT NOT NULL,
  stepId TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  sentAt TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_jobs (
  id TEXT PRIMARY KEY,
  campaignId TEXT NOT NULL,
  subscriberId TEXT,
  toEmail TEXT NOT NULL,
  payloadJson TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  maxAttempts INTEGER NOT NULL DEFAULT 3,
  runAt TEXT NOT NULL,
  lockedAt TEXT,
  lockedBy TEXT,
  lastError TEXT,
  skipReason TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  passwordSalt TEXT NOT NULL,
  totpSecret TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id TEXT PRIMARY KEY,
  adminId TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  lastSeen TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_trusted_devices (
  id TEXT PRIMARY KEY,
  adminId TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  label TEXT,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_backup_codes (
  id TEXT PRIMARY KEY,
  adminId TEXT NOT NULL,
  codeHash TEXT NOT NULL,
  codeSalt TEXT NOT NULL,
  usedAt TEXT,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_login_challenges (
  id TEXT PRIMARY KEY,
  adminId TEXT NOT NULL,
  method TEXT NOT NULL,
  codeHash TEXT,
  codeSalt TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_login_limits (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  failedAttempts INTEGER NOT NULL DEFAULT 0,
  cooldownUntil TEXT,
  lastFailedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_settings (
  id TEXT PRIMARY KEY,
  senderName TEXT NOT NULL,
  senderEmail TEXT NOT NULL,
  replyToEmail TEXT NOT NULL,
  organizationName TEXT NOT NULL,
  adminEmail TEXT NOT NULL,
  smtpProvider TEXT NOT NULL DEFAULT 'custom',
  smtpHost TEXT,
  smtpPort INTEGER,
  smtpSecure INTEGER NOT NULL DEFAULT 0,
  smtpUser TEXT,
  smtpPass TEXT,
  smtpFrom TEXT,
  smtpLastKnownGood INTEGER NOT NULL DEFAULT 0,
  smtpLastKnownGoodSnapshot TEXT,
  deliverabilityDomain TEXT,
  dkimSelector TEXT,
  require2fa INTEGER NOT NULL DEFAULT 1,
  verificationMethod TEXT NOT NULL DEFAULT 'email',
  otpLength INTEGER NOT NULL DEFAULT 6,
  otpExpiry INTEGER NOT NULL DEFAULT 10,
  backupCodesEnabled INTEGER NOT NULL DEFAULT 1,
  trustDuration INTEGER NOT NULL DEFAULT 30,
  rememberDeviceDefault INTEGER NOT NULL DEFAULT 1,
  alertsEnabled INTEGER NOT NULL DEFAULT 1,
  alertRecipients TEXT NOT NULL,
  alertFrequency TEXT NOT NULL DEFAULT 'instant',
  alertLastSentAt TEXT,
  deliverabilityLive INTEGER NOT NULL DEFAULT 1,
  maxFailedAttempts INTEGER NOT NULL DEFAULT 3,
  cooldownSeconds INTEGER NOT NULL DEFAULT 30,
  sessionIdleMins INTEGER NOT NULL DEFAULT 20,
  sessionMaxHours INTEGER NOT NULL DEFAULT 8,
  footerKeywords TEXT,
  ctaLabels TEXT,
  sectionVisibility TEXT,
  complianceText TEXT,
  welcomeEmailConfig TEXT,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deliverability_checklist (
  id TEXT PRIMARY KEY,
  itemId TEXT NOT NULL UNIQUE,
  acknowledgedAt TEXT NOT NULL,
  acknowledgedBy TEXT
);

CREATE INDEX IF NOT EXISTS client_sections_pageKey_idx ON client_sections(pageKey);
CREATE UNIQUE INDEX IF NOT EXISTS leads_unsubscribe_token_idx ON leads(unsubscribeToken);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads(createdAt);
CREATE INDEX IF NOT EXISTS leads_source_idx ON leads(source);
CREATE INDEX IF NOT EXISTS leads_unsubscribed_idx ON leads(isUnsubscribed);
CREATE INDEX IF NOT EXISTS leads_email_invalid_idx ON leads(emailInvalid);
CREATE INDEX IF NOT EXISTS leads_test_subscriber_idx ON leads(isTestSubscriber);
CREATE INDEX IF NOT EXISTS export_jobs_status_idx ON export_jobs(status);
CREATE INDEX IF NOT EXISTS admin_activity_created_idx ON admin_activity(createdAt);
CREATE INDEX IF NOT EXISTS segments_summary_updated_idx ON segments_summary_cache(updatedAt);
CREATE INDEX IF NOT EXISTS sources_summary_updated_idx ON sources_summary_cache(updatedAt);
CREATE INDEX IF NOT EXISTS export_schedules_next_run_idx ON export_schedules(nextRunAt);
CREATE INDEX IF NOT EXISTS source_aliases_alias_idx ON source_aliases(alias);
CREATE INDEX IF NOT EXISTS schedule_items_scheduled_idx ON schedule_items(scheduledAt);
CREATE INDEX IF NOT EXISTS schedule_items_status_idx ON schedule_items(status);
CREATE INDEX IF NOT EXISTS email_events_type_idx ON email_events(eventType);
CREATE INDEX IF NOT EXISTS email_events_created_idx ON email_events(createdAt);
CREATE INDEX IF NOT EXISTS email_events_campaign_idx ON email_events(campaignId);
CREATE INDEX IF NOT EXISTS email_events_automation_idx ON email_events(automationId);
CREATE INDEX IF NOT EXISTS email_events_subscriber_idx ON email_events(subscriberId);
CREATE INDEX IF NOT EXISTS email_events_url_idx ON email_events(url);
CREATE INDEX IF NOT EXISTS email_events_type_created_idx ON email_events(eventType, createdAt);
CREATE INDEX IF NOT EXISTS email_events_campaign_type_created_idx ON email_events(campaignId, eventType, createdAt);
CREATE INDEX IF NOT EXISTS email_events_automation_type_created_idx ON email_events(automationId, eventType, createdAt);
CREATE INDEX IF NOT EXISTS email_events_subscriber_campaign_type_idx ON email_events(subscriberId, campaignId, eventType);
CREATE INDEX IF NOT EXISTS email_events_subscriber_automation_type_idx ON email_events(subscriberId, automationId, eventType);
CREATE INDEX IF NOT EXISTS email_automations_status_idx ON email_automations(status);
CREATE INDEX IF NOT EXISTS email_automation_steps_automation_idx ON email_automation_steps(automationId);
CREATE INDEX IF NOT EXISTS email_automation_enrollments_automation_idx ON email_automation_enrollments(automationId);
CREATE INDEX IF NOT EXISTS email_automation_enrollments_subscriber_idx ON email_automation_enrollments(subscriberId);
CREATE INDEX IF NOT EXISTS email_automation_logs_automation_idx ON email_automation_logs(automationId);
CREATE INDEX IF NOT EXISTS email_automation_logs_step_idx ON email_automation_logs(stepId);
