declare global {
  interface Window {
    showDiv: () => void;
    showNone: () => void;
  }
}

export const initMenu = (): void => {
  const menuPanel = document.querySelector<HTMLElement>('.header-left');
  const openBtn = document.querySelector<HTMLElement>('.menu-controler');
  const closeBtn = document.querySelector<HTMLElement>('.menu');

  if (!menuPanel || !openBtn || !closeBtn) {
    return;
  }

  const setExpanded = (expanded: boolean): void => {
    menuPanel.classList.toggle('is-open', expanded);
    menuPanel.setAttribute('aria-hidden', expanded ? 'false' : 'true');
    openBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  };

  const showDiv = (): void => {
    setExpanded(true);
  };

  const showNone = (): void => {
    setExpanded(false);
  };

  window.showDiv = showDiv;
  window.showNone = showNone;

  const handleKeyActivate = (event: KeyboardEvent, action: () => void): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  openBtn.addEventListener('keydown', (event) => handleKeyActivate(event, showDiv));
  closeBtn.addEventListener('keydown', (event) => handleKeyActivate(event, showNone));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      showNone();
    }
  });

  setExpanded(false);
};
