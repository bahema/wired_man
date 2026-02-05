import React, { useEffect } from 'react';
import Button from './ui/Button';
import { resolveMediaUrl } from '../data/mediaLibrary';

type VideoModalProps = {
  open: boolean;
  title: string;
  src: string;
  poster?: string | null;
  onClose: () => void;
};

export default function VideoModal({ open, title, src, poster, onClose }: VideoModalProps) {
  const resolvedSrc = resolveMediaUrl(src);
  const resolvedPoster = resolveMediaUrl(poster || '');
  useEffect(() => {
    if (!open) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-border-subtle bg-panel-elevated shadow-premium">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <h2 className="text-base font-semibold text-text">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="p-5">
          <div className="aspect-video w-full overflow-hidden rounded-2xl bg-slate-900">
            <video
              src={resolvedSrc}
              poster={resolvedPoster || undefined}
              controls
              preload="metadata"
              className="h-full w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
