export const initAutomationPage = (): void => {
  const sliderContainer = document.querySelector<HTMLElement>('.header-slider-container');
  const sliderTrack = sliderContainer?.querySelector<HTMLElement>('.slider') ?? null;
  const slides = sliderContainer?.querySelectorAll<HTMLElement>('.slide') ?? [];
  const nextButton = sliderContainer?.querySelector<HTMLElement>('.next-button') ?? null;
  const backButton = sliderContainer?.querySelector<HTMLElement>('.back-button') ?? null;
  const indicatorsContainer = sliderContainer?.querySelector<HTMLElement>('.indicators') ?? null;
  const captions = sliderContainer?.querySelectorAll<HTMLElement>('.caption') ?? [];

  if (!sliderContainer || !sliderTrack || slides.length === 0) {
    return;
  }

  let currentIndex = 0;
  let autoScroll: number | null = null;
  const slideCount = slides.length;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (indicatorsContainer) {
    indicatorsContainer.innerHTML = '';
    slides.forEach((_, index) => {
      const dot = document.createElement('div');
      dot.classList.add('dot');
      if (index === 0) dot.classList.add('active');
      dot.setAttribute('data-index', index.toString());
      dot.setAttribute('role', 'button');
      dot.setAttribute('tabindex', '0');
      dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
      indicatorsContainer.appendChild(dot);
    });
  }

  const updateActiveDot = (): void => {
    const dots = sliderContainer.querySelectorAll<HTMLElement>('.dot');
    dots.forEach((dot) => dot.classList.remove('active'));
    const activeDot = sliderContainer.querySelector<HTMLElement>(`.dot[data-index="${currentIndex}"]`);
    if (activeDot) activeDot.classList.add('active');
  };

  const activateSlide = (index: number): void => {
    sliderTrack.style.transform = `translateX(-${index * 100}%)`;

    captions.forEach((caption, i) => {
      caption.classList.toggle('active', i === index);
    });

    updateActiveDot();
  };

  const moveToNextSlide = (): void => {
    currentIndex = (currentIndex + 1) % slideCount;
    activateSlide(currentIndex);
  };

  const moveToPreviousSlide = (): void => {
    currentIndex = (currentIndex - 1 + slideCount) % slideCount;
    activateSlide(currentIndex);
  };

  const startAutoScroll = (): void => {
    if (prefersReducedMotion) {
      return;
    }
    stopAutoScroll();
    autoScroll = window.setInterval(moveToNextSlide, 4000);
  };

  const stopAutoScroll = (): void => {
    if (autoScroll !== null) {
      window.clearInterval(autoScroll);
      autoScroll = null;
    }
  };

  if (nextButton) {
    nextButton.addEventListener('click', () => {
      stopAutoScroll();
      moveToNextSlide();
      startAutoScroll();
    });
  }

  if (backButton) {
    backButton.addEventListener('click', () => {
      stopAutoScroll();
      moveToPreviousSlide();
      startAutoScroll();
    });
  }

  sliderContainer.addEventListener('mouseenter', stopAutoScroll);
  sliderContainer.addEventListener('mouseleave', startAutoScroll);

  sliderContainer.querySelectorAll<HTMLElement>('.dot').forEach((dot) => {
    dot.addEventListener('click', (event) => {
      stopAutoScroll();
      const target = event.currentTarget as HTMLElement;
      const indexValue = target.getAttribute('data-index');
      if (indexValue) {
        currentIndex = Number.parseInt(indexValue, 10);
        activateSlide(currentIndex);
        startAutoScroll();
      }
    });

    dot.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        stopAutoScroll();
        const target = event.currentTarget as HTMLElement;
        const indexValue = target.getAttribute('data-index');
        if (indexValue) {
          currentIndex = Number.parseInt(indexValue, 10);
          activateSlide(currentIndex);
          startAutoScroll();
        }
      }
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
      stopAutoScroll();
      moveToNextSlide();
      startAutoScroll();
    } else if (event.key === 'ArrowLeft') {
      stopAutoScroll();
      moveToPreviousSlide();
      startAutoScroll();
    }
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
      stopAutoScroll();
      if (deltaX < 0) {
        moveToNextSlide();
      } else {
        moveToPreviousSlide();
      }
      startAutoScroll();
    }
    pointerActive = false;
  };

  sliderContainer.addEventListener('pointerdown', onPointerDown);
  sliderContainer.addEventListener('pointerup', onPointerUp);
  sliderContainer.addEventListener('pointerleave', () => {
    pointerActive = false;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoScroll();
    } else {
      startAutoScroll();
    }
  });

  activateSlide(currentIndex);
  startAutoScroll();
};
