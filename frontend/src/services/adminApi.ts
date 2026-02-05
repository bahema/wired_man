import { apiClient } from './apiClient';
import {
  FeaturedSlot,
  HeroConfig,
  Product,
  Testimonial,
  UpcomingProduct,
  VideoAd
} from './publicApi';

export type AdminHeroPayload = HeroConfig;
export type AdminFeaturedSlot = FeaturedSlot;
export type AdminProduct = Product;
export type AdminTestimonial = Testimonial;
export type AdminUpcomingProduct = UpcomingProduct;
export type AdminVideoAd = VideoAd & {
  isActive: number | boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminThemeConfig = {
  id: string;
  mode: 'light' | 'dark';
  seasonalTheme: string;
  customThemeId?: string | null;
  updatedAt: string;
};

export type AdminFooterKeyword = {
  label: string;
  url?: string | null;
};

export type AdminVisibilitySection = {
  label: string;
  active: boolean;
};

export type AdminWelcomeEmailConfig = {
  enabled: boolean;
  subject: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  sendDelayMins: number;
  body: string;
};

export type AdminComplianceSettings = {
  text: string;
  welcomeEmail: AdminWelcomeEmailConfig;
};

export type CustomTheme = {
  id: string;
  name: string;
  values: Record<string, string>;
  createdAt: string;
};

export type AdminAnalytics = {
  totals: {
    subscribers: number;
    totalUnsubscribed: number;
    clicksTotal: number;
    opensTotal: number;
    uniqueOpenersTotal: number;
  };
  last7Days: {
    subscribers: number;
    clicks: number;
    opens: number;
    uniqueOpens: number;
  };
  previous7Days?: {
    subscribers: number;
    clicks: number;
    opens: number;
    uniqueOpens: number;
    unsubscribes: number;
    deliverability: {
      queued7d: number;
      sent7d: number;
      failed7d: number;
      skipped7d: number;
    };
  };
  trends: {
    labels: string[];
    subscribersByDay: number[];
    clicksByDay: number[];
    opensByDay?: number[];
    unsubscribesByDay?: number[];
    queuedByDay?: number[];
    sentByDay?: number[];
    failedByDay?: number[];
    skippedByDay?: number[];
    sourcesByDay?: Array<{ label: string; counts: number[] }>;
  };
  sources: Array<{
    label: string;
    count: number;
    percent: number;
  }>;
  recentSubscribers: Array<{
    id: string;
    name?: string | null;
    email: string;
    phone?: string | null;
    country?: string | null;
    source?: string | null;
    confirmedAt?: string | null;
    createdAt: string;
  }>;
  welcomeEmailLastSentAt?: string | null;
  // Aggregated campaign-level click performance.
  campaignClickStats: {
    uniqueClickers: number;
    totalClicks: number;
    clickRate: number;
  };
  campaignsSummary: {
    total: number;
    byStatus: Record<string, number>;
  };
  automationsSummary: {
    total: number;
    byStatus: Record<string, number>;
  };
  topCampaigns: Array<{
    id: string;
    name: string;
    sentCount: number;
    totalClicks: number;
    uniqueClickers: number;
    uniqueOpens: number;
    totalOpens: number;
  }>;
  topAutomations: Array<{
    id: string;
    name: string;
    sentCount: number;
    totalClicks: number;
    uniqueClickers: number;
    uniqueOpens: number;
    totalOpens: number;
  }>;
  // Top links broken down by recent and all-time performance.
  topLinksLast7Days: Array<{
    url: string;
    clicks: number;
  }>;
  topLinksAllTime: Array<{
    url: string;
    clicks: number;
  }>;
  deliverability: {
    queued7d: number;
    sent7d: number;
    failed7d: number;
    skipped7d: number;
    failureRate: number;
    deliveryRate: number;
    avgSendSpeed: number;
    recentErrors: Array<{
      campaignId?: string | null;
      subscriberId?: string | null;
      message?: string | null;
      createdAt?: string | null;
    }>;
  };
  unsubscribes: {
    last7Days: number;
    total: number;
  };
};

export type DeliverabilityStatus = {
  spfConfigured: boolean;
  dkimConfigured: boolean;
  dmarcConfigured: boolean;
  details?: {
    domain: string;
    selector: string;
    spfHost: string;
    dkimHost: string;
    dmarcHost: string;
    spfCheck: 'ok' | 'missing' | 'unavailable';
    dkimCheck: 'ok' | 'missing' | 'unavailable';
    dmarcCheck: 'ok' | 'missing' | 'unavailable';
    spfRecord: string;
    dkimRecord: string;
    dmarcRecord: string;
    lastCheckedAt: string;
  };
};

export type DeliverabilityChecklist = {
  dns: {
    spfConfigured: boolean;
    dkimConfigured: boolean;
    dmarcConfigured: boolean;
  };
  config: {
    smtpConfigured: boolean;
    publicUrl: string;
    publicUrlIsHttps: boolean;
    sendRatePerMinute: number;
    sendRatePerHour: number;
  };
  provider: {
    name: string;
    host: string;
  };
  recordTemplates: {
    spf: string;
    dkim: string;
    dmarc: string;
  };
  recommendations: Array<{
    id: string;
    label: string;
    ok: boolean;
  }>;
  acknowledgements: Record<string, { acknowledgedAt: string; acknowledgedBy: string | null }>;
};

export type SuppressedLead = {
  id: string;
  name?: string | null;
  email: string;
  phone?: string | null;
  country?: string | null;
  source?: string | null;
  createdAt: string;
  reason: 'unsubscribed' | 'email_invalid';
};

export type SuppressedLeadsResponse = {
  page: number;
  total: number;
  totalPages: number;
  items: SuppressedLead[];
};

export type DeliverabilityTrends = {
  windowDays: number;
  labels: string[];
  series: {
    sent: number[];
    failed: number[];
    skipped: number[];
    queued: number[];
  };
  summary: {
    totals: {
      sent: number;
      failed: number;
      skipped: number;
      queued: number;
    };
    deliveryRate: number;
    failureRate: number;
    skipRate: number;
  };
};

export type DeliverabilityError = {
  id: string;
  campaignId?: string | null;
  subscriberId?: string | null;
  message: string;
  createdAt: string;
};

export type CalendarItem = {
  id: string;
  title: string;
  type: 'campaign' | 'automation' | 'content' | 'other';
  channel: 'email' | 'sms' | 'social' | 'web' | 'other';
  status: 'draft' | 'scheduled' | 'sent' | 'cancelled';
  scheduledAt: string;
  durationMins: number;
  ownerId?: string | null;
  notes?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SmtpLogEntry = {
  createdAt: string;
  message: string;
  type: 'info' | 'error';
};

export type AdminAudienceSummary = {
  totals: {
    subscribers: number;
    active: number;
    unsubscribed: number;
    newLast7Days: number;
  };
  engagement: {
    engaged7d: number;
    opens7d: number;
    clicks7d: number;
    inactive30d: number;
  };
  continents: Array<{
    name: string;
    count: number;
  }>;
  topics: Array<{
    name: string;
    count: number;
  }>;
};

export type AdminSubscriberListResponse = {
  items: Array<{
    id: string;
    email: string;
    name?: string | null;
    country?: string | null;
    source?: string | null;
    isUnsubscribed: boolean;
    createdAt: string;
  }>;
  total: number;
  limit: number;
  offset: number;
};

export type SiteContentKey = 'faqs' | 'partners' | 'subscribe_modal_copy' | 'hero_ticker' | 'hero_presenter';

export type SiteContentResponse<T> = {
  key: SiteContentKey;
  value: T | null;
  updatedAt: string | null;
};

export type SystemHealthStatus = {
  publicUrl: string;
  publicUrlIsHttps: boolean;
  sendRatePerMinute: number;
  sendRatePerHour: number;
  dryRunMode: boolean;
  deliverabilityWarningsEnabled: boolean;
  unsubscribeInjectionEnabled: boolean;
  testSendAllowlistCount: number;
  smtpConfigured: boolean;
  system?: {
    uptimeSec?: number;
    nodeVersion?: string;
    appVersion?: string;
    pid?: number;
  };
  database?: {
    ok?: boolean;
    latencyMs?: number | null;
  };
  workers?: {
    email?: {
      running?: boolean;
      startedAt?: string | null;
      lastJobAt?: string | null;
      lastError?: string | null;
      lastErrorAt?: string | null;
    };
    export?: {
      running?: boolean;
      startedAt?: string | null;
      lastJobAt?: string | null;
      lastError?: string | null;
      lastErrorAt?: string | null;
    };
    automation?: {
      running?: boolean;
      lastRunAt?: string | null;
      lastError?: string | null;
      lastErrorAt?: string | null;
    };
  };
  queues?: {
    emailJobs?: {
      queued?: number;
      processing?: number;
      failed?: number;
      skipped?: number;
    };
    exportJobs?: {
      queued?: number;
      processing?: number;
      failed?: number;
      completed?: number;
    };
  };
  jobs?: {
    lastEmailJobAt?: string | null;
    lastEmailErrorAt?: string | null;
    lastExportJobAt?: string | null;
    lastExportErrorAt?: string | null;
  };
  smtp?: {
    lastSuccessAt?: string | null;
    lastErrorAt?: string | null;
    lastInfo?: { createdAt: string; message: string; type: string } | null;
    lastError?: { createdAt: string; message: string; type: string } | null;
  };
  storage?: {
    uploadsPath?: string;
    uploadsSizeMb?: number;
  };
  streams?: {
    contentListeners?: number;
  };
};

export type AdminCampaign = {
  id: string;
  name: string;
  templateId: string;
  abEnabled?: number | boolean;
  subjectA?: string | null;
  subjectB?: string | null;
  templateIdA?: string | null;
  templateIdB?: string | null;
  splitRatio?: number;
  subject?: string | null;
  htmlOverride?: string | null;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  filterJson?: string | null;
  scheduledAt?: string | null;
  sentCount?: number;
  failedCount?: number;
  queuedCount?: number;
  processingCount?: number;
  totalCount?: number;
  confirmedAudienceCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type CampaignVariantAnalytics = {
  sent: number;
  uniqueOpens: number;
  totalOpens: number;
  uniqueClickers: number;
  totalClicks: number;
  clickRate: number;
};

export type CampaignAnalytics = {
  splitRatio: number;
  variants: {
    A: CampaignVariantAnalytics;
    B: CampaignVariantAnalytics;
  };
  winner: { variant: 'A' | 'B'; clickRate: number } | null;
  recentErrors?: Array<{
    jobId: string;
    subscriberId?: string | null;
    message?: string | null;
    createdAt?: string | null;
  }>;
};

export type CampaignFilterPayload = {
  topics?: string[];
  tags?: string[];
  location?: string;
  continents?: string[];
  sources?: string[];
};

export type AdminPage = {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  templateId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSection = {
  id: string;
  pageId: string;
  type: string;
  sortOrder: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AdminClientSection = {
  id: string;
  pageKey: 'home' | 'items' | 'forex';
  type: string;
  sortOrder: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AdminTemplate = {
  id: string;
  name: string;
  sections: Array<{ type: string; data: Record<string, unknown> }>;
  createdAt: string;
};

export type AdminEmailTemplate = {
  id: string;
  name: string;
  subjectDefault?: string | null;
  html: string;
  category?: string | null;
  tags?: string[] | null;
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSettings = {
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  organizationName: string;
  adminEmail: string;
  smtpProvider?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  smtpUser?: string | null;
  smtpPass?: string | null;
  smtpFrom?: string | null;
  deliverabilityDomain?: string | null;
  dkimSelector?: string | null;
  deliverabilityLive?: boolean;
  smtpLastKnownGood?: boolean;
  smtpConfigured?: boolean;
  smtpHasBackup?: boolean;
  require2fa: boolean;
  verificationMethod: string;
  otpLength: number;
  otpExpiry: number;
  backupCodesEnabled: boolean;
  trustDuration: number;
  rememberDeviceDefault: boolean;
  alertsEnabled: boolean;
  alertRecipients: string;
  alertFrequency: string;
  maxFailedAttempts: number;
  cooldownSeconds: number;
  sessionIdleMins: number;
  sessionMaxHours: number;
  singleAdminMode?: boolean;
  updatedAt: string;
};

export type AutomationStatus = 'draft' | 'active' | 'paused';
export type AutomationTriggerType = 'signup' | 'tag' | 'topic' | 'date';
export type AutomationStepType = 'email' | 'delay';

export type AdminAutomation = {
  id: string;
  name: string;
  status: AutomationStatus;
  triggerType: AutomationTriggerType;
  triggerJson?: Record<string, unknown>;
  filterJson?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  stepsCount?: number;
};

export type AdminAutomationStep = {
  id: string;
  automationId: string;
  stepOrder: number;
  stepType: AutomationStepType;
  templateId?: string | null;
  subjectOverride?: string | null;
  htmlOverride?: string | null;
  delayMinutes?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSegmentsSummary = {
  generatedAt?: string;
  totals: {
    active: number;
  };
  continents: Array<{
    name: string;
    count: number;
  }>;
  sources: Array<{
    name: string;
    count: number;
  }>;
  segments: Array<{
    continent: string;
    source: string;
    total: number;
    engaged30d: number;
    inactive30d: number;
    lastUpdated: string;
  }>;
};

export type AdminSegmentLead = {
  id: string;
  name?: string | null;
  email: string;
  phone?: string | null;
  country?: string | null;
  createdAt: string;
  engaged30d: boolean;
};

export type AdminSegmentDetail = {
  segment: {
    continent: string;
    source: string;
    total: number;
    engaged30d: number;
    inactive30d: number;
    lastUpdated: string;
  };
  page: number;
  total: number;
  totalPages: number;
  leads: AdminSegmentLead[];
};

export type AdminSavedSegment = {
  id: string;
  name: string;
  continent: string;
  source: string;
  engagement: 'all' | 'engaged' | 'inactive';
  createdAt: string;
  updatedAt: string;
};

export type AdminExportJob = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  fileUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type AdminExportJobWithParams = AdminExportJob & {
  params: Record<string, unknown>;
};

export type AdminExportFormat = 'csv' | 'xlsx' | 'pdf' | 'docx';

export type AdminExportSchedule = {
  id: string;
  status: string;
  frequency: 'daily' | 'weekly';
  params: Record<string, unknown>;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminActivity = {
  id: string;
  action: string;
  actor: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
};

export type AdminSourcesSummary = {
  generatedAt: string;
  totals: {
    signups: number;
    last7d: number;
    prev7d: number;
  };
  unmapped: {
    total: number;
    unknown: number;
    coveragePct: number;
    top: Array<{
      name: string;
      count: number;
    }>;
    trend7d: {
      labels: string[];
      counts: number[];
    };
    trend30d: {
      labels: string[];
      counts: number[];
    };
  };
  sources: Array<{
    name: string;
    total: number;
    last7d: number;
    prev7d: number;
  }>;
};

export type AdminSourceAlias = {
  id: string;
  alias: string;
  canonical: string;
  impactCount: number;
  impactTrend7d?: {
    labels: string[];
    counts: number[];
  };
  impactTrend30d?: {
    labels: string[];
    counts: number[];
  };
  createdAt: string;
};

export type AdminSourceDetail = {
  source: string;
  totals: {
    total: number;
    last7d: number;
    prev7d: number;
  };
  trends: {
    last7d: { labels: string[]; counts: number[] };
    last30d: { labels: string[]; counts: number[] };
    last90d: { labels: string[]; counts: number[] };
  };
  facets: {
    countries: Array<{ name: string; count: number }>;
    topics: Array<{ name: string; count: number }>;
  };
  page: number;
  total: number;
  totalPages: number;
  leads: Array<{
    id: string;
    name?: string | null;
    email: string;
    phone?: string | null;
    country?: string | null;
    createdAt: string;
  }>;
};

export const adminApi = {
  getSession: () => apiClient.get<{ ok: boolean; adminEmail: string | null }>('/api/admin/session', { admin: true }),
  setupTotp: () => apiClient.post<{ secret: string; otpauthUrl: string }>('/api/admin/totp/setup', undefined, { admin: true }),
  verifyTotp: (code: string) => apiClient.post<{ success: boolean }>(
    '/api/admin/totp/verify',
    { code },
    { admin: true }
  ),
  generateBackupCodes: () => apiClient.post<{ codes: string[] }>('/api/admin/backup-codes', undefined, { admin: true }),
  revokeTrustedDevices: () => apiClient.post<{ success: boolean }>('/api/admin/trusted-devices/revoke', undefined, { admin: true }),
  testSmtp: (to: string) =>
    apiClient.post<{ success: boolean }>('/api/admin/smtp/test', { to }, { admin: true, timeoutMs: 30000 }),
  verifySmtp: (payload: {
    smtpHost: string;
    smtpPort: string;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass: string;
    smtpFrom: string;
  }) => apiClient.post<{ success: boolean }>('/api/admin/smtp/verify', payload, { admin: true, timeoutMs: 30000 }),
  restoreSmtp: () => apiClient.post<{ success: boolean }>('/api/admin/smtp/restore', undefined, { admin: true }),
  getSettings: () => apiClient.get<AdminSettings | null>('/api/admin/settings', { admin: true }),
  updateSettings: (payload: Partial<AdminSettings> & {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }) => apiClient.put<AdminSettings>('/api/admin/settings', payload, { admin: true, timeoutMs: 30000 }),
  getTheme: () => apiClient.get<AdminThemeConfig | null>('/api/admin/theme', { admin: true }),
  updateTheme: (payload: Pick<AdminThemeConfig, 'mode' | 'seasonalTheme' | 'customThemeId'>) =>
    apiClient.put<AdminThemeConfig>('/api/admin/theme', payload, { admin: true }),
  getCompliance: () => apiClient.get<AdminComplianceSettings>('/api/admin/compliance', { admin: true }),
  updateCompliance: (payload: Partial<AdminComplianceSettings>) =>
    apiClient.put<AdminComplianceSettings>('/api/admin/compliance', payload, { admin: true }),
  sendTestEmail: (payload: { to: string; subject?: string; html?: string }) =>
    apiClient.post<{ success: boolean }>('/api/admin/email/test-send', payload, { admin: true }),
  getVisibility: () => apiClient.get<{ items: AdminVisibilitySection[] }>('/api/admin/visibility', { admin: true }),
  updateVisibility: (items: AdminVisibilitySection[]) =>
    apiClient.put<{ items: AdminVisibilitySection[] }>('/api/admin/visibility', { items }, { admin: true }),
  getFooterKeywords: () => apiClient.get<{ items: AdminFooterKeyword[] }>('/api/admin/footer-keywords', { admin: true }),
  updateFooterKeywords: (items: AdminFooterKeyword[]) =>
    apiClient.put<{ items: AdminFooterKeyword[] }>('/api/admin/footer-keywords', { items }, { admin: true }),
  getCtaLabels: () => apiClient.get<{ items: string[] }>('/api/admin/cta-labels', { admin: true }),
  updateCtaLabels: (items: string[]) =>
    apiClient.put<{ items: string[] }>('/api/admin/cta-labels', { items }, { admin: true }),
  getCustomThemes: () => apiClient.get<CustomTheme[]>('/api/admin/themes/custom', { admin: true }),
  createCustomTheme: (payload: { name: string; values: Record<string, string> }) =>
    apiClient.post<CustomTheme>('/api/admin/themes/custom', payload, { admin: true }),
  deleteCustomTheme: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/themes/custom/${id}`, { admin: true }),
  getPages: () => apiClient.get<AdminPage[]>('/api/admin/pages', { admin: true }),
  createPage: (payload: { slug: string; title: string; templateId?: string | null }) =>
    apiClient.post<AdminPage>('/api/admin/pages', payload, { admin: true }),
  updatePage: (id: string, payload: Partial<AdminPage>) =>
    apiClient.put<AdminPage>(`/api/admin/pages/${id}`, payload, { admin: true }),
  deletePage: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/pages/${id}`, { admin: true }),
  getSections: (pageId: string) =>
    apiClient.get<AdminSection[]>(`/api/admin/pages/${pageId}/sections`, { admin: true }),
  createSection: (pageId: string, payload: Partial<AdminSection>) =>
    apiClient.post<AdminSection>(`/api/admin/pages/${pageId}/sections`, payload, { admin: true }),
  updateSection: (id: string, payload: Partial<AdminSection>) =>
    apiClient.put<AdminSection>(`/api/admin/sections/${id}`, payload, { admin: true }),
  deleteSection: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/sections/${id}`, { admin: true }),
  getClientSections: (pageKey: AdminClientSection['pageKey']) =>
    apiClient.get<AdminClientSection[]>(`/api/admin/client-pages/${pageKey}/sections`, {
      admin: true
    }),
  createClientSection: (pageKey: AdminClientSection['pageKey'], payload: Partial<AdminClientSection>) =>
    apiClient.post<AdminClientSection>(`/api/admin/client-pages/${pageKey}/sections`, payload, {
      admin: true
    }),
  updateClientSection: (id: string, payload: Partial<AdminClientSection>) =>
    apiClient.put<AdminClientSection>(`/api/admin/client-sections/${id}`, payload, { admin: true }),
  deleteClientSection: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/client-sections/${id}`, { admin: true }),
  getTemplates: () => apiClient.get<AdminTemplate[]>('/api/admin/page-templates', { admin: true }),
  createTemplate: (payload: { name: string; sections: AdminTemplate['sections'] }) =>
    apiClient.post<AdminTemplate>('/api/admin/page-templates', payload, { admin: true }),
  getEmailTemplates: (params?: {
    search?: string;
    category?: string;
    tag?: string;
    sort?: 'updated_desc' | 'name_asc';
    page?: number;
    limit?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category) query.set('category', params.category);
    if (params?.tag) query.set('tag', params.tag);
    if (params?.sort) query.set('sort', params.sort);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return apiClient.get<{ items: AdminEmailTemplate[]; page: number; total: number; totalPages: number }>(
      qs ? `/api/admin/templates?${qs}` : '/api/admin/templates',
      { admin: true }
    );
  },
  getEmailTemplate: (id: string) =>
    apiClient.get<AdminEmailTemplate>(`/api/admin/templates/${id}`, { admin: true }),
  createEmailTemplate: (payload: {
    name: string;
    subjectDefault?: string | null;
    html: string;
    category?: string | null;
    tags?: string[] | null;
  }) => apiClient.post<AdminEmailTemplate>('/api/admin/templates', payload, { admin: true }),
  updateEmailTemplate: (id: string, payload: Partial<AdminEmailTemplate>) =>
    apiClient.put<AdminEmailTemplate>(`/api/admin/templates/${id}`, payload, { admin: true }),
  deleteEmailTemplate: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/templates/${id}`, { admin: true }),
  duplicateEmailTemplate: (id: string) =>
    apiClient.post<AdminEmailTemplate>(`/api/admin/templates/${id}/duplicate`, undefined, { admin: true }),
  renderEmailTemplate: (id: string, payload: {
    variables: Record<string, unknown>;
    html?: string;
    options?: {
      rewriteLinks?: boolean;
      injectOpenPixel?: boolean;
      forceFooter?: boolean;
    };
    }) =>
      apiClient.post<{ renderedHtml: string; warnings?: { code: string; message: string }[] }>(
        `/api/admin/templates/${id}/render`,
        payload,
        { admin: true }
      ),
  getTemplateAudienceContinents: (id: string, filterJson?: CampaignFilterPayload) =>
    apiClient.post<{ total: number; counts: Record<string, number> }>(
      `/api/admin/templates/${id}/audience-continents`,
      filterJson ? { filterJson } : {},
      { admin: true }
    ),
  sendTemplateCampaign: (id: string, payload: {
    name?: string;
    subject?: string;
    filterJson?: CampaignFilterPayload;
    html?: string;
  }) =>
    apiClient.post<{ ok: boolean; queued: number; campaignId: string }>(
      `/api/admin/templates/${id}/send-campaign`,
      payload,
      { admin: true }
    ),
  sendTemplateTestEmail: (id: string, payload: {
    to: string;
    subject?: string;
    variables?: Record<string, unknown>;
    html?: string;
    options?: {
      asSent?: boolean;
      rewriteLinks?: boolean;
      injectOpenPixel?: boolean;
      forceFooter?: boolean;
    };
  }) =>
    apiClient.post<{ ok: boolean }>(`/api/admin/templates/${id}/send-test`, payload, { admin: true }),
  getAudiencesSummary: () =>
    apiClient.get<AdminAudienceSummary>('/api/admin/audiences/summary', { admin: true }),
  getSegmentsSummary: () =>
    apiClient.get<AdminSegmentsSummary>('/api/admin/segments/summary', { admin: true }),
  getSegmentDetail: (params: { continent: string; source: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    query.set('continent', params.continent);
    query.set('source', params.source);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    return apiClient.get<AdminSegmentDetail>(`/api/admin/segments/detail?${query.toString()}`, { admin: true });
  },
  getSavedSegments: () => apiClient.get<AdminSavedSegment[]>('/api/admin/segments/saved', { admin: true }),
  createSavedSegment: (payload: { name: string; continent: string; source: string; engagement: AdminSavedSegment['engagement'] }) =>
    apiClient.post<AdminSavedSegment>('/api/admin/segments/saved', payload, { admin: true }),
  updateSavedSegment: (id: string, payload: { name: string }) =>
    apiClient.put<AdminSavedSegment>(`/api/admin/segments/saved/${id}`, payload, { admin: true }),
  deleteSavedSegment: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/segments/saved/${id}`, { admin: true }),
  createSegmentExport: (payload: { continent: string; source: string; engagement: AdminSavedSegment['engagement']; format: AdminExportFormat }) =>
    apiClient.post<{ id: string; status: string }>('/api/admin/segments/export', payload, { admin: true }),
  getSegmentExportStatus: (id: string) =>
    apiClient.get<AdminExportJob>(`/api/admin/segments/export/${id}`, { admin: true }),
  getSegmentExportHistory: (limit = 50) =>
    apiClient.get<AdminExportJobWithParams[]>(`/api/admin/segments/exports?limit=${limit}`, { admin: true }),
  getAdminActivity: (params?: { limit?: number; actionPrefix?: string }) => {
    const limit = params?.limit ?? 20;
    const query = new URLSearchParams({ limit: String(limit) });
    if (params?.actionPrefix) {
      query.set('actionPrefix', params.actionPrefix);
    }
    return apiClient.get<AdminActivity[]>(`/api/admin/activity?${query.toString()}`, { admin: true });
  },
  getSourcesSummary: () =>
    apiClient.get<AdminSourcesSummary>('/api/admin/sources/summary', { admin: true }),
  getSourceAliases: () =>
    apiClient.get<AdminSourceAlias[]>('/api/admin/sources/aliases', { admin: true }),
  createSourceAlias: (payload: { alias: string; canonical: string }) =>
    apiClient.post<AdminSourceAlias>('/api/admin/sources/aliases', payload, { admin: true }),
  deleteSourceAlias: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/sources/aliases/${id}`, { admin: true }),
  suggestSourceAlias: (payload: { alias: string }) =>
    apiClient.post<{ suggestions: string[] }>(`/api/admin/sources/aliases/suggest`, payload, { admin: true }),
  getSourceDetail: (params: { source: string; page?: number; limit?: number; start?: string; end?: string }) => {
    const query = new URLSearchParams();
    query.set('source', params.source);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.start) query.set('start', params.start);
    if (params.end) query.set('end', params.end);
    return apiClient.get<AdminSourceDetail>(`/api/admin/sources/detail?${query.toString()}`, { admin: true });
  },
  createSourceExport: (payload: { source: string; format: AdminExportFormat; start?: string; end?: string; country?: string; topic?: string }) =>
    apiClient.post<{ id: string; status: string }>('/api/admin/sources/export', payload, { admin: true }),
  getSourceExportHistory: (limit = 50) =>
    apiClient.get<AdminExportJobWithParams[]>(`/api/admin/sources/exports?limit=${limit}`, { admin: true }),
  getSourceExportSchedules: (source: string) =>
    apiClient.get<AdminExportSchedule[]>(`/api/admin/sources/export-schedules?source=${encodeURIComponent(source)}`, { admin: true }),
  createSourceExportSchedule: (payload: { source: string; format: AdminExportFormat; frequency: 'daily' | 'weekly'; recipients?: string }) =>
    apiClient.post<AdminExportSchedule>('/api/admin/sources/export-schedules', payload, { admin: true }),
  deleteSourceExportSchedule: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/sources/export-schedules/${id}`, { admin: true }),
  getAnalytics: (params?: { includeUnsubscribed?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.includeUnsubscribed) {
      query.set('includeUnsubscribed', 'true');
    }
    const qs = query.toString();
    return apiClient.get<AdminAnalytics>(qs ? `/api/admin/analytics?${qs}` : '/api/admin/analytics', {
      admin: true,
      headers: { 'x-analytics-schema': 'v2' }
    });
  },
  resetAnalytics: () => apiClient.post<{ success: boolean; resetAt: string }>(
    '/api/admin/analytics/reset',
    undefined,
    { admin: true }
  ),
  getDeliverabilityStatus: () =>
    apiClient.get<DeliverabilityStatus>('/api/admin/deliverability/status', { admin: true }),
  getDeliverabilityChecklist: () =>
    apiClient.get<DeliverabilityChecklist>('/api/admin/deliverability/checklist', { admin: true }),
  acknowledgeDeliverabilityChecklist: (payload: { itemId: string }) =>
    apiClient.post<{ itemId: string; acknowledgedAt: string }>(
      '/api/admin/deliverability/checklist/ack',
      payload,
      { admin: true }
    ),
  getDeliverabilityTrends: (windowDays = 30) =>
    apiClient.get<DeliverabilityTrends>(`/api/admin/deliverability/trends?window=${windowDays}`, { admin: true }),
  getDeliverabilityErrors: () =>
    apiClient.get<DeliverabilityError[]>('/api/admin/deliverability/errors', { admin: true }),
  getSmtpLogs: (limit = 50) =>
    apiClient.get<{ items: SmtpLogEntry[] }>(`/api/admin/smtp/logs?limit=${limit}`, { admin: true }),
  getCalendar: (params?: { start?: string; end?: string; status?: CalendarItem['status']; channel?: CalendarItem['channel']; type?: CalendarItem['type'] }) => {
    const query = new URLSearchParams();
    if (params?.start) query.set('start', params.start);
    if (params?.end) query.set('end', params.end);
    if (params?.status) query.set('status', params.status);
    if (params?.channel) query.set('channel', params.channel);
    if (params?.type) query.set('type', params.type);
    const qs = query.toString();
    return apiClient.get<CalendarItem[]>(qs ? `/api/admin/calendar?${qs}` : '/api/admin/calendar', { admin: true });
  },
  createCalendarItem: (payload: Partial<CalendarItem>) =>
    apiClient.post<CalendarItem>('/api/admin/calendar', payload, { admin: true }),
  updateCalendarItem: (id: string, payload: Partial<CalendarItem>) =>
    apiClient.put<CalendarItem>(`/api/admin/calendar/${id}`, payload, { admin: true }),
  deleteCalendarItem: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/calendar/${id}`, { admin: true }),
  getSuppressedLeads: (params?: {
    page?: number;
    limit?: number;
    reason?: 'unsubscribed' | 'email_invalid';
    search?: string;
    source?: string;
    country?: string;
    start?: string;
    end?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.reason) query.set('reason', params.reason);
    if (params?.search) query.set('search', params.search);
    if (params?.source) query.set('source', params.source);
    if (params?.country) query.set('country', params.country);
    if (params?.start) query.set('start', params.start);
    if (params?.end) query.set('end', params.end);
    const qs = query.toString();
    return apiClient.get<SuppressedLeadsResponse>(
      qs ? `/api/admin/deliverability/suppressed?${qs}` : '/api/admin/deliverability/suppressed',
      { admin: true }
    );
  },
  unsubscribeSubscriber: (id: string) =>
    apiClient.post<{ id: string; status: string }>(`/api/admin/subscribers/${id}/unsubscribe`, undefined, {
      admin: true
    }),
  resendSubscriberConfirmation: (id: string) =>
    apiClient.post<{ success: boolean }>(`/api/admin/subscribers/${id}/resend-confirmation`, undefined, {
      admin: true
    }),
  resendUnconfirmedSubscribers: () =>
    apiClient.post<{ success: boolean; sent: number; failed?: number }>(
      '/api/admin/subscribers/resend-confirmations',
      undefined,
      { admin: true }
    ),
  getSubscribers: (params?: { limit?: number; offset?: number; query?: string; source?: string; unsubscribed?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    if (params?.query) query.set('query', params.query);
    if (params?.source) query.set('source', params.source);
    if (params?.unsubscribed) query.set('unsubscribed', params.unsubscribed);
    const qs = query.toString();
    return apiClient.get<AdminSubscriberListResponse>(
      qs ? `/api/admin/subscribers?${qs}` : '/api/admin/subscribers',
      { admin: true }
    );
  },
  getSiteContent: <T>(key: SiteContentKey) =>
    apiClient.get<SiteContentResponse<T>>(`/api/admin/site-content/${key}`, { admin: true }),
  updateSiteContent: <T>(key: SiteContentKey, value: T) =>
    apiClient.put<SiteContentResponse<T>>(`/api/admin/site-content/${key}`, { value }, { admin: true }),
  reinstateSuppressedLead: (id: string) =>
    apiClient.post<{ id: string; status: string }>(`/api/admin/deliverability/suppressed/${id}/reinstate`, undefined, {
      admin: true
    }),
  clearInvalidSuppressedLead: (id: string) =>
    apiClient.post<{ id: string; status: string }>(`/api/admin/deliverability/suppressed/${id}/clear-invalid`, undefined, {
      admin: true
    }),
  getSystemHealth: () =>
    apiClient.get<SystemHealthStatus>('/api/admin/system-health', { admin: true }),
  getSubscriberContinents: () =>
    apiClient.get<{ total: number; counts: Record<string, number> }>(
      '/api/admin/subscribers/continents',
      { admin: true }
    ),
  getAutomations: () =>
    apiClient.get<AdminAutomation[]>('/api/admin/automations', { admin: true }),
  getAutomation: (id: string) =>
    apiClient.get<AdminAutomation & { steps: AdminAutomationStep[] }>(`/api/admin/automations/${id}`, {
      admin: true
    }),
  createAutomation: (payload: {
    name: string;
    triggerType: AutomationTriggerType;
    triggerJson?: Record<string, unknown>;
    filterJson?: CampaignFilterPayload;
  }) =>
    apiClient.post<AdminAutomation>('/api/admin/automations', payload, { admin: true }),
  updateAutomation: (id: string, payload: Partial<{
    name: string;
    status: AutomationStatus;
    triggerType: AutomationTriggerType;
    triggerJson: Record<string, unknown>;
    filterJson: CampaignFilterPayload;
  }>) =>
    apiClient.put<AdminAutomation>(`/api/admin/automations/${id}`, payload, { admin: true }),
  deleteAutomation: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/automations/${id}`, { admin: true }),
  activateAutomation: (id: string) =>
    apiClient.post<AdminAutomation>(`/api/admin/automations/${id}/activate`, undefined, { admin: true }),
  pauseAutomation: (id: string) =>
    apiClient.post<AdminAutomation>(`/api/admin/automations/${id}/pause`, undefined, { admin: true }),
  addAutomationStep: (id: string, payload: {
    stepOrder: number;
    stepType: AutomationStepType;
    templateId?: string | null;
    subjectOverride?: string | null;
    htmlOverride?: string | null;
    delayMinutes?: number | null;
  }) =>
    apiClient.post<AdminAutomationStep>(`/api/admin/automations/${id}/steps`, payload, { admin: true }),
  updateAutomationStep: (id: string, payload: Partial<AdminAutomationStep>) =>
    apiClient.put<AdminAutomationStep>(`/api/admin/automation-steps/${id}`, payload, { admin: true }),
  deleteAutomationStep: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/automation-steps/${id}`, { admin: true }),
  getCampaigns: (status?: AdminCampaign['status']) =>
    apiClient.get<AdminCampaign[]>(
      status ? `/api/admin/campaigns?status=${encodeURIComponent(status)}` : '/api/admin/campaigns',
      { admin: true }
    ),
  getCampaign: (id: string) =>
    apiClient.get<AdminCampaign>(`/api/admin/campaigns/${id}`, { admin: true }),
  deleteCampaign: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/campaigns/${id}`, { admin: true }),
  createCampaign: (payload: { name: string; templateId: string; filterJson?: CampaignFilterPayload }) =>
    apiClient.post<AdminCampaign>('/api/admin/campaigns', payload, { admin: true }),
  updateCampaign: (id: string, payload: {
    name?: string;
    subject?: string;
    subjectA?: string | null;
    subjectB?: string | null;
    htmlOverride?: string | null;
    abEnabled?: boolean;
    templateIdA?: string | null;
    templateIdB?: string | null;
    splitRatio?: number;
    filterJson?: CampaignFilterPayload;
    scheduledAt?: string | null;
  }) =>
    apiClient.put<AdminCampaign>(`/api/admin/campaigns/${id}`, payload, { admin: true }),
  previewCampaignAudience: (id: string, filterJson?: CampaignFilterPayload) =>
    apiClient.post<{ count: number }>(
      `/api/admin/campaigns/${id}/audience-preview`,
      filterJson ? { filterJson } : {},
      { admin: true }
    ),
  getCampaignAudienceContinents: (id: string, filterJson?: CampaignFilterPayload) =>
    apiClient.post<{ total: number; counts: Record<string, number> }>(
      `/api/admin/campaigns/${id}/audience-continents`,
      filterJson ? { filterJson } : {},
      { admin: true }
    ),
  sendCampaignNow: (id: string) =>
    apiClient.post<{ ok: boolean; queued: number; warnings?: Array<{ code: string; message: string }> }>(
      `/api/admin/campaigns/${id}/send-now`,
      undefined,
      { admin: true }
    ),
  sendCampaignSandbox: (id: string) =>
    apiClient.post<{ ok: boolean; queued: number; allowlistCount: number }>(
      `/api/admin/campaigns/${id}/send-sandbox`,
      undefined,
      { admin: true }
    ),
  scheduleCampaign: (id: string, scheduledAt: string) =>
    apiClient.post<AdminCampaign & { warnings?: Array<{ code: string; message: string }> }>(
      `/api/admin/campaigns/${id}/schedule`,
      { scheduledAt },
      { admin: true }
    ),
  getCampaignProgress: (id: string) =>
    apiClient.get<{
      totalCount: number;
      queuedCount: number;
      processingCount: number;
      sentCount: number;
      failedCount: number;
      skippedCount: number;
    }>(`/api/admin/campaigns/${id}/progress`, { admin: true }),
  getCampaignAnalytics: (id: string) =>
    apiClient.get<CampaignAnalytics>(`/api/admin/campaigns/${id}/analytics`, { admin: true }),
  getHero: () => apiClient.get<AdminHeroPayload | null>('/api/admin/hero', { admin: true }),
  updateHero: (hero: Partial<AdminHeroPayload>) =>
    apiClient.put<AdminHeroPayload>('/api/admin/hero', hero, { admin: true }),
  getFeaturedSlots: () =>
    apiClient.get<AdminFeaturedSlot[]>('/api/admin/featured-slots', { admin: true }),
  createFeaturedSlot: (slot: Partial<AdminFeaturedSlot>) =>
    apiClient.post<AdminFeaturedSlot>('/api/admin/featured-slots', slot, { admin: true }),
  updateFeaturedSlot: (id: string, slot: Partial<AdminFeaturedSlot>) =>
    apiClient.put<AdminFeaturedSlot>(`/api/admin/featured-slots/${id}`, slot, { admin: true }),
  deleteFeaturedSlot: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/featured-slots/${id}`, { admin: true }),
  getProducts: () => apiClient.get<AdminProduct[]>('/api/admin/products', { admin: true }),
  createProduct: (product: Partial<AdminProduct>) =>
    apiClient.post<AdminProduct>('/api/admin/products', product, { admin: true }),
  updateProduct: (id: string, product: Partial<AdminProduct>) =>
    apiClient.put<AdminProduct>(`/api/admin/products/${id}`, product, { admin: true }),
  deleteProduct: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/products/${id}`, { admin: true }),
  getTestimonials: () =>
    apiClient.get<AdminTestimonial[]>('/api/admin/testimonials', { admin: true }),
  createTestimonial: (testimonial: Partial<AdminTestimonial>) =>
    apiClient.post<AdminTestimonial>('/api/admin/testimonials', testimonial, { admin: true }),
  updateTestimonial: (id: string, testimonial: Partial<AdminTestimonial>) =>
    apiClient.put<AdminTestimonial>(`/api/admin/testimonials/${id}`, testimonial, { admin: true }),
  deleteTestimonial: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/testimonials/${id}`, { admin: true }),
  getUpcoming: () => apiClient.get<AdminUpcomingProduct[]>('/api/admin/upcoming', { admin: true }),
  createUpcoming: (item: Partial<AdminUpcomingProduct>) =>
    apiClient.post<AdminUpcomingProduct>('/api/admin/upcoming', item, { admin: true }),
  updateUpcoming: (id: string, item: Partial<AdminUpcomingProduct>) =>
    apiClient.put<AdminUpcomingProduct>(`/api/admin/upcoming/${id}`, item, { admin: true }),
  deleteUpcoming: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/upcoming/${id}`, { admin: true }),
  getVideos: () => apiClient.get<AdminVideoAd[]>('/api/admin/videos', { admin: true }),
  createVideo: (video: Partial<AdminVideoAd>) =>
    apiClient.post<AdminVideoAd>('/api/admin/videos', video, { admin: true }),
  updateVideo: (id: string, video: Partial<AdminVideoAd>) =>
    apiClient.put<AdminVideoAd>(`/api/admin/videos/${id}`, video, { admin: true }),
  deleteVideo: (id: string) =>
    apiClient.delete<{ deleted: string }>(`/api/admin/videos/${id}`, { admin: true })
};
