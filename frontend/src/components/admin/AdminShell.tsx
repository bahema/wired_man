import React, { useEffect, useState } from 'react';
import AdminSidebar from './AdminSidebar';
import AdminTopBar from './AdminTopBar';
import MobileDrawer from './MobileDrawer';
import AdminFooter from './AdminFooter';
import Button from '../ui/Button';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    const stored = localStorage.getItem('admin-sidebar');
    return stored ? stored === 'visible' : true;
  });
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    const stored = localStorage.getItem('admin-density');
    return stored === 'compact' ? 'compact' : 'comfortable';
  });
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('admin-theme');
    return stored ? stored === 'dark' : false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('admin-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem('admin-density', density);
  }, [density]);

  useEffect(() => {
    localStorage.setItem('admin-sidebar', sidebarVisible ? 'visible' : 'hidden');
  }, [sidebarVisible]);

  return (
    <div
      className={`min-h-screen bg-surface-accent overflow-x-hidden ${
        density === 'compact' ? 'density-compact' : 'density-comfortable'
      }`}
    >
      <AdminTopBar
        onOpenMenu={() => setOpen(true)}
        onToggleSidebar={() => setSidebarVisible((prev) => !prev)}
        sidebarVisible={sidebarVisible}
        density={density}
        onToggleDensity={() => setDensity((prev) => (prev === 'compact' ? 'comfortable' : 'compact'))}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
      />
      <div className="fixed left-4 top-16 z-30 md:hidden">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          className="w-fit"
        >
          Menu
        </Button>
      </div>
      <MobileDrawer open={open} onClose={() => setOpen(false)} />
      <div
        className={`container-shell grid gap-4 pt-20 pb-4 sm:gap-6 sm:pb-6 ${
          sidebarVisible ? 'md:grid-cols-[240px_1fr]' : 'md:grid-cols-[1fr]'
        }`}
      >
        {sidebarVisible ? (
          <aside className="hidden h-max rounded-2xl border border-border-subtle bg-panel p-4 shadow-premium md:block">
            <AdminSidebar />
          </aside>
        ) : null}
        <main className="admin-content min-w-0">{children}</main>
      </div>
      <AdminFooter />
    </div>
  );
}
