import React, { useEffect, useRef } from 'react';
import AdminSidebar from './AdminSidebar';

type MobileDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export default function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const drawer = drawerRef.current;
        if (!drawer) return;
        const focusable = drawer.querySelectorAll<HTMLElement>(
          'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-[60] ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <button
        type="button"
        aria-label="Close menu"
        className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        className={`absolute left-0 top-0 flex h-full w-[84vw] max-w-[340px] flex-col rounded-r-2xl bg-panel/90 p-4 shadow-xl backdrop-blur-xl transition-transform duration-200 ease-out motion-reduce:transition-none sm:w-[70vw] sm:max-w-sm ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-text">Boss Menu</p>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-400/60 bg-red-600 text-white shadow-sm hover:bg-red-700"
            onClick={onClose}
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
        </div>
        <div className="mt-4 flex-1 overflow-y-auto pr-2">
          <AdminSidebar onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
