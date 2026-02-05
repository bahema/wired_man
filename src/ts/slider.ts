export const initProductSlider = (): void => {
  const sliderRoot = document.querySelector<HTMLElement>('.slider-container');
  const slidesTrack = sliderRoot?.querySelector<HTMLElement>('.slides') ?? null;
  const slides = sliderRoot?.querySelectorAll<HTMLElement>('.slide') ?? [];
  const prev = sliderRoot?.querySelector<HTMLElement>('.prev') ?? null;
  const next = sliderRoot?.querySelector<HTMLElement>('.next') ?? null;
  const dots = sliderRoot?.querySelectorAll<HTMLElement>('.dot') ?? [];

  if (!slidesTrack || slides.length === 0) {
    return;
  }

  let currentIndex = 0;
  let autoTimer: number | null = null;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const updateSlider = (index: number): void => {
    slidesTrack.style.transform = `translateX(-${index * 100}%)`;
    dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
  };

  const showNextSlide = (): void => {
    currentIndex = (currentIndex + 1) % slides.length;
    updateSlider(currentIndex);
  };

  const showPrevSlide = (): void => {
    currentIndex = (currentIndex - 1 + slides.length) % slides.length;
    updateSlider(currentIndex);
  };

  const startAuto = (): void => {
    if (prefersReducedMotion) {
      return;
    }
    stopAuto();
    autoTimer = window.setInterval(showNextSlide, 5000);
  };

  const stopAuto = (): void => {
    if (autoTimer !== null) {
      window.clearInterval(autoTimer);
      autoTimer = null;
    }
  };

  if (next) {
    next.addEventListener('click', () => {
      stopAuto();
      showNextSlide();
      startAuto();
    });
  }

  if (prev) {
    prev.addEventListener('click', () => {
      stopAuto();
      showPrevSlide();
      startAuto();
    });
  }

  dots.forEach((dot, index) => {
    dot.setAttribute('role', 'button');
    dot.setAttribute('tabindex', '0');
    dot.setAttribute('aria-label', `Go to slide ${index + 1}`);

    dot.addEventListener('click', () => {
      stopAuto();
      currentIndex = index;
      updateSlider(currentIndex);
      startAuto();
    });

    dot.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        stopAuto();
        currentIndex = index;
        updateSlider(currentIndex);
        startAuto();
      }
    });
  });

  let pointerStartX = 0;
  let pointerActive = false;

  const onPointerDown = (event: PointerEvent): void => {
    pointerStartX = event.clientX;
    pointerActive = true;
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!pointerActive) return;
    const deltaX = event.clientX - pointerStartX;
    if (Math.abs(deltaX) > 50) {
      stopAuto();
      if (deltaX < 0) {
        showNextSlide();
      } else {
        showPrevSlide();
      }
      startAuto();
    }
    pointerActive = false;
  };

  slidesTrack.addEventListener('pointerdown', onPointerDown);
  slidesTrack.addEventListener('pointerup', onPointerUp);
  slidesTrack.addEventListener('pointerleave', () => {
    pointerActive = false;
  });

  slidesTrack.addEventListener('mouseenter', stopAuto);
  slidesTrack.addEventListener('mouseleave', startAuto);

  updateSlider(currentIndex);
  startAuto();
};
