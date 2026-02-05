import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Button from './ui/Button';
import { useSubscribe } from '../context/SubscribeContext';
import { mockTicker } from '../data/mockData';
import MarqueeTicker from './MarqueeTicker';
import Footer from './Footer';
import { buildApiUrl } from '../data/mediaLibrary';
import { COUNTRY_OPTIONS } from '../data/countries';
import { publicApi } from '../services/publicApi';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { open } = useSubscribe();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [showThemeHint, setShowThemeHint] = useState(true);
  const [tickerItems, setTickerItems] = useState<string[]>(mockTicker);
  const [seasonalTheme, setSeasonalTheme] = useState('none');
  const [customTheme, setCustomTheme] = useState<Record<string, string> | null>(null);
  const [navPages, setNavPages] = useState<{ slug: string; title: string }[]>([]);

  const countryMap = useMemo(() => {
    const map = new Map<string, string>();
    COUNTRY_OPTIONS.forEach((option) => {
      map.set(option.code, option.name);
    });
    return map;
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const root = document.documentElement;
    const keys = ['--bg', '--bg-accent', '--panel', '--panel-elevated', '--border', '--text', '--text-muted', '--accent'];
    keys.forEach((key) => root.style.removeProperty(key));
    if (customTheme) {
      Object.entries(customTheme).forEach(([key, value]) => {
        if (key.startsWith('--') && value) {
          root.style.setProperty(key, value);
        }
      });
    }
  }, [customTheme]);

  useEffect(() => {
    const root = document.documentElement;
    if (seasonalTheme && seasonalTheme !== 'none') {
      root.setAttribute('data-theme', seasonalTheme);
      return;
    }
    if (customTheme) {
      root.setAttribute('data-theme', 'custom');
      return;
    }
    root.removeAttribute('data-theme');
  }, [seasonalTheme, customTheme]);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowThemeHint(false), 2000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const loadTheme = async () => {
      try {
        const theme = await publicApi.fetchTheme();
        if (!active) return;
        setSeasonalTheme(theme.seasonalTheme || 'none');
        setIsDark(theme.mode === 'dark');
        setCustomTheme(theme.customTheme?.values || null);
      } catch {
        // keep default theme
      }
    };

    void loadTheme();

    const source = new EventSource(buildApiUrl('/api/public/stream'));
    const handleStream = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { changed?: string[] };
        const changed = payload.changed || [];
        if (changed.includes('theme')) {
          void loadTheme();
        }
      } catch {
        // ignore malformed events
      }
    };
    source.addEventListener('content', handleStream);

    const handleFocus = () => {
      void loadTheme();
    };
    const interval = window.setInterval(() => {
      if (!document.hidden) {
        void loadTheme();
      }
    }, 1000);
    window.addEventListener('focus', handleFocus);

    return () => {
      active = false;
      source.removeEventListener('content', handleStream);
      source.close();
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadPages = async () => {
      try {
        const pages = await publicApi.fetchPages();
        if (!active) return;
        setNavPages(pages);
      } catch {
        // keep nav defaults
      }
    };

    void loadPages();

    const source = new EventSource(buildApiUrl('/api/public/stream'));
    const handleStream = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { changed?: string[] };
        const changed = payload.changed || [];
        if (changed.includes('pages')) {
          void loadPages();
        }
      } catch {
        // ignore malformed events
      }
    };
    source.addEventListener('content', handleStream);

    return () => {
      active = false;
      source.removeEventListener('content', handleStream);
      source.close();
    };
  }, []);

  const dynamicLinks = navPages.map((page) => ({
    to: `/page/${page.slug}`,
    label: page.title
  }));
  const mainLinks = [
    { to: '/', label: 'Automation' },
    { to: '/items', label: 'Your First 2000$' },
    { to: '/forex', label: 'Forex Trade & Betting' },
    ...dynamicLinks
  ];

  useEffect(() => {
    let active = true;
    const loadTicker = async () => {
      try {
        const data = await publicApi.fetchTicker();
        if (!active) return;
        const next = data.items
          .filter((item) => item.isActive ?? true)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .map((item) => {
            if (typeof item.text === 'string' && item.text.trim()) {
              return item.text.trim();
            }
            const name = item.name?.trim();
            if (!name) return '';
            const country = item.country ? countryMap.get(item.country) || item.country : 'Global';
            return `${name} - ${country}`;
          })
          .filter(Boolean);
        setTickerItems(next);
      } catch {
        if (active) setTickerItems([]);
      }
    };

    void loadTicker();

    const source = new EventSource(buildApiUrl('/api/public/stream'));
    const handleStream = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { changed?: string[] };
        const changed = payload.changed || [];
        if (changed.includes('analytics')) {
          void loadTicker();
        }
      } catch {
        // ignore malformed events
      }
    };
    source.addEventListener('content', handleStream);

    return () => {
      active = false;
      source.removeEventListener('content', handleStream);
      source.close();
    };
  }, [countryMap]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 w-full border-b border-border-subtle bg-panel backdrop-blur">
        <div className="container-shell flex items-center justify-between py-2 sm:py-3">
          <div className="flex items-center gap-3">
            <img
              src="/icons/Screenshot 2024-03-31 121526.png"
              alt="Work Pays"
              className="h-10 w-10 rounded-full md:h-12 md:w-12"
            />
          </div>
          <div className="hidden flex-1 items-center justify-center md:flex">
            <div className="w-full max-w-md">
              <MarqueeTicker items={tickerItems} />
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-text-muted md:flex">
            {mainLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className="hover:translate-y-[-1px] transition-transform transition-colors duration-200 hover:text-text"
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Button
                variant="icon"
                size="sm"
                aria-label="Toggle theme"
                onClick={() => setIsDark((prev) => !prev)}
              >
                {isDark ? '☀️' : '🌙'}
              </Button>
              {showThemeHint ? (
                <div className="pointer-events-none absolute -right-2 -top-3 rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm dark:bg-white dark:text-black">
                  Toggle
                </div>
              ) : null}
            </div>
            <Button size="sm" onClick={open}>Subscribe</Button>
            {!isMenuOpen && (
              <button
                type="button"
                aria-label="Open menu"
                className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-panel text-text shadow-sm transition-transform hover:-translate-y-0.5"
                onClick={() => setIsMenuOpen(true)}
              >
                <img
                  src="/icons/menu-black-rounded-square-interface-button_icon-icons.com_72990.png"
                  alt=""
                  className="h-4 w-4"
                />
              </button>
            )}
          </div>
        </div>
      </header>
      {isMenuOpen ? (
        <div className="fixed left-0 right-0 top-[64px] z-40 md:hidden">
          <div className="container-shell py-4">
            <div className="relative ml-auto grid w-full max-w-[320px] gap-3 rounded-2xl border border-border-subtle bg-panel p-4 text-sm font-semibold text-text shadow-premium">
              <button
                type="button"
                aria-label="Close menu"
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-400/60 bg-red-600 text-white shadow-sm hover:bg-red-700"
                onClick={() => setIsMenuOpen(false)}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
              {mainLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setIsMenuOpen(false)}
                  className="whitespace-normal leading-snug transition-colors duration-200 hover:text-text"
                >
                  {link.label}
                </NavLink>
              ))}
              <div className="pt-2 overflow-hidden">
                <MarqueeTicker items={tickerItems} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <main>{children}</main>
      <Footer />
    </div>
  );
}
