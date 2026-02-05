import { apiClient } from './apiClient';
import type { HeroPresenterConfig } from '../data/heroPresenterConfig';

export type HeroConfig = {
  id: string;
  isActive: number | boolean;
  theme: 'tech' | 'ai' | 'automation' | 'health' | 'money' | 'general';
  title: string;
  subtitle: string;
  highlightText?: string | null;
  backgroundImageUrl?: string | null;
  heroBadge?: string | null;
  primaryCtaLabel: string;
  primaryCtaAction: 'open_subscribe_modal' | 'go_to_featured_product' | 'external_link';
  primaryCtaLink?: string | null;
  secondaryCtaLabel?: string | null;
  secondaryCtaLink?: string | null;
};

export type FeaturedSlot = {
  id: string;
  label: string;
  productId?: string | null;
  title?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  priceText?: string | null;
  ctaLabel: string;
  ctaAction: 'open_subscribe_modal' | 'open_affiliate_link' | 'go_to_product';
  ctaLink?: string | null;
  sortOrder: number;
  isActive: number | boolean;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  tagline?: string | null;
  description: string;
  placement: 'home' | 'items' | 'forex';
  imageUrl?: string | null;
  galleryUrls?: string[];
  affiliateLink?: string | null;
  ctaLabel: string;
  priceText?: string | null;
  rating?: number | null;
  isFeatured: number | boolean;
  isNew: number | boolean;
  status: 'draft' | 'published' | 'archived';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type Testimonial = {
  id: string;
  authorName: string;
  authorRole?: string | null;
  authorLocation?: string | null;
  quote: string;
  avatarUrl?: string | null;
  rating?: number | null;
  isFeatured: number | boolean;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
};

export type UpcomingProduct = {
  id: string;
  title: string;
  dateLabel: string;
  details: string;
  imageUrl?: string | null;
  isActive: number | boolean;
  isNew: number | boolean;
  sortOrder: number;
  createdAt: string;
};

export type PublicFaqItem = {
  question: string;
  answer: string;
  isActive?: boolean;
  sortOrder?: number;
  active?: boolean;
};

export type PublicPartner = {
  name: string;
  logoUrl: string;
  linkUrl?: string;
  isActive?: boolean;
  sortOrder?: number;
  active?: boolean;
};

export type PublicModalCopy = {
  title?: string;
  subtitle?: string;
  bulletPoints?: string[];
  ctaLabel?: string;
  privacyNote?: string;
};

export type VideoAd = {
  id: string;
  title: string;
  description?: string | null;
  src: string;
  poster?: string | null;
  isNew: number | boolean;
  sortOrder: number;
};

export type PublicHeroPresenterResponse = {
  config: HeroPresenterConfig | null;
};

export type TickerItem = {
  text: string;
  linkUrl?: string;
  isActive?: boolean;
  sortOrder?: number;
  name?: string;
  country?: string | null;
};

export type ThemeConfig = {
  mode: 'light' | 'dark';
  seasonalTheme: string;
  customTheme: null | {
    id: string;
    name: string;
    values: Record<string, string>;
  };
};

export type FooterKeywords = {
  items: string[];
};

export type CtaLabels = {
  items: string[];
};

export type PublicPage = {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  templateId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PageSection = {
  id: string;
  pageId: string;
  type: string;
  sortOrder: number;
  data: Record<string, unknown>;
};

export type ClientSection = {
  id: string;
  pageKey: 'home' | 'items' | 'forex';
  type: string;
  sortOrder: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PublicNavPage = {
  slug: string;
  title: string;
};

export type HeroPayload = {
  hero: HeroConfig | null;
  featured: FeaturedSlot[];
};

export type AdminStatus = {
  exists: boolean;
};

export type AdminLoginSettings = {
  rememberDeviceDefault: boolean;
  trustDuration: number;
  signupEnabled?: boolean;
  smtpConfigured?: boolean;
  smtpLastKnownGood?: boolean;
};
export type AdminAuthResult = {
  success: boolean;
  id?: string;
  token?: string;
  expiresAt?: string;
  requiresOtp?: boolean;
  method?: 'email' | 'app' | string;
  otpId?: string;
  debugCode?: string;
  trustedDevice?: {
    token: string;
    expiresAt: string;
  } | null;
};

type SubscribePayload = {
  name?: string;
  email: string;
  phone?: string;
  country?: string;
  interests: string[];
  source?: string;
};

const LEAD_KEY = 'leadId';
const SESSION_KEY = 'sessionId';

export const getSessionId = () => {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, next);
  return next;
};

export const getLeadId = () => localStorage.getItem(LEAD_KEY) || '';

export const setLeadId = (leadId: string) => {
  localStorage.setItem(LEAD_KEY, leadId);
};

export const publicApi = {
  fetchHero: () => apiClient.get<HeroPayload>('/api/public/hero'),
  fetchProducts: (params?: { placement?: string; featured?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.placement) query.set('placement', params.placement);
    if (params?.featured) query.set('featured', 'true');
    const suffix = query.toString();
    return apiClient.get<Product[]>(`/api/public/products${suffix ? `?${suffix}` : ''}`);
  },
  fetchProductById: (id: string) =>
    apiClient.get<Product>(`/api/public/products/${id}`),
  fetchTestimonials: () => apiClient.get<Testimonial[]>('/api/public/testimonials'),
  fetchUpcoming: () => apiClient.get<UpcomingProduct[]>('/api/public/upcoming'),
  fetchVideos: () => apiClient.get<VideoAd[]>('/api/public/videos'),
  fetchHeroPresenter: () => apiClient.get<PublicHeroPresenterResponse>('/api/public/hero-presenter'),
  fetchTicker: () => apiClient.get<{ items: TickerItem[] }>('/api/public/ticker'),
  fetchTheme: () => apiClient.get<ThemeConfig>('/api/public/theme'),
  fetchFooterKeywords: () => apiClient.get<FooterKeywords>('/api/public/footer-keywords'),
  fetchCtaLabels: () => apiClient.get<CtaLabels>('/api/public/cta-labels'),
  fetchPages: () => apiClient.get<PublicNavPage[]>('/api/public/pages'),
  fetchFaqs: () => apiClient.get<{ items: PublicFaqItem[] }>('/api/public/faqs'),
  fetchPartners: () => apiClient.get<{ items: PublicPartner[] }>('/api/public/partners'),
  fetchModalCopy: () => apiClient.get<PublicModalCopy>('/api/public/modal-copy'),
  fetchPage: (slug: string) =>
    apiClient.get<{ page: PublicPage; sections: PageSection[] }>(
      `/api/public/pages/${slug}`
    ),
  fetchClientSections: (pageKey: ClientSection['pageKey']) =>
    apiClient.get<ClientSection[]>(`/api/public/client-pages/${pageKey}/sections`),
  subscribe: async (payload: SubscribePayload) => {
    const result = await apiClient.post<{ success: boolean; leadId: string | null; alreadySubscribed?: boolean }>(
      '/api/public/subscribe',
      payload
    );
    if (result.leadId) {
      setLeadId(result.leadId);
    }
    return result;
  },
  trackClick: (payload: { productId: string; leadId?: string; sessionId?: string; source?: string }) =>
    apiClient.post<{ success: boolean }>('/api/track/click', payload),
  fetchAdminStatus: () => apiClient.get<AdminStatus>('/api/public/admin/status'),
  fetchAdminLoginSettings: () => apiClient.get<AdminLoginSettings>('/api/public/admin/login-settings'),
  adminSignup: (payload: { email: string; password: string }) =>
    apiClient.post<AdminAuthResult>('/api/public/admin/signup', payload),
  adminLogin: (
    payload: { email: string; password: string },
    trustedDevice?: string | null
  ) =>
    apiClient.post<AdminAuthResult>('/api/public/admin/login', payload, {
      headers: trustedDevice ? { 'x-trusted-device': trustedDevice } : undefined
    }),
  adminVerifyOtp: (payload: { otpId: string; code: string; trustDevice?: boolean; deviceLabel?: string }) =>
    apiClient.post<AdminAuthResult>('/api/public/admin/verify-otp', payload),
  requestPasswordReset: (payload: { email: string }) =>
    apiClient.post<{ success: boolean; otpId: string }>('/api/public/admin/password-reset/request', payload),
  confirmPasswordReset: (payload: { otpId: string; code: string; newPassword: string; confirmPassword: string }) =>
    apiClient.post<{ success: boolean }>('/api/public/admin/password-reset/confirm', payload),
  adminLogout: (sessionToken?: string | null) =>
    apiClient.post<{ success: boolean }>(
      '/api/public/admin/logout',
      undefined,
      { headers: sessionToken ? { 'x-admin-session': sessionToken } : undefined }
    ),
  unsubscribe: (token: string) =>
    apiClient.post<{ ok: boolean }>('/api/public/unsubscribe', { token }),
  confirm: (token: string) =>
    apiClient.get<{ ok: boolean }>(
      `/api/public/confirm?token=${encodeURIComponent(token)}&mode=json`
    ),
  savePreferences: (token: string, topics: string[]) =>
    apiClient.post<{ ok: boolean }>('/api/public/preferences', { token, topics }),
  fetchPreferences: (token: string) =>
    apiClient.get<{ preferences: string }>(`/api/public/preferences?token=${encodeURIComponent(token)}`)
};
