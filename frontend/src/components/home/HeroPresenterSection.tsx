import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../ui/Button';
import { appendMediaVersion, buildApiUrl, toMediaUrl } from '../../data/mediaLibrary';
import {
  DEFAULT_HERO_PRESENTER_CONFIG,
  HeroPresenterConfig
} from '../../data/heroPresenterConfig';
import { publicApi } from '../../services/publicApi';

type Props = {
  mediaVersion: string | number | null;
  onSubscribe: (source: string) => void;
};

export default function HeroPresenterSection({ mediaVersion, onSubscribe }: Props) {
  const [config, setConfig] = useState<HeroPresenterConfig>(DEFAULT_HERO_PRESENTER_CONFIG);
  const [imageIndex, setImageIndex] = useState(0);
  const [contentIndex, setContentIndex] = useState(0);

  const loadConfig = useCallback(async () => {
    try {
      const res = await publicApi.fetchHeroPresenter();
      if (res.config && typeof res.config === 'object') {
        setConfig(res.config as HeroPresenterConfig);
        return;
      }
      setConfig(DEFAULT_HERO_PRESENTER_CONFIG);
    } catch {
      setConfig(DEFAULT_HERO_PRESENTER_CONFIG);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const source = new EventSource(buildApiUrl('/api/public/stream'));
    const handler = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { changed?: string[] };
        const changed = payload.changed || [];
        if (changed.includes('hero_presenter')) {
          void loadConfig();
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
  }, [loadConfig]);

  const activeImageSlides = useMemo(() => {
    const filtered = config.imageSlides
      .filter((slide) => slide.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return filtered.length ? filtered : DEFAULT_HERO_PRESENTER_CONFIG.imageSlides;
  }, [config.imageSlides]);

  const activeContentSlides = useMemo(() => {
    const filtered = config.contentSlides
      .filter((slide) => slide.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return filtered.length ? filtered : DEFAULT_HERO_PRESENTER_CONFIG.contentSlides;
  }, [config.contentSlides]);

  useEffect(() => {
    if (imageIndex >= activeImageSlides.length) {
      setImageIndex(0);
    }
  }, [imageIndex, activeImageSlides.length]);

  useEffect(() => {
    if (contentIndex >= activeContentSlides.length) {
      setContentIndex(0);
    }
  }, [contentIndex, activeContentSlides.length]);

  const currentImage = activeImageSlides[imageIndex % activeImageSlides.length];
  const currentContent = activeContentSlides[contentIndex % activeContentSlides.length];

  const handlePrevImage = () =>
    setImageIndex((prev) => (prev - 1 + activeImageSlides.length) % activeImageSlides.length);
  const handleNextImage = () =>
    setImageIndex((prev) => (prev + 1) % activeImageSlides.length);

  const handlePrevContent = () =>
    setContentIndex((prev) => (prev - 1 + activeContentSlides.length) % activeContentSlides.length);
  const handleNextContent = () =>
    setContentIndex((prev) => (prev + 1) % activeContentSlides.length);

  useEffect(() => {
    if (activeImageSlides.length <= 1 && activeContentSlides.length <= 1) return undefined;
    const interval = window.setInterval(() => {
      setImageIndex((prev) => (prev + 1) % activeImageSlides.length);
      setContentIndex((prev) => (prev + 1) % activeContentSlides.length);
    }, 6000);
    return () => window.clearInterval(interval);
  }, [activeImageSlides.length, activeContentSlides.length]);

  const resolvedImage = appendMediaVersion(
    toMediaUrl(currentImage.imageUrl),
    typeof mediaVersion === 'number' ? mediaVersion : undefined
  );

  const presenter = config.presenter;

  return (
    <section className="container-shell mx-auto px-4 py-10">
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="h-full rounded-2xl border border-border-subtle bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 p-6 text-white shadow-premium">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-200">
              Services we provide
            </p>
            <h2 className="mt-4 text-2xl font-semibold sm:text-3xl">
              {presenter.title}
            </h2>
            <p className="mt-3 max-w-[54ch] text-sm text-blue-100/90 sm:text-base">
              {presenter.description}
            </p>
            <ul className="mt-6 grid gap-3 text-sm text-blue-100/90 sm:grid-cols-2">
              {presenter.services.map((item) => (
                <li
                  key={item}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button size="sm" onClick={() => onSubscribe('hero_presenter')}>
                {presenter.subscribeLabel || 'Subscribe'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onSubscribe('hero_presenter_explore')}>
                Explore
              </Button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <div
            className="rounded-2xl border border-border-subtle bg-panel-elevated p-4 shadow-premium"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') handlePrevImage();
              if (event.key === 'ArrowRight') handleNextImage();
            }}
          >
            <div className="relative overflow-hidden rounded-xl bg-slate-900" style={{ aspectRatio: '3 / 4' }}>
              <img
                src={resolvedImage}
                alt={currentImage.caption}
                className="h-full w-full object-cover transition-all duration-300"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 text-white">
                <p className="text-sm font-semibold">{currentImage.caption}</p>
                {currentImage.ctaHref ? (
                  <a
                    href={currentImage.ctaHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white shadow-sm"
                  >
                    {currentImage.ctaLabel}
                  </a>
                ) : (
                  <span className="mt-3 inline-flex items-center rounded-full bg-rose-500/80 px-3 py-1 text-xs font-semibold text-white">
                    {currentImage.ctaLabel}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={handlePrevImage} aria-label="Previous slide">
                Prev
              </Button>
              <div className="text-xs text-text-muted">
                {imageIndex + 1} / {activeImageSlides.length}
              </div>
              <Button size="sm" variant="outline" onClick={handleNextImage} aria-label="Next slide">
                Next
              </Button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border-subtle bg-panel-elevated p-4 shadow-premium">
            <div className="min-h-[200px]">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  New
                </span>
                <div className="text-xs text-text-muted">
                  {contentIndex + 1} / {activeContentSlides.length}
                </div>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-text">
                {currentContent.title}
              </h3>
              <p className="mt-2 text-sm text-text-muted">
                {currentContent.body}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={handlePrevContent} aria-label="Previous content">
                Prev
              </Button>
              <Button size="sm" variant="outline" onClick={handleNextContent} aria-label="Next content">
                Next
              </Button>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button size="lg" onClick={() => onSubscribe('hero_presenter')}>
              {presenter.subscribeLabel || 'Subscribe'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
