import React, { useState } from 'react';

type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

type AccordionProps = {
  items: FaqItem[];
};

export default function Accordion({ items }: AccordionProps) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-2xl border border-border-subtle bg-panel p-5 shadow-premium"
        >
          <button
            type="button"
            className="flex w-full items-center justify-between text-left text-base font-semibold text-text"
            onClick={() => setOpenId(openId === item.id ? null : item.id)}
          >
            {item.question}
            <span className="text-xl text-text-muted">
              {openId === item.id ? '-' : '+'}
            </span>
          </button>
          {openId === item.id && (
            <p className="mt-3 text-sm text-text-muted">{item.answer}</p>
          )}
        </div>
      ))}
    </div>
  );
}
