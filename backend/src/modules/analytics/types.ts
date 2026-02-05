export type AdminAnalytics = {
  totals: {
    subscribers: number;
    totalUnsubscribed: number;
    clicksTotal: number;
    opensTotal: number;
    uniqueOpenersTotal: number;
  };
  last7Days: {
    subscribers: number;
    clicks: number;
    opens: number;
    uniqueOpens: number;
  };
  previous7Days?: {
    subscribers: number;
    clicks: number;
    opens: number;
    uniqueOpens: number;
    unsubscribes: number;
    deliverability: {
      queued7d: number;
      sent7d: number;
      failed7d: number;
      skipped7d: number;
    };
  };
  trends: {
    labels: string[];
    subscribersByDay: number[];
    clicksByDay: number[];
    opensByDay?: number[];
    unsubscribesByDay?: number[];
    queuedByDay?: number[];
    sentByDay?: number[];
    failedByDay?: number[];
    skippedByDay?: number[];
    sourcesByDay?: Array<{ label: string; counts: number[] }>;
  };
  sources: Array<{
    label: string;
    count: number;
    percent: number;
  }>;
  recentSubscribers: Array<{
    id: string;
    name?: string | null;
    email: string;
    phone?: string | null;
    country?: string | null;
    source?: string | null;
    confirmedAt?: string | null;
    createdAt: string;
  }>;
  welcomeEmailLastSentAt?: string | null;
  campaignClickStats: {
    uniqueClickers: number;
    totalClicks: number;
    clickRate: number;
  };
  campaignsSummary: {
    total: number;
    byStatus: Record<string, number>;
  };
  automationsSummary: {
    total: number;
    byStatus: Record<string, number>;
  };
  topCampaigns: Array<{
    id: string;
    name: string;
    sentCount: number;
    totalClicks: number;
    uniqueClickers: number;
    uniqueOpens: number;
    totalOpens: number;
  }>;
  topAutomations: Array<{
    id: string;
    name: string;
    sentCount: number;
    totalClicks: number;
    uniqueClickers: number;
    uniqueOpens: number;
    totalOpens: number;
  }>;
  topLinksLast7Days: Array<{
    url: string;
    clicks: number;
  }>;
  topLinksAllTime: Array<{
    url: string;
    clicks: number;
  }>;
  deliverability: {
    queued7d: number;
    sent7d: number;
    failed7d: number;
    skipped7d: number;
    failureRate: number;
    deliveryRate: number;
    avgSendSpeed: number;
    recentErrors: Array<{
      campaignId?: string | null;
      subscriberId?: string | null;
      message?: string | null;
      createdAt?: string | null;
    }>;
  };
  unsubscribes: {
    last7Days: number;
    total: number;
  };
};
