import React, { useEffect, useMemo, useState } from 'react';
import SliderControls from './SliderControls';
import { useSlider } from './useSlider';

type ItemsPerBreakpoint = {
  base: number;
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
};

type SliderProps<T> = {
  title?: string;
  subtitle?: string;
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemsPerBreakpoint?: ItemsPerBreakpoint;
  gap?: number;
  loop?: boolean;
  showDots?: boolean;
  showArrows?: boolean;
  autoplay?: boolean;
  autoplayIntervalMs?: number;
  className?: string;
};

const breakpoints = [
  { minWidth: 1280, key: 'xl' },
  { minWidth: 1024, key: 'lg' },
  { minWidth: 768, key: 'md' },
  { minWidth: 640, key: 'sm' }
] as const;

export default function Slider<T>({
  title,
  subtitle,
  items,
  renderItem,
  itemsPerBreakpoint = { base: 1, sm: 2, lg: 3, xl: 4 },
  gap = 24,
  loop = false,
  showDots = false,
  showArrows = true,
  autoplay = false,
  autoplayIntervalMs = 3500,
  className = ''
}: SliderProps<T>) {
  const { containerRef, currentIndex, canPrev, canNext, scrollByAmount, scrollToIndex, onPointerDown } =
    useSlider({ itemCount: items.length, loop });
  const [isPaused, setIsPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const onVisibility = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!autoplay || mediaQuery.matches || !isVisible) return;
    if (isPaused) return;
    const id = window.setInterval(() => {
      scrollByAmount('next');
    }, autoplayIntervalMs);
    return () => window.clearInterval(id);
  }, [autoplay, autoplayIntervalMs, isPaused, isVisible, scrollByAmount]);

  const [itemsPerView, setItemsPerView] = useState(itemsPerBreakpoint.base);

  useEffect(() => {
    const update = () => {
      const width = window.innerWidth;
      const matched = breakpoints.find((bp) => width >= bp.minWidth);
      if (!matched) {
        setItemsPerView(itemsPerBreakpoint.base);
        return;
      }
      const value = itemsPerBreakpoint[matched.key] || itemsPerBreakpoint.base;
      setItemsPerView(value);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [itemsPerBreakpoint]);

  const itemStyle = useMemo(() => {
    const perView = Math.max(1, itemsPerView);
    const gapTotal = gap * (perView - 1);
    return {
      flex: `0 0 calc((100% - ${gapTotal}px) / ${perView})`
    } as React.CSSProperties;
  }, [gap, itemsPerView]);

  return (
    <div className={`space-y-6 ${className}`} role="region" aria-roledescription="carousel">
      {(title || subtitle || showArrows || showDots) && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {title ? (
              <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-100">
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{subtitle}</p>
            ) : null}
          </div>
          {showArrows || showDots ? (
            <SliderControls
              canPrev={canPrev}
              canNext={canNext}
              onPrev={() => scrollByAmount('prev')}
              onNext={() => scrollByAmount('next')}
            />
          ) : null}
        </div>
      )}
      <div
        ref={containerRef}
        className="scrollbar-hide flex snap-x snap-mandatory overflow-x-auto pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 motion-reduce:scroll-auto"
        style={{ gap: `${gap}px` }}
        tabIndex={0}
        onPointerDown={(event) => {
          setIsPaused(true);
          onPointerDown(event);
        }}
        onPointerUp={() => setIsPaused(false)}
        onPointerLeave={() => setIsPaused(false)}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocus={() => setIsPaused(true)}
        onBlur={() => setIsPaused(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') scrollByAmount('next');
          if (event.key === 'ArrowLeft') scrollByAmount('prev');
        }}
        aria-label={title || 'Carousel'}
      >
        {items.map((item, index) => (
          <div
            key={`slider-item-${index}`}
            className="snap-start shrink-0"
            style={itemStyle}
            data-slide
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
      {showDots ? (
        <div className="flex justify-center gap-2" aria-label="Slider position">
          {Array.from({ length: items.length }).map((_, index) => (
            <button
              key={`dot-${index}`}
              type="button"
              onClick={() => scrollToIndex(index)}
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === currentIndex ? 'true' : 'false'}
              className={`h-2 w-2 rounded-full transition ${
                index === currentIndex ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
