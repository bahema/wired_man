export type HeroPresenterConfig = {
  presenter: {
    title: string;
    description: string;
    services: string[];
    subscribeLabel: string;
  };
  imageSlides: Array<{
    id: string;
    imageUrl: string;
    caption: string;
    ctaLabel: string;
    ctaHref: string;
    isActive: boolean;
    sortOrder: number;
  }>;
  contentSlides: Array<{
    id: string;
    title: string;
    body: string;
    isActive: boolean;
    sortOrder: number;
  }>;
  updatedAt: string;
};

export const HERO_PRESENTER_STORAGE_KEY = 'hero_presenter_config_v1';

export const DEFAULT_HERO_PRESENTER_CONFIG: HeroPresenterConfig = {
  presenter: {
    title: 'Services we provide',
    description:
      'This section is for web presenter previews, highlighting how we support launches with guidance, creative, and offer feedback.',
    services: [
      'Audience growth strategy and lead magnet setup',
      'Email funnel creation and testing support',
      'Affiliate offer positioning and creative review',
      'Landing page tweaks for higher conversion'
    ],
    subscribeLabel: 'Subscribe'
  },
  imageSlides: [
    {
      id: 'slide-1',
      imageUrl: '/uploads/hero-presenter-1.jpg',
      caption: 'Weekly highlights from the automation desk.',
      ctaLabel: 'Check out',
      ctaHref: 'https://example.com',
      isActive: true,
      sortOrder: 0
    },
    {
      id: 'slide-2',
      imageUrl: '/uploads/hero-presenter-2.jpg',
      caption: 'Creative packs curated for rapid launches.',
      ctaLabel: 'Check out',
      ctaHref: 'https://example.com',
      isActive: true,
      sortOrder: 1
    },
    {
      id: 'slide-3',
      imageUrl: '/uploads/hero-presenter-3.jpg',
      caption: 'Partner promos with clear next steps.',
      ctaLabel: 'Check out',
      ctaHref: 'https://example.com',
      isActive: true,
      sortOrder: 2
    }
  ],
  contentSlides: [
    {
      id: 'content-1',
      title: 'Launch playbooks',
      body: 'Short weekly playbooks for affiliate campaigns, with breakdowns of hooks, angles, and quick wins you can deploy immediately.',
      isActive: true,
      sortOrder: 0
    },
    {
      id: 'content-2',
      title: 'Audience signals',
      body: 'We collect signals across the funnel to highlight what audiences respond to, keeping your promotions aligned with intent.',
      isActive: true,
      sortOrder: 1
    },
    {
      id: 'content-3',
      title: 'Conversion reviews',
      body: 'Get clear feedback on landing pages, email drafts, and product positioning, so your next release performs better.',
      isActive: true,
      sortOrder: 2
    }
  ],
  updatedAt: new Date().toISOString()
};

export const loadHeroPresenterConfig = (): HeroPresenterConfig => {
  if (typeof window === 'undefined') return DEFAULT_HERO_PRESENTER_CONFIG;
  try {
    const raw = window.localStorage.getItem(HERO_PRESENTER_STORAGE_KEY);
    if (!raw) return DEFAULT_HERO_PRESENTER_CONFIG;
    const parsed = JSON.parse(raw) as HeroPresenterConfig;
    if (!parsed?.presenter || !Array.isArray(parsed.imageSlides) || !Array.isArray(parsed.contentSlides)) {
      return DEFAULT_HERO_PRESENTER_CONFIG;
    }
    return parsed;
  } catch {
    return DEFAULT_HERO_PRESENTER_CONFIG;
  }
};

export const saveHeroPresenterConfig = (config: HeroPresenterConfig) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(HERO_PRESENTER_STORAGE_KEY, JSON.stringify(config));
};
