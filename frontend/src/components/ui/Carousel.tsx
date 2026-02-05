import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from './Button';

type WidthPreset = 'sm' | 'md' | 'lg';

type CarouselProps<T> = {
  title?: string;
  subtitle?: string;
  items?: T[];
  renderItem?: (item: T, index: number) => React.ReactNode;
  children?: React.ReactNode;
  itemWidth?: WidthPreset;
  itemClassName?: string;
};

const widthClasses: Record<WidthPreset, string> = {
  sm: 'w-[220px] sm:w-[260px] md:w-[280px]',
  md: 'w-[260px] sm:w-[320px] md:w-[340px]',
  lg: 'w-[300px] sm:w-[360px] md:w-[400px]'
};

export default function Carousel<T>({
  title,
  subtitle,
  items,
  renderItem,
  children,
  itemWidth = 'md',
  itemClassName = ''
}: CarouselProps<T>) {
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const pointer = useRef({ isDown: false, startX: 0, scrollLeft: 0 });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const content = useMemo(() => {
    if (items && renderItem) {
      return items.map((item, index) => (
        <div
          key={`carousel-item-${index}`}
          className={`snap-start shrink-0 ${widthClasses[itemWidth]} ${itemClassName}`}
        >
          {renderItem(item, index)}
        </div>
      ));
    }
    return children;
  }, [children, itemClassName, itemWidth, items, renderItem]);

  const getStepSize = useCallback(() => {
    const el = sliderRef.current;
    if (!el) return 0;
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return el.clientWidth;
    const styles = window.getComputedStyle(el);
    const gap = parseFloat(styles.columnGap || styles.gap || '0');
    const itemWidth = first.getBoundingClientRect().width;
    const perView = Math.max(1, Math.floor(el.clientWidth / (itemWidth + gap)));
    return (itemWidth + gap) * perView;
  }, []);

  const updateControls = useCallback(() => {
    const el = sliderRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 0);
    setCanNext(el.scrollLeft < maxScroll - 1);
  }, []);

  const scrollByAmount = (direction: 'next' | 'prev') => {
    const el = sliderRef.current;
    if (!el) return;
    const amount = getStepSize();
    el.scrollBy({ left: direction === 'next' ? amount : -amount, behavior: 'smooth' });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = sliderRef.current;
    if (!el) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select')) {
      return;
    }
    pointer.current = {
      isDown: true,
      startX: event.clientX,
      scrollLeft: el.scrollLeft
    };
    el.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = sliderRef.current;
    if (!el || !pointer.current.isDown) return;
    const walk = event.clientX - pointer.current.startX;
    el.scrollLeft = pointer.current.scrollLeft - walk;
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = sliderRef.current;
    if (!el || !pointer.current.isDown) return;
    pointer.current.isDown = false;
    el.releasePointerCapture(event.pointerId);
    updateControls();
  };

  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    updateControls();

    const onScroll = () => updateControls();
    el.addEventListener('scroll', onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateControls());
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
    };
  }, [updateControls]);

  return (
    <div className="space-y-6">
      {(title || subtitle) && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl dark:text-slate-100">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{subtitle}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => scrollByAmount('prev')}
              disabled={!canPrev}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => scrollByAmount('next')}
              disabled={!canNext}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <div
        ref={sliderRef}
        className="scrollbar-hide flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 cursor-grab active:cursor-grabbing select-none"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') scrollByAmount('next');
          if (event.key === 'ArrowLeft') scrollByAmount('prev');
        }}
      >
        {content}
      </div>
    </div>
  );
}
