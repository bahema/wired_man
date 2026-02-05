import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import { publicApi } from '../../services/publicApi';

type AdminTopBarProps = {
  onOpenMenu: () => void;
  onToggleSidebar: () => void;
  sidebarVisible: boolean;
  density: 'comfortable' | 'compact';
  onToggleDensity: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
};

export default function AdminTopBar({
  onOpenMenu,
  onToggleSidebar,
  sidebarVisible,
  density,
  onToggleDensity,
  isDark,
  onToggleTheme
}: AdminTopBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const handleLogout = async () => {
    const token = sessionStorage.getItem('boss-admin-session');
    try {
      await publicApi.adminLogout(token);
    } catch {
      // Ignore logout failures to still clear local session.
    }
    sessionStorage.removeItem('boss-admin-session');
    localStorage.removeItem('boss-admin-session');
    localStorage.removeItem('boss-trusted-device');
    window.location.href = '/boss/login';
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-40 border-b border-blue-200/30 bg-blue-950 text-white">
      <div className="container-shell flex flex-col gap-2 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/icons/Screenshot 2024-03-31 121526.png"
              alt="Boss Desk logo"
              className="h-10 w-10 rounded-full border border-amber-200/60 bg-amber-100/90 object-cover md:h-12 md:w-12"
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-100 md:text-sm md:tracking-[0.35em]">
                Boss Desk
              </div>
              <div className="hidden text-sm font-semibold text-white sm:block md:text-base">
                Email Marketing HQ
              </div>
            </div>
          </div>
          <div className="relative flex flex-nowrap items-center gap-2 md:gap-3">
          <Link to="/boss/products">
            <Button className="rounded-full bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 md:px-5 whitespace-nowrap">
              New
            </Button>
          </Link>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 border border-white/80 hover:bg-blue-50 md:px-5 whitespace-nowrap"
          >
            Log out
          </Button>
          <Button
            variant="outline"
            onClick={() => setMoreOpen((prev) => !prev)}
            className="h-9 w-9 rounded-full border-red-400/60 bg-red-600 p-0 text-white hover:bg-red-700 md:h-10 md:w-10"
            aria-label="More"
          >
            ⋮
          </Button>
          {moreOpen ? (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-border-subtle bg-panel p-3 text-sm text-text shadow-premium">
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onToggleSidebar();
                }}
                className="w-full rounded-lg px-3 py-2 text-left hover:bg-panel-elevated"
              >
                {sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onToggleDensity();
                }}
                className="w-full rounded-lg px-3 py-2 text-left hover:bg-panel-elevated"
              >
                {density === 'compact' ? 'Comfortable density' : 'Compact density'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onToggleTheme();
                }}
                className="w-full rounded-lg px-3 py-2 text-left hover:bg-panel-elevated"
              >
                Switch to {isDark ? 'light' : 'dark'} mode
              </button>
            </div>
          ) : null}
        </div>
        </div>
      </div>

    </header>
  );
}
