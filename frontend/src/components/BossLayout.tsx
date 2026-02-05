import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Button from './ui/Button';

const bossLinks = [
  { to: '/boss', label: 'Overview' },
  { to: '/boss/products', label: 'Products' },
  { to: '/boss/videos', label: 'Video Ads' },
  { to: '/boss/testimonials', label: 'Testimonials' },
  { to: '/boss/faqs', label: 'FAQs' },
  { to: '/boss/hero', label: 'Hero & Ticker' },
  { to: '/boss/campaigns', label: 'Campaigns' },
  { to: '/boss/automations', label: 'Automations' },
  { to: '/boss/audiences', label: 'Audiences' },
  { to: '/boss/sources', label: 'Forms & Sources' },
  { to: '/boss/deliverability', label: 'Deliverability' },
  { to: '/boss/calendar', label: 'Calendar' },
  { to: '/boss/placement', label: 'Placement Map' },
  { to: '/boss/settings', label: 'Settings' },
  { to: '/boss/diagnostics', label: 'Diagnostics' }
];

export default function BossLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-eye-comfort overflow-x-hidden">
      <header className="sticky top-0 z-50 w-full border-b border-border-subtle bg-panel backdrop-blur">
        <div className="container-shell flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <img
              src="/icons/Screenshot 2024-03-31 121526.png"
              alt="Boss Dashboard"
              className="h-9 w-9 rounded-full"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                Boss Desk
              </p>
              <p className="text-sm font-semibold text-text">
                Email Marketing HQ
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Open menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-panel text-text shadow-sm transition-transform hover:-translate-y-0.5 lg:hidden"
              onClick={() => setMenuOpen(true)}
            >
              <img
                src="/icons/menu-black-rounded-square-interface-button_icon-icons.com_72990.png"
                alt=""
                className="h-4 w-4"
              />
            </button>
            <Button size="sm" variant="outline">
              Export
            </Button>
            <Button size="sm">New Campaign</Button>
          </div>
        </div>
      </header>
      {menuOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute left-4 top-16 w-[260px] rounded-2xl border border-border-subtle bg-panel p-4 shadow-premium sm:w-[300px]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close menu"
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-400/60 bg-red-600 text-white shadow-sm hover:bg-red-700"
              onClick={() => setMenuOpen(false)}
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
            <nav className="mt-6 grid gap-2 text-sm font-semibold text-text-muted">
            {bossLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/boss'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-xl px-3 py-2 whitespace-normal leading-snug transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                        : 'hover:bg-panel-elevated'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
      <div className="container-shell grid gap-6 py-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden h-max rounded-2xl border border-border-subtle bg-panel p-4 shadow-premium lg:block">
          <nav className="grid gap-2 text-sm font-semibold text-text-muted">
            {bossLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/boss'}
                className={({ isActive }) =>
                  `rounded-xl px-3 py-2 whitespace-normal leading-snug transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200'
                      : 'hover:bg-panel-elevated'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
