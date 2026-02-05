import React from 'react';
import Button from '../ui/Button';

type AdminModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  onSave?: () => void;
  hideFooter?: boolean;
  tone?: 'default' | 'dark';
  children: React.ReactNode;
};

export default function AdminModal({ title, open, onClose, onSave, hideFooter, tone = 'default', children }: AdminModalProps) {
  if (!open) return null;
  const isDark = tone === 'dark';
  const panelClass = isDark
    ? 'border-slate-800 bg-slate-950 text-sky-100'
    : 'border-border-subtle bg-panel-elevated text-text';
  const headerClass = isDark ? 'border-slate-800' : 'border-border-subtle';
  const closeClass = isDark
    ? 'border-slate-800 bg-slate-900 text-sky-100 hover:text-white'
    : 'border-border-subtle bg-panel text-text';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 py-6 backdrop-blur-sm sm:items-center">
      <div className={`w-full max-w-md overflow-hidden rounded-2xl border shadow-xl ${panelClass}`}>
        <div className={`flex items-center justify-between border-b px-5 py-4 ${headerClass}`}>
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${closeClass}`}
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
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
          <div className="space-y-3">{children}</div>
          {!hideFooter ? (
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              {onSave ? (
                <Button size="sm" onClick={onSave}>
                  Save
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
