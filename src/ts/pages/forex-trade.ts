export const initForexPage = (): void => {
  const slider = document.querySelector<HTMLElement>('.content-last .slider');
  const prevButton = slider?.querySelector<HTMLElement>('.slider-button.prev') ?? null;
  const nextButton = slider?.querySelector<HTMLElement>('.slider-button.next') ?? null;
  const cardContainer = slider?.querySelector<HTMLElement>('.card-container') ?? null;
  const cards = slider?.querySelectorAll<HTMLElement>('.card') ?? [];
  const pagination = slider?.querySelector<HTMLElement>('.pagination') ?? null;

  if (!slider || !cardContainer || cards.length === 0) {
    return;
  }

  let currentIndex = 0;
  let autoplayInterval: number | null = null;
  let visibleCards = 1;
  let maxIndex = 0;
  const totalCards = cards.length;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const buildPagination = (): void => {
    if (!pagination) return;
    pagination.innerHTML = '';
    for (let i = 0; i < maxIndex + 1; i += 1) {
      const dot = document.createElement('div');
      dot.classList.add('dot');
      if (i === 0) dot.classList.add('active');
      dot.setAttribute('role', 'button');
      dot.setAttribute('tabindex', '0');
      dot.setAttribute('aria-label', `Go to card group ${i + 1}`);
      pagination.appendChild(dot);
    }

    pagination.querySelectorAll<HTMLElement>('.dot').forEach((dot, index) => {
      dot.addEventListener('click', () => {
        currentIndex = index;
        updateSliderPosition();
      });

      dot.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          currentIndex = index;
          updateSliderPosition();
        }
      });
    });
  };

  const updateDots = (): void => {
    if (!pagination) return;
    const dots = pagination.querySelectorAll<HTMLElement>('.dot');
    dots.forEach((dot) => dot.classList.remove('active'));
    if (dots[currentIndex]) dots[currentIndex].classList.add('active');
  };

  const updateSliderPosition = (): void => {
    const cardWidth = cards[0].offsetWidth || 1;
    const gap = Number.parseInt(getComputedStyle(cardContainer).gap, 10) || 0;
    const offset = -(cardWidth + gap) * currentIndex;
    cardContainer.style.transform = `translateX(${offset}px)`;
    updateDots();
  };

  const updateMeasurements = (): void => {
    const sliderWidth = slider.offsetWidth || 1;
    const cardWidth = cards[0].offsetWidth || 1;
    const gap = Number.parseInt(getComputedStyle(cardContainer).gap, 10) || 0;
    visibleCards = Math.max(1, Math.floor(sliderWidth / (cardWidth + gap)));
    maxIndex = Math.max(0, totalCards - visibleCards);
    if (currentIndex > maxIndex) currentIndex = maxIndex;
    buildPagination();
    updateSliderPosition();
  };

  const nextSlide = (): void => {
    if (currentIndex < maxIndex) {
      currentIndex += 1;
    } else {
      currentIndex = 0;
    }
    updateSliderPosition();
  };

  const prevSlide = (): void => {
    if (currentIndex > 0) {
      currentIndex -= 1;
    } else {
      currentIndex = maxIndex;
    }
    updateSliderPosition();
  };

  const startAutoplay = (): void => {
    if (prefersReducedMotion) {
      return;
    }
    stopAutoplay();
    autoplayInterval = window.setInterval(nextSlide, 3000);
  };

  const stopAutoplay = (): void => {
    if (autoplayInterval !== null) {
      window.clearInterval(autoplayInterval);
      autoplayInterval = null;
    }
  };

  if (nextButton) nextButton.addEventListener('click', nextSlide);
  if (prevButton) prevButton.addEventListener('click', prevSlide);

  cardContainer.addEventListener('mouseenter', stopAutoplay);
  cardContainer.addEventListener('mouseleave', startAutoplay);

  let pointerStartX = 0;
  let pointerActive = false;

  cardContainer.addEventListener('pointerdown', (event) => {
    pointerStartX = event.clientX;
    pointerActive = true;
  });

  cardContainer.addEventListener('pointerup', (event) => {
    if (!pointerActive) return;
    const deltaX = event.clientX - pointerStartX;
    if (Math.abs(deltaX) > 50) {
      if (deltaX < 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
    pointerActive = false;
  });

  cardContainer.addEventListener('pointerleave', () => {
    pointerActive = false;
  });

  let resizeTimer: number | null = null;
  window.addEventListener('resize', () => {
    if (resizeTimer !== null) {
      window.clearTimeout(resizeTimer);
    }
    resizeTimer = window.setTimeout(updateMeasurements, 150);
  });

  updateMeasurements();
  startAutoplay();
};
