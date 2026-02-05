import React from 'react';

export default function MarqueeTicker({ items }: { items: string[] }) {
  const loopItems = [...items, ...items];
  return (
    <div className="w-full overflow-hidden">
      <div className="ticker-track flex min-w-max items-center gap-6">
        {loopItems.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="rounded-full border border-border-subtle bg-panel px-4 py-2 text-xs font-semibold text-text-muted shadow-premium"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
