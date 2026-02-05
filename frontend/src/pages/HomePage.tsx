import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Section from '../components/ui/Section';
import Slider from '../components/ui/Slider';
import Accordion from '../components/Accordion';
import ClientPageSections from '../components/ClientPageSections';
import HeroPresenterSection from '../components/home/HeroPresenterSection';
import { useSubscribe } from '../context/SubscribeContext';
import { appendMediaVersion, buildApiUrl, toMediaUrl } from '../data/mediaLibrary';
import {
  FeaturedSlot,
  HeroConfig,
  Product,
  PublicFaqItem,
  PublicPartner,
  Testimonial,
  UpcomingProduct,
  VideoAd,
  getLeadId,
  getSessionId,
  publicApi
} from '../services/publicApi';

export default function HomePage() {
  const { open, completedIntent, clearCompletedIntent } = useSubscribe();
  const mountedRef = useRef(true);
  const [heroConfig, setHeroConfig] = useState<HeroConfig | null>(null);
  const [featuredSlots, setFeaturedSlots] = useState<FeaturedSlot[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [featuredProductOverride, setFeaturedProductOverride] = useState<Product | null>(null);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [upcomingItems, setUpcomingItems] = useState<UpcomingProduct[]>([]);
  const [videos, setVideos] = useState<VideoAd[]>([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState('');
  const [pendingVideoId, setPendingVideoId] = useState<string | null>(null);
  const [playingNoticeId, setPlayingNoticeId] = useState<string | null>(null);
  const [playErrors, setPlayErrors] = useState<Record<string, boolean>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const readSubscribed = () => {
    try {
      const flag = localStorage.getItem('isSubscribed') === 'true';
      const leadId = getLeadId();
      return flag && Boolean(leadId);
    } catch {
      return false;
    }
  };
  const [subscribed, setSubscribed] = useState(() => readSubscribed());
  const [faqs, setFaqs] = useState<PublicFaqItem[]>([]);
  const [partners, setPartners] = useState<PublicPartner[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [mediaVersion, setMediaVersion] = useState(0);
  const [productImageErrors, setProductImageErrors] = useState<Record<string, boolean>>({});
  const [testimonialImageErrors, setTestimonialImageErrors] = useState<Record<string, boolean>>({});
  const heroTitle = heroConfig?.title || '';
  const heroSubtitle = heroConfig?.subtitle || '';
  const showVideoGateSignature = Boolean(import.meta.env.DEV);
  const hasViteHmr = Boolean((import.meta as { hot?: unknown }).hot);
  const showDevWarningBanner = showVideoGateSignature && !hasViteHmr && window.location.pathname === '/';
  const renderStars = (rating?: number | null) => {
    if (!rating) return null;
    const safeRating = Math.max(0, Math.min(5, rating));
    const filled = Math.round(safeRating);
    return (
      <div className="flex items-center gap-1 text-yellow-400" aria-label={`Rating ${safeRating} out of 5`}>
        {Array.from({ length: 5 }).map((_, index) => (
          <span key={`star-${index}`} className={index < filled ? '' : 'text-slate-300'}>
            ★
          </span>
        ))}
        <span className="ml-1 text-xs text-slate-500">{safeRating.toFixed(1)}</span>
      </div>
    );
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!showVideoGateSignature) return;
    try {
      console.log('[VideoGate] active:', {
        subscribed: localStorage.getItem('isSubscribed'),
        leadId: getLeadId(),
        time: new Date().toISOString()
      });
    } catch {
      console.log('[VideoGate] active:', { subscribed: 'unavailable', time: new Date().toISOString() });
    }
  }, [showVideoGateSignature]);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [heroPayload, productData, testimonialData, upcomingData] = await Promise.all([
        publicApi.fetchHero(),
        publicApi.fetchProducts({ placement: 'home' }),
        publicApi.fetchTestimonials(),
        publicApi.fetchUpcoming()
      ]);
      if (!mountedRef.current) return;
      setHeroConfig(heroPayload.hero);
      setFeaturedSlots(heroPayload.featured || []);
      setProducts(productData);
      setTestimonials(testimonialData);
      setUpcomingItems(upcomingData);
      setErrorMessage('');

      const featuredSlot = heroPayload.featured?.[0];
      if (featuredSlot?.productId && !productData.find((item) => item.id === featuredSlot.productId)) {
        try {
          const fetched = await publicApi.fetchProductById(featuredSlot.productId);
          if (mountedRef.current) {
            setFeaturedProductOverride(fetched);
          }
        } catch {
          if (mountedRef.current) {
            setFeaturedProductOverride(null);
          }
        }
      } else if (mountedRef.current) {
        setFeaturedProductOverride(null);
      }
    } catch (error) {
      if (mountedRef.current) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load homepage content.');
        if (import.meta.env.DEV) {
          console.warn(
            'fetchProducts failed',
            buildApiUrl('/api/public/products?placement=home'),
            error
          );
        }
      }
    } finally {
      if (mountedRef.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let active = true;
    const loadContent = async () => {
      try {
        const [faqsRes, partnersRes] = await Promise.all([
          publicApi.fetchFaqs(),
          publicApi.fetchPartners()
        ]);
        if (!active) return;
        setFaqs(Array.isArray(faqsRes.items) ? faqsRes.items : []);
        setPartners(Array.isArray(partnersRes.items) ? partnersRes.items : []);
      } catch {
        if (!active) return;
        setFaqs([]);
        setPartners([]);
      }
    };
    void loadContent();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadVideos = async () => {
      setVideoLoading(true);
      setVideoError('');
      try {
        const data = await publicApi.fetchVideos();
        if (!active) return;
        const filtered = data
          .filter((item) => Boolean(item.isActive))
          .sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
          });
        setVideos(filtered);
      } catch (error) {
        if (!active) return;
        setVideoError(error instanceof Error ? error.message : 'Failed to load videos.');
      } finally {
        if (active) setVideoLoading(false);
      }
    };
    void loadVideos();
    return () => {
      active = false;
    };
  }, []);

  const isSubscribed = () => subscribed;

  const playVideo = useCallback(async (id: string, muted: boolean) => {
    const el = videoRefs.current[id];
    if (!el) return;
    el.muted = muted;
    try {
      await el.play();
      setPlayErrors((prev) => ({ ...prev, [id]: false }));
      if (muted) {
        setPlayingNoticeId(id);
        window.setTimeout(() => {
          setPlayingNoticeId((prev) => (prev === id ? null : prev));
        }, 1000);
      }
    } catch {
      setPlayErrors((prev) => ({ ...prev, [id]: true }));
    }
  }, []);

  useEffect(() => {
    if (!pendingVideoId) return;
    if (!isSubscribed()) return;
    void playVideo(pendingVideoId, true);
    setPendingVideoId(null);
  }, [pendingVideoId, playVideo]);

  useEffect(() => {
    if (completedIntent?.type === 'video' && completedIntent.video) {
      const id = completedIntent.video.id;
      setSubscribed(true);
      setPendingVideoId(id);
      clearCompletedIntent();
    }
  }, [completedIntent, clearCompletedIntent]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ videoId?: string }>).detail;
      if (!detail?.videoId) return;
      if (import.meta.env.DEV) {
        console.log('[VideoGate] video-subscribe-success fired', detail);
      }
      setSubscribed(true);
      setPendingVideoId(detail.videoId);
      void playVideo(detail.videoId, true);
    };
    window.addEventListener('video-subscribe-success', handler as EventListener);
    return () => {
      window.removeEventListener('video-subscribe-success', handler as EventListener);
    };
  }, [playVideo]);

  useEffect(() => {
    const handler = () => {
      if (import.meta.env.DEV) {
        console.log('[VideoGate] subscribe-success fired');
      }
      setSubscribed(readSubscribed());
    };
    window.addEventListener('subscribe-success', handler as EventListener);
    return () => {
      window.removeEventListener('subscribe-success', handler as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      void loadData(true);
    };
    const handleVisibility = () => {
      if (!document.hidden) {
        void loadData(true);
      }
    };
    const interval = window.setInterval(() => {
      if (!document.hidden) {
        void loadData(true);
      }
    }, 15000);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
    };
  }, [loadData]);

  useEffect(() => {
    const source = new EventSource(buildApiUrl('/api/public/stream'));
    const handler = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { changed?: string[] };
        const changed = payload.changed || [];
        if (changed.includes('media')) {
          setMediaVersion((prev) => prev + 1);
          return;
        }
        if (changed.some((item) => ['hero', 'featured', 'products', 'testimonials', 'upcoming'].includes(item))) {
          void loadData(true);
        }
      } catch {
        // ignore malformed events
      }
    };
    source.addEventListener('content', handler);
    return () => {
      source.removeEventListener('content', handler);
      source.close();
    };
  }, [loadData]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/public/media-version'));
        if (!res.ok) return;
        const data = (await res.json()) as { version?: number };
        if (active && typeof data.version === 'number') {
          setMediaVersion((prev) => (data.version !== prev ? data.version : prev));
        }
      } catch {
        // ignore polling errors
      }
    };
    void poll();
    const interval = window.setInterval(poll, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const displayProducts = products;
  const displayTestimonials = testimonials;
  const upcoming = upcomingItems;
  const displayFaqs = faqs.length
    ? faqs.filter((item) => item.isActive ?? item.active ?? true)
    : [];
  const displayPartners = partners.length
    ? partners.filter((item) => item.isActive ?? item.active ?? true)
    : [];

  const handleVideoClick = (video: VideoAd) => {
    const src = appendMediaVersion(video.src, mediaVersion);
    const poster = appendMediaVersion(video.poster || '', mediaVersion);
    if (!isSubscribed()) {
      setPendingVideoId(video.id);
      open({
        type: 'video',
        video: {
          id: video.id,
          title: video.title,
          src,
          poster: poster || null
        },
        source: 'video-ads'
      });
      return;
    }
    void playVideo(video.id, false);
  };

  const featuredSlot = featuredSlots[0];
  const featuredProduct = featuredSlot?.productId
    ? displayProducts.find((product) => product.id === featuredSlot.productId) || featuredProductOverride
    : displayProducts[0];

  const handleProductCta = (product: Product, source: string) => {
    if (product.affiliateLink) {
      window.open(product.affiliateLink, '_blank', 'noopener,noreferrer');
      void publicApi.trackClick({
        productId: product.id,
        leadId: getLeadId() || undefined,
        sessionId: getSessionId(),
        source
      });
    } else {
      open({ source });
    }
  };

  const handleHeroPrimary = () => {
    if (heroConfig?.primaryCtaAction === 'external_link' && heroConfig.primaryCtaLink) {
      window.open(heroConfig.primaryCtaLink, '_blank', 'noopener,noreferrer');
      return;
    }
    if (heroConfig?.primaryCtaAction === 'go_to_featured_product' && featuredProduct) {
      handleProductCta(featuredProduct, 'hero-featured');
      return;
    }
    open({ source: 'hero-primary' });
  };

  const handleHeroSecondary = () => {
    const secondaryLink = heroConfig?.secondaryCtaLink?.trim();
    if (secondaryLink) {
      window.open(secondaryLink, '_blank', 'noopener,noreferrer');
      return;
    }
    open({ source: 'hero-secondary' });
  };

  const handleSubscribeFromPresenter = (source: string) => {
    open({ source });
  };

  const handleSlotCta = (slot: FeaturedSlot) => {
    if (slot.ctaAction === 'open_subscribe_modal') {
      open({ source: `featured-${slot.id}` });
      return;
    }
    if (slot.ctaAction === 'open_affiliate_link' && slot.ctaLink) {
      window.open(slot.ctaLink, '_blank', 'noopener,noreferrer');
      if (slot.productId) {
        void publicApi.trackClick({
          productId: slot.productId,
          leadId: getLeadId() || undefined,
          sessionId: getSessionId(),
          source: `slot-${slot.id}`
        });
      }
      return;
    }
    if (slot.ctaAction === 'go_to_product' && slot.productId) {
      const target = displayProducts.find((product) => product.id === slot.productId);
      if (target) {
        handleProductCta(target, `slot-${slot.id}`);
        return;
      }
    }
    open({ source: `featured-${slot.id}` });
  };

  const activeSlots = useMemo(
    () =>
      featuredSlots.filter(
        (slot) => slot.isActive !== 0 && slot.id !== featuredSlot?.id
      ),
    [featuredSlots, featuredSlot?.id]
  );
  const primaryCtaLabel = heroConfig?.primaryCtaLabel || 'Subscribe for updates';
  const productPlaceholders = useMemo(() => Array.from({ length: 4 }), []);
  const upcomingPlaceholders = useMemo(() => Array.from({ length: 4 }), []);
  const testimonialPlaceholders = useMemo(() => Array.from({ length: 4 }), []);
  const formatPrice = (value?: string | null) => {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.startsWith('$') ? trimmed : `$${trimmed}`;
  };

  return (
    <Layout>
      <Section className="relative overflow-hidden">
        {!loading && !heroConfig ? (
          <Card className="mb-4 p-4 text-sm text-slate-600 dark:text-slate-300">
            Hero not configured yet.
          </Card>
        ) : null}
        <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="absolute right-6 top-20 hidden h-52 w-52 rounded-full bg-indigo-200/50 blur-3xl md:block" />
        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              Automation Hub
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl md:mt-4 md:text-5xl dark:text-slate-100">
              {heroTitle}
            </h1>
            <p className="mt-3 text-base text-slate-600 dark:text-slate-300 md:mt-4 md:text-lg">
              {heroSubtitle}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="lg" onClick={handleHeroPrimary}>
                {primaryCtaLabel}
              </Button>
              <Button size="lg" variant="secondary" onClick={handleHeroSecondary}>
                {heroConfig?.secondaryCtaLabel || 'Get featured offers'}
              </Button>
            </div>
          </div>
          <Card className="relative overflow-hidden p-6">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-sky-100" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                Featured
              </p>
              <h3 className="mt-3 text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-100">
                {featuredSlot?.title || featuredProduct?.name || 'Premium Automation Stack'}
              </h3>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                {featuredSlot?.subtitle ||
                  featuredProduct?.description ||
                  'Everything you need to automate content and grow consistently.'}
              </p>
              <div className="mt-5 flex items-center gap-3">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                  {featuredSlot?.priceText || featuredProduct?.priceText || '$17 course'}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    featuredProduct ? handleProductCta(featuredProduct, 'hero-card') : open({ source: 'hero-card' })
                  }
                >
                  {featuredSlot?.ctaLabel || featuredProduct?.ctaLabel || 'View details'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </Section>

      <HeroPresenterSection
        mediaVersion={mediaVersion}
        onSubscribe={handleSubscribeFromPresenter}
      />

      <ClientPageSections pageKey="home" />

      {activeSlots.length ? (
        <Section id="featured" className="pt-0">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeSlots.map((slot) => (
              <Card key={slot.id} className="p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                  {slot.label}
                </div>
                <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {slot.title || 'Featured slot'}
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {slot.subtitle || 'Curated offers and tools for fast results.'}
                </p>
                <div className="mt-4">
                  <Button size="sm" onClick={() => handleSlotCta(slot)}>
                    {slot.ctaLabel}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      <Section id="products">
        {!loading && !displayProducts.length ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
            No products published yet.
          </Card>
        ) : null}
        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{errorMessage}</span>
              <Button size="sm" variant="outline" onClick={() => void loadData()}>
                Retry
              </Button>
            </div>
          </Card>
        ) : null}
        <Slider
          title="Top Products"
          subtitle="High-converting tools and courses, curated for growth."
          items={loading ? productPlaceholders : displayProducts}
          itemsPerBreakpoint={{ base: 1, sm: 2, lg: 3, xl: 4 }}
          showDots
          autoplay={!loading}
          autoplayIntervalMs={1000}
          loop
          renderItem={(product) =>
            loading ? (
              <Card className="h-[320px] overflow-hidden animate-pulse">
                <div className="p-3">
                  <div className="h-44 w-full rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
                </div>
                <div className="px-5 pb-5 space-y-3">
                  <div className="h-4 w-2/3 rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
                  <div className="h-3 w-full rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
                  <div className="h-8 w-28 rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
                </div>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="p-3">
                  <div className="relative h-44 w-full overflow-hidden rounded-2xl bg-slate-100">
                    {product.isNew ? (
                      <span className="absolute bottom-3 right-3 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                        NEW
                      </span>
                    ) : null}
                    {product.imageUrl && !productImageErrors[product.id] ? (
                      <img
                        src={appendMediaVersion(product.imageUrl, mediaVersion)}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transform-none"
                        onError={() =>
                          setProductImageErrors((prev) => ({ ...prev, [product.id]: true }))
                        }
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-400">
                        No image
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {product.name}
                    </h3>
                    <button
                      type="button"
                      className="rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white shadow-sm"
                    >
                      {formatPrice(product.priceText) || 'Offer'}
                    </button>
                  </div>
                  {product.rating ? (
                    <div className="mt-2">{renderStars(product.rating)}</div>
                  ) : null}
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                    {product.description}
                  </p>
                  <div className="mt-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button size="sm" onClick={() => handleProductCta(product, 'home-products')}>
                        {product.ctaLabel || 'Get Access'}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )}
        />
      </Section>

      <Section id="partners" className="pt-0">
        <Slider
          title="Partners"
          subtitle="Trusted platforms we feature regularly."
          items={displayPartners}
          itemsPerBreakpoint={{ base: 2, sm: 3, md: 4, lg: 4 }}
          showArrows
          autoplay
          autoplayIntervalMs={1000}
          loop
          renderItem={(partner) => {
            const label = typeof partner === 'string' ? partner : partner.name;
            return (
              <div className="rounded-full border border-slate-200/70 bg-white px-6 py-3 text-sm font-semibold text-slate-600 shadow-premium dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200">
                {label}
              </div>
            );
          }}
        />
      </Section>

      <Section id="upcoming" className="pt-0">
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-100">
              Upcoming Releases
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              New drops to keep your automation stack ahead.
            </p>
          </div>
          {!loading && upcoming.length === 0 ? (
            <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
              No upcoming products yet.
            </Card>
          ) : null}
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
            {(loading ? upcomingPlaceholders : upcoming).map((item, index) => (
              <Card key={loading ? `upcoming-${index}` : item.id} className="relative p-4 sm:p-5">
                {loading ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-24 w-full rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
                    <div className="h-4 w-20 rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
                    <div className="h-4 w-3/4 rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
                    <div className="h-3 w-full rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
                    <div className="h-8 w-24 rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
                  </div>
                ) : (
                  <>
                    {item.isNew ? (
                      <span className="absolute bottom-4 right-4 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                        NEW
                      </span>
                    ) : null}
                    <div className="mb-4">
                      <div className="h-32 w-full overflow-hidden rounded-2xl bg-slate-100 p-3">
                        {item.imageUrl ? (
                          <img
                            src={appendMediaVersion(item.imageUrl, mediaVersion)}
                            alt={item.title}
                            className="h-full w-full rounded-xl object-cover"
                          />
                        ) : null}
                      </div>
                    </div>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                      {item.dateLabel}
                    </span>
                    <h3 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-100 sm:mt-4">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      {item.details}
                    </p>
                    <Button className="mt-4" size="sm" onClick={() => open({ source: 'upcoming' })}>
                      Notify me
                    </Button>
                  </>
                )}
              </Card>
            ))}
          </div>
        </div>
      </Section>

      <Section id="testimonials">
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-100">
              Testimonials
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Real stories from creators using our tools.
            </p>
          </div>
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
            {!loading && displayTestimonials.length === 0 ? (
              <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
                No testimonials yet.
              </Card>
            ) : null}
            {(loading ? testimonialPlaceholders : displayTestimonials).map((item, index) => (
              <Card key={loading ? `testimonial-${index}` : item.id} className="p-4 sm:p-6">
                {loading ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-3 w-full rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
                    <div className="h-3 w-2/3 rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
                    <div className="h-3 w-1/2 rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="h-[50px] w-[50px] overflow-hidden rounded-full bg-slate-100">
                        {item.avatarUrl && !testimonialImageErrors[item.id] ? (
                          <img
                            src={appendMediaVersion(toMediaUrl(item.avatarUrl), mediaVersion)}
                            alt={item.authorName}
                            className="h-full w-full object-cover"
                            onError={() =>
                              setTestimonialImageErrors((prev) => ({ ...prev, [item.id]: true }))
                            }
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-400">
                            NO IMG
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          "{item.quote}"
                        </p>
                        <p className="mt-3 text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {item.authorName}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </Card>
            ))}
          </div>
        </div>
      </Section>

      <Section id="faq">
        <div className="grid gap-6 lg:grid-cols-[0.45fr_0.55fr] lg:items-start">
          <Card className="p-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-100">
                FAQs
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Quick answers to common questions.
              </p>
            </div>
            <div className="mt-6 space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Start with clarity, not guesswork.
              </p>
              <p>
                We answer the most common questions about getting started, what you’ll receive
                after subscribing, and how to stay updated.
              </p>
              <p>
                If you still need help, use the subscribe button and we’ll send the next steps
                directly to your inbox.
              </p>
              <Button size="sm" onClick={() => open({ source: 'faq-cta' })}>
                Subscribe for updates
              </Button>
            </div>
          </Card>
          <div className="space-y-6">
            <Accordion items={displayFaqs} />
          </div>
        </div>
      </Section>

      <Section id="video-ads" className="pt-0">
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-100">
              Video Ads
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Short promos with the key points before you subscribe.
            </p>
            {showVideoGateSignature ? (
              <div className="mt-2 text-xs font-semibold text-emerald-600">
                VideoGate v1.2 (dev signature)
              </div>
            ) : null}
          </div>
          {showDevWarningBanner ? (
            <Card className="p-3 text-xs text-amber-700 bg-amber-50 border border-amber-200">
              Warning: You may be viewing a built/stale bundle. Use `npm run dev` in frontend and open
              http://localhost:5173/
            </Card>
          ) : null}
          {videoLoading ? (
            <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading videos...</Card>
          ) : null}
          {videoError ? (
            <Card className="p-4 text-sm text-red-600">{videoError}</Card>
          ) : null}
          {!videoLoading && !videos.length ? (
            <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
              Video ads are coming soon.
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {videos.map((video) => {
                const src = appendMediaVersion(video.src, mediaVersion);
                const poster = appendMediaVersion(video.poster || '', mediaVersion);
                const isUserSubscribed = isSubscribed();
                return (
                  <Card key={video.id} className="overflow-hidden">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleVideoClick(video)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleVideoClick(video);
                        }
                      }}
                      className="group relative block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    >
                      <div className="relative w-full overflow-hidden bg-slate-100" style={{ aspectRatio: '9 / 16' }}>
                        {video.isNew ? (
                          <span className="absolute right-3 top-3 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                            NEW
                          </span>
                        ) : null}
                        <video
                          ref={(el) => {
                            videoRefs.current[video.id] = el;
                          }}
                          src={src}
                          poster={poster || undefined}
                          preload="metadata"
                          controls={isUserSubscribed}
                          autoPlay={isUserSubscribed}
                          muted={!isUserSubscribed}
                          playsInline
                          className={`h-full w-full object-cover ${isUserSubscribed ? '' : 'pointer-events-none'}`}
                        />
                        {!isUserSubscribed ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Button size="sm" onClick={() => handleVideoClick(video)}>
                              Subscribe to watch
                            </Button>
                          </div>
                        ) : null}
                        {playingNoticeId === video.id ? (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-sm font-semibold text-white">
                            Playing…
                          </div>
                        ) : null}
                        {playErrors[video.id] ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-900">
                              Tap to play
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="px-5 pb-5 pt-4">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {video.title}
                      </h3>
                      {video.description ? (
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                          {video.description}
                        </p>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </Section>
    </Layout>
  );
}
