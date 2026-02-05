import { useEffect, useRef, useState } from 'react';

type UseSliderOptions = {
  itemCount: number;
  loop?: boolean;
};

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return reduced;
};

export const useSlider = ({ itemCount, loop = false }: UseSliderOptions) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(itemCount > 1);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let ticking = false;

    const update = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      setCanPrev(loop || el.scrollLeft > 1);
      setCanNext(loop || el.scrollLeft < maxScroll - 1);

      const children = Array.from(el.children) as HTMLElement[];
      if (!children.length) return;
      const center = el.scrollLeft + el.clientWidth / 2;
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;
      children.forEach((child, index) => {
        const childCenter = child.offsetLeft + child.offsetWidth / 2;
        const distance = Math.abs(center - childCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      setCurrentIndex(closestIndex);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    };

    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
    };
  }, [itemCount, loop]);

  const getStepSize = () => {
    const el = containerRef.current;
    if (!el) return 0;
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return el.clientWidth;
    const styles = window.getComputedStyle(el);
    const gap = parseFloat(styles.columnGap || styles.gap || '0');
    const itemWidth = first.getBoundingClientRect().width;
    const perView = Math.max(1, Math.round(el.clientWidth / (itemWidth + gap)));
    return (itemWidth + gap) * perView;
  };

  const scrollByAmount = (direction: 'next' | 'prev') => {
    const el = containerRef.current;
    if (!el) return;
    const amount = getStepSize();
    if (loop) {
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (direction === 'next' && el.scrollLeft >= maxScroll - 1) {
        el.scrollTo({ left: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        return;
      }
      if (direction === 'prev' && el.scrollLeft <= 1) {
        el.scrollTo({ left: maxScroll, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        return;
      }
    }
    el.scrollBy({
      left: direction === 'next' ? amount : -amount,
      behavior: prefersReducedMotion ? 'auto' : 'smooth'
    });
  };

  const scrollToIndex = (index: number) => {
    const el = containerRef.current;
    if (!el) return;
    const children = Array.from(el.children) as HTMLElement[];
    if (!children[index]) return;
    children[index].scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      inline: 'start',
      block: 'nearest'
    });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select')) {
      return;
    }
    el.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startScroll = el.scrollLeft;
    const onMove = (moveEvent: PointerEvent) => {
      const walk = moveEvent.clientX - startX;
      el.scrollLeft = startScroll - walk;
    };
    const onUp = () => {
      el.releasePointerCapture(event.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  return {
    containerRef,
    currentIndex,
    canPrev,
    canNext,
    scrollByAmount,
    scrollToIndex,
    onPointerDown
  };
};
