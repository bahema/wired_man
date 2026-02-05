import React, { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout';
import Section from '../components/ui/Section';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ClientPageSections from '../components/ClientPageSections';
import { useSubscribe } from '../context/SubscribeContext';
import { appendMediaVersion, buildApiUrl, toMediaUrl } from '../data/mediaLibrary';
import { Product, getLeadId, getSessionId, publicApi } from '../services/publicApi';

export default function ForexPage() {
  const { open } = useSubscribe();
  const mountedRef = useRef(true);
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [mediaVersion, setMediaVersion] = useState(0);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const formatPrice = (value?: string | null) => {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.startsWith('$') ? trimmed : `$${trimmed}`;
  };
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

  const loadProducts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await publicApi.fetchProducts({ placement: 'forex' });
      if (mountedRef.current) {
        setItems(data);
        setErrorMessage('');
      }
    } catch (error) {
      if (mountedRef.current) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load products.');
        if (import.meta.env.DEV) {
          console.warn(
            'fetchProducts failed',
            buildApiUrl('/api/public/products?placement=forex'),
            error
          );
        }
      }
    } finally {
      if (mountedRef.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const handleFocus = () => {
      void loadProducts(true);
    };
    const handleVisibility = () => {
      if (!document.hidden) {
        void loadProducts(true);
      }
    };
    const interval = window.setInterval(() => {
      if (!document.hidden) {
        void loadProducts(true);
      }
    }, 15000);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
    };
  }, [loadProducts]);

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
        if (changed.includes('products')) {
          void loadProducts(true);
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
  }, [loadProducts]);

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

  const displayItems = items;
  const openAffiliateLink = (product: Product, source: string) => {
    if (!product.affiliateLink) return false;
    window.open(product.affiliateLink, '_blank', 'noopener,noreferrer');
    void publicApi.trackClick({
      productId: product.id,
      leadId: getLeadId() || undefined,
      sessionId: getSessionId(),
      source
    });
    return true;
  };

  return (
    <Layout>
      <Section>
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">
              Forex & Betting
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl md:mt-4 md:text-5xl dark:text-slate-100">
              Smarter systems for disciplined trading.
            </h1>
            <p className="mt-3 text-base text-slate-600 dark:text-slate-300 md:mt-4 md:text-lg">
              Access guided systems, strategy packs, and data insights designed to keep you
              consistent.
            </p>
            <div className="mt-6 flex gap-3">
              <Button size="lg" onClick={() => open({ source: 'forex-hero' })}>
                Subscribe for alerts
              </Button>
              <Button size="lg" variant="secondary" onClick={() => open({ source: 'forex-hero' })}>
                Get weekly signals
              </Button>
            </div>
          </div>
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 sm:text-xl dark:text-slate-100">
              Trade with clarity
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Receive structured breakdowns and curated betting insights weekly.
            </p>
            <Button className="mt-4" onClick={() => open({ source: 'forex-highlight' })}>
              Join updates
            </Button>
          </Card>
        </div>
      </Section>

      <ClientPageSections pageKey="forex" />

      <Section className="pt-0">
        {loading ? (
          <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={`forex-skeleton-${index}`} className="p-5 animate-pulse">
                <div className="h-40 w-full rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
                <div className="mt-4 h-4 w-2/3 rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
                <div className="mt-2 h-3 w-full rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
                <div className="mt-4 h-8 w-24 rounded-full bg-slate-200/70 dark:bg-slate-800/60" />
              </Card>
            ))}
          </div>
        ) : null}
        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{errorMessage}</span>
              <Button size="sm" variant="outline" onClick={() => void loadProducts()}>
                Retry
              </Button>
            </div>
          </Card>
        ) : null}
        {!loading && !displayItems.length ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
            No products published yet.
          </Card>
        ) : null}
        <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayItems.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <div className="p-3">
                <div className="relative h-40 w-full overflow-hidden rounded-2xl bg-slate-100">
                  {item.isNew ? (
                    <span className="absolute bottom-3 right-3 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                      NEW
                    </span>
                  ) : null}
                  {item.imageUrl && !imageErrors[item.id] ? (
                    <img
                      src={appendMediaVersion(toMediaUrl(item.imageUrl || ''), mediaVersion)}
                      alt={item.name}
                      className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-105 motion-reduce:transform-none"
                      onError={() => setImageErrors((prev) => ({ ...prev, [item.id]: true }))}
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
                    {item.name}
                  </h3>
                  {formatPrice(item.priceText) ? (
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                      {formatPrice(item.priceText)}
                    </span>
                  ) : null}
                </div>
                {item.rating ? (
                  <div className="mt-2">{renderStars(item.rating)}</div>
                ) : null}
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {item.description}
                </p>
                <Button
                  className="mt-4"
                  size="sm"
                  onClick={() =>
                    openAffiliateLink(item, 'forex') || open({ source: 'forex' })
                  }
                >
                  {item.ctaLabel || 'Get Access'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </Layout>
  );
}
