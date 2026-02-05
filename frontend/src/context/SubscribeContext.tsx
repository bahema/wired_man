import React, { createContext, useContext, useMemo, useState } from 'react';

export type SubscribeIntent = {
  productId?: string;
  affiliateLink?: string;
  source?: string;
  type?: 'video';
  video?: {
    id: string;
    title: string;
    src: string;
    poster?: string | null;
  };
};

type SubscribeContextValue = {
  isOpen: boolean;
  open: (intent?: SubscribeIntent) => void;
  close: () => void;
  intent: SubscribeIntent | null;
  clearIntent: () => void;
  completedIntent: SubscribeIntent | null;
  clearCompletedIntent: () => void;
  completeIntent: (intent: SubscribeIntent) => void;
};

const SubscribeContext = createContext<SubscribeContextValue | undefined>(undefined);

export function SubscribeProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [intent, setIntent] = useState<SubscribeIntent | null>(null);
  const [completedIntent, setCompletedIntent] = useState<SubscribeIntent | null>(null);

  const value = useMemo(
    () => ({
      isOpen,
      open: (nextIntent?: SubscribeIntent) => {
        if (nextIntent?.affiliateLink) {
          window.open(nextIntent.affiliateLink, '_blank', 'noopener,noreferrer');
          setIsOpen(false);
          setIntent(null);
          return;
        }
        setIntent(nextIntent || null);
        setIsOpen(true);
      },
      close: () => {
        setIsOpen(false);
        setIntent(null);
      },
      intent,
      clearIntent: () => setIntent(null),
      completedIntent,
      clearCompletedIntent: () => setCompletedIntent(null),
      completeIntent: (nextIntent: SubscribeIntent) => {
        setCompletedIntent(nextIntent);
        setIntent(null);
      }
    }),
    [isOpen, intent, completedIntent]
  );

  return <SubscribeContext.Provider value={value}>{children}</SubscribeContext.Provider>;
}

export function useSubscribe() {
  const ctx = useContext(SubscribeContext);
  if (!ctx) {
    throw new Error('useSubscribe must be used within SubscribeProvider');
  }
  return ctx;
}
