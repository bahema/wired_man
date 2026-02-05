import React, { useEffect, useMemo, useRef, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, AdminAnalytics } from '../services/adminApi';
import { buildApiUrl } from '../data/mediaLibrary';
import { COUNTRY_OPTIONS } from '../data/countries';
import { useSubscribe } from '../context/SubscribeContext';

const formatDayLabel = (label: string) => label.slice(5);

const formatSourceLabel = (value?: string | null) => {
  if (!value) return 'Unknown';
  const normalized = value.replace(/^\/+/, '').toLowerCase();
  if (normalized.includes('items')) return 'Your First 2000$';
  if (normalized.includes('forex')) return 'Forex Trade & Betting';
  if (normalized.includes('home') || normalized === '' || normalized === '/') return 'Home';
  return normalized.replaceAll('-', ' ');
};

const formatRelativeTime = (value?: string | null) => {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const normalizeSourceKey = (value?: string | null) =>
  formatSourceLabel(value).trim().toLowerCase();

const getDialCode = (country?: string | null) => {
  if (!country) return '';
  const match = COUNTRY_OPTIONS.find((option) => option.code === country);
  return match?.dial || '';
};

const SOURCE_COLORS = ['#2563eb', '#0ea5e9', '#38bdf8', '#94a3b8'];

const buildChartModel = (data: number[], labels: string[]) => {
  const width = 320;
  const height = 150;
  const padding = { left: 38, right: 12, top: 12, bottom: 28 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const safeLabels = labels.length ? labels : Array.from({ length: 7 }, (_, idx) => `Day ${idx + 1}`);
  const safeData = data.length ? data : safeLabels.map(() => 0);
  const maxValue = Math.max(...safeData, 1);
  const step = Math.max(1, Math.ceil(maxValue / 4));
  const maxTick = step * 4;
  const ticks = Array.from({ length: 5 }, (_, idx) => idx * step);

  const getX = (index: number) => {
    if (safeData.length <= 1) {
      return padding.left + chartWidth / 2;
    }
    return padding.left + (index / (safeData.length - 1)) * chartWidth;
  };

  const getY = (value: number) =>
    padding.top + chartHeight - (value / maxTick) * chartHeight;

  const points = safeData.map((value, index) => ({
    x: getX(index),
    y: getY(value)
  }));

  const baseY = padding.top + chartHeight;
  const linePath = points.length
    ? `M ${points.map((point) => `${point.x} ${point.y}`).join(' L ')}`
    : '';
  let smoothPath = '';
  let smoothSegments = '';
  if (points.length) {
    smoothPath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const current = points[i];
      const midX = (prev.x + current.x) / 2;
      const segment = ` Q ${midX} ${prev.y} ${current.x} ${current.y}`;
      smoothPath += segment;
      smoothSegments += segment;
    }
  }
  const areaPath = points.length
    ? `M ${points[0].x} ${baseY} L ${points[0].x} ${points[0].y}${smoothSegments} L ${
      points[points.length - 1].x
    } ${baseY} Z`
    : '';

  return {
    width,
    height,
    padding,
    chartWidth,
    chartHeight,
    baseY,
    ticks,
    maxTick,
    points,
    linePath: smoothPath || linePath,
    areaPath,
    labels: safeLabels,
    data: safeData
  };
};

const buildConicGradient = (sources: AdminAnalytics['sources'], highlightSource?: string | null) => {
  if (!sources.length) {
    return 'conic-gradient(#e2e8f0 0deg 360deg)';
  }
  const total = sources.reduce((sum, source) => sum + source.count, 0) || 1;
  let current = 0;
  const segments = sources.map((source, index) => {
    const span = (source.count / total) * 360;
    const next = current + span;
    const isHighlight = highlightSource && normalizeSourceKey(source.label) === highlightSource;
    const color = isHighlight ? '#f97316' : SOURCE_COLORS[index % SOURCE_COLORS.length];
    const segment = `${color} ${current}deg ${next}deg`;
    current = next;
    return segment;
  });
  if (current < 360) {
    segments.push(`#e2e8f0 ${current}deg 360deg`);
  }
  return `conic-gradient(${segments.join(', ')})`;
};

const buildChange = (series?: number[]) => {
  if (!series || series.length < 2) return null;
  const first = series[0] ?? 0;
  const last = series[series.length - 1] ?? 0;
  const rawDelta = last - first;
  const percent = first === 0 ? (last > 0 ? 100 : 0) : Math.round((rawDelta / first) * 100);
  const direction = percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat';
  return { delta: percent, direction } as const;
};

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const StatCard = ({
  label,
  value,
  subtext,
  tone = '#38bdf8',
  change
}: {
  label: string;
  value: string;
  subtext?: string;
  tone?: string;
  change?: { delta: number; direction: 'up' | 'down' | 'flat' };
}) => (
  <Card className="relative overflow-hidden p-4">
    <div className="absolute inset-x-0 bottom-0 h-16 opacity-40">
      <svg viewBox="0 0 240 80" className="h-full w-full">
        <defs>
          <linearGradient id={`wave-${slugify(label)}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity="0.35" />
            <stop offset="100%" stopColor={tone} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path
          d="M0,40 C30,20 60,20 90,40 C120,60 150,60 180,40 C200,28 220,24 240,30 L240,80 L0,80 Z"
          fill={`url(#wave-${slugify(label)})`}
        />
        <path
          d="M0,40 C30,20 60,20 90,40 C120,60 150,60 180,40 C200,28 220,24 240,30"
          fill="none"
          stroke={tone}
          strokeWidth="2"
          opacity="0.7"
        />
      </svg>
    </div>
    <div className="relative">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {value}
        </p>
        {change ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              change.direction === 'up'
                ? 'bg-emerald-100 text-emerald-700'
                : change.direction === 'down'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                change.direction === 'up'
                  ? 'bg-emerald-500'
                  : change.direction === 'down'
                    ? 'bg-red-500'
                    : 'bg-slate-400'
              }`}
            />
            {change.delta > 0 ? '+' : ''}{change.delta}%
          </span>
        ) : null}
      </div>
      {subtext ? <p className="mt-1 text-xs text-slate-500">{subtext}</p> : null}
    </div>
  </Card>
);

export default function BossAnalyticsPage() {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resetting, setResetting] = useState(false);
  const [toasts, setToasts] = useState<Record<string, { message: string; tone: 'success' | 'info' | 'warn' }>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const { open: openSubscribe } = useSubscribe();
  const [highlightSource, setHighlightSource] = useState<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const [includeUnsubscribed, setIncludeUnsubscribed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const source = new EventSource(buildApiUrl('/api/public/stream'));
    const load = async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setErrorMessage('');
      }
      try {
        const payload = await adminApi.getAnalytics({ includeUnsubscribed });
        if (mounted) {
          setData(payload);
        }
      } catch (error) {
        if (mounted && !silent) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load analytics.');
        }
      } finally {
        if (mounted && !silent) {
          setLoading(false);
          setResetting(false);
        }
      }
    };

    void load();

    const handleFocus = () => {
      void load(true);
    };
    const interval = window.setInterval(() => {
      if (!document.hidden) {
        void load(true);
      }
    }, 5000);
    window.addEventListener('focus', handleFocus);
    const handleStream = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { changed?: string[] };
        const refreshTypes = ['subscriber', 'click', 'campaign', 'job', 'unsubscribe', 'open'];
        const changed = payload.changed || [];
        if (changed.some((item) => refreshTypes.includes(item))) {
          void load(true);
        }
      } catch {
        // ignore malformed events
      }
    };
    source.addEventListener('content', handleStream);

    return () => {
      mounted = false;
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(interval);
      source.removeEventListener('content', handleStream);
      source.close();
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, [includeUnsubscribed]);

  const totals = data?.totals;
  const last7Days = data?.last7Days;
  const trends = data?.trends;
  const sources = data?.sources ?? [];
  const recentSubscribers = data?.recentSubscribers ?? [];
  const automationsSummary = data?.automationsSummary;
  const sourceChartStyle = useMemo(
    () => buildConicGradient(sources, highlightSource),
    [sources, highlightSource]
  );
  const subscribeGrowth = trends?.subscribersByDay ?? [];
  const clickGrowth = trends?.clicksByDay ?? [];
  const dayLabels = trends?.labels ?? [];
  const subscriberChart = useMemo(
    () => buildChartModel(subscribeGrowth, dayLabels),
    [subscribeGrowth, dayLabels]
  );
  const clickChart = useMemo(
    () => buildChartModel(clickGrowth, dayLabels),
    [clickGrowth, dayLabels]
  );
  const subscriberChange = useMemo(() => buildChange(subscribeGrowth), [subscribeGrowth]);
  const clickChange = useMemo(() => buildChange(clickGrowth), [clickGrowth]);
  const opensChange = useMemo(() => buildChange(trends?.opensByDay), [trends?.opensByDay]);

  const onResetAnalytics = async () => {
    if (!window.confirm('Reset analytics? This cannot be undone.')) return;
    setResetting(true);
    try {
      await adminApi.resetAnalytics();
      const payload = await adminApi.getAnalytics({ includeUnsubscribed });
      setData(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to reset analytics.');
    } finally {
      setResetting(false);
    }
  };

  const showToast = (key: string, message: string, tone: 'success' | 'info' | 'warn' = 'info') => {
    setToasts((prev) => ({ ...prev, [key]: { message, tone } }));
    window.setTimeout(() => {
      setToasts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 2000);
  };

  const handleAddSubscriber = () => {
    openSubscribe({ source: '/boss/analytics' });
    showToast('recent-add', 'Subscribe form opened.', 'info');
  };

  const handleResendAllConfirmations = async () => {
    showToast('recent-resend-all', 'Resending confirmations...', 'info');
    try {
      const result = await adminApi.resendUnconfirmedSubscribers();
      const sent = result.sent ?? 0;
      const failed = result.failed ?? 0;
      if (failed > 0) {
        showToast('recent-resend-all', `Sent ${sent}, failed ${failed}.`, 'warn');
      } else {
        showToast('recent-resend-all', `Sent ${sent} confirmations.`, 'success');
      }
      const payload = await adminApi.getAnalytics({ includeUnsubscribed });
      setData(payload);
    } catch (error) {
      showToast(
        'recent-resend-all',
        error instanceof Error ? error.message : 'Unable to resend confirmations.',
        'warn'
      );
    }
  };

  const handleDeleteSubscriber = async (leadId: string) => {
    if (!window.confirm('Unsubscribe this subscriber?')) return;
    setDeletingId(leadId);
    try {
      await adminApi.unsubscribeSubscriber(leadId);
      const payload = await adminApi.getAnalytics({ includeUnsubscribed });
      setData(payload);
      showToast(`recent-del-${leadId}`, 'Subscriber removed.', 'success');
    } catch (error) {
      showToast(
        `recent-del-${leadId}`,
        error instanceof Error ? error.message : 'Unable to remove subscriber.',
        'warn'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleResendConfirmation = async (leadId: string) => {
    setResendingId(leadId);
    try {
      await adminApi.resendSubscriberConfirmation(leadId);
      showToast(`recent-resend-${leadId}`, 'Confirmation sent.', 'success');
      const payload = await adminApi.getAnalytics({ includeUnsubscribed });
      setData(payload);
    } catch (error) {
      showToast(
        `recent-resend-${leadId}`,
        error instanceof Error ? error.message : 'Unable to resend confirmation.',
        'warn'
      );
    } finally {
      setResendingId(null);
    }
  };

  const InlineToast = ({
    toast,
    className = ''
  }: {
    toast?: { message: string; tone: 'success' | 'info' | 'warn' };
    className?: string;
  }) =>
    toast ? (
      <span
        className={`absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[10px] font-semibold shadow-lg ${className} ${
          toast.tone === 'success'
            ? 'border-emerald-300 bg-emerald-500/90 text-white'
            : toast.tone === 'warn'
              ? 'border-amber-300 bg-amber-500/90 text-white'
              : 'border-slate-300 bg-slate-700/90 text-white'
        }`}
        role="status"
      >
        {toast.message}
      </span>
    ) : null;

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Analytics</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Subscription and affiliate click performance from the live site.
          </p>
          </div>
          <Button size="sm" variant="outline" onClick={onResetAnalytics} disabled={resetting}>
            {resetting ? 'Resetting...' : 'Reset Analytics'}
          </Button>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Subscribers', value: (totals?.subscribers ?? 0).toLocaleString(), tone: '#2563eb', change: subscriberChange },
            {
              label: 'New Subscribers (7 days)',
              value: (last7Days?.subscribers ?? 0).toLocaleString(),
              tone: '#0ea5e9',
              change: subscriberChange
            },
            {
              label: 'Affiliate Clicks (7 days)',
              value: (last7Days?.clicks ?? 0).toLocaleString(),
              tone: '#38bdf8',
              change: clickChange
            },
            {
              label: 'Affiliate Clicks (total)',
              value: (totals?.clicksTotal ?? 0).toLocaleString(),
              tone: '#94a3b8',
              change: clickChange
            },
            {
              label: 'Click Rate',
              value: `${data?.campaignClickStats?.clickRate ?? 0}%`,
              tone: '#22c55e',
              change: clickChange
            }
          ].map((item) => (
            <StatCard
              key={item.label}
              label={item.label}
              value={loading || resetting ? '...' : item.value}
              tone={item.tone}
              change={item.change ?? undefined}
            />
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: 'Emails Queued (7 days)', value: (data?.deliverability?.queued7d ?? 0).toLocaleString(), tone: '#6366f1' },
            { label: 'Emails Sent (7 days)', value: (data?.deliverability?.sent7d ?? 0).toLocaleString(), tone: '#22c55e' },
            { label: 'Emails Failed (7 days)', value: (data?.deliverability?.failed7d ?? 0).toLocaleString(), tone: '#ef4444' },
            { label: 'Emails Skipped (7 days)', value: (data?.deliverability?.skipped7d ?? 0).toLocaleString(), tone: '#f59e0b' },
            { label: 'Failure Rate', value: `${data?.deliverability?.failureRate ?? 0}%`, tone: '#0f766e' }
          ].map((item) => (
            <StatCard
              key={item.label}
              label={item.label}
              value={loading || resetting ? '...' : item.value}
              tone={item.tone}
            />
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: 'Delivery Rate (7 days)', value: `${data?.deliverability?.deliveryRate ?? 0}%`, tone: '#14b8a6' },
            { label: 'Avg Send Speed (per hour)', value: (data?.deliverability?.avgSendSpeed ?? 0).toLocaleString(), tone: '#8b5cf6' },
            { label: 'Total Clickers', value: (data?.campaignClickStats?.uniqueClickers ?? 0).toLocaleString(), tone: '#0ea5e9', change: clickChange }
          ].map((item) => (
            <StatCard
              key={item.label}
              label={item.label}
              value={loading || resetting ? '...' : item.value}
              tone={item.tone}
              change={item.change ?? undefined}
            />
          ))}
        </div>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent Send Errors</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Latest failures from the job queue for quick investigation.
          </p>
          <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            {data?.deliverability?.recentErrors?.length ? (
              data.deliverability.recentErrors.map((error, index) => (
                <div
                  key={`${error.campaignId || 'unknown'}-${index}`}
                  className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-3 text-xs text-slate-500 dark:border-slate-700/70 dark:bg-slate-900/80"
                >
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {error.message || 'Unknown error'}
                  </div>
                  <div className="mt-1">
                    Campaign: {error.campaignId || 'Unknown'} · Subscriber: {error.subscriberId || 'Unknown'}
                  </div>
                  <div className="mt-1">At: {error.createdAt ? new Date(error.createdAt).toLocaleString() : 'Unknown'}</div>
                </div>
              ))
            ) : (
              <div>No recent send errors.</div>
            )}
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Unsubscribes (7 days)"
            value={loading || resetting ? '...' : (data?.unsubscribes?.last7Days ?? 0).toLocaleString()}
            tone="#f97316"
          />
          <StatCard
            label="Total Unsubscribed"
            value={loading || resetting ? '...' : (data?.unsubscribes?.total ?? 0).toLocaleString()}
            tone="#ef4444"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Opens (7 days)"
            value={loading || resetting ? '...' : (data?.last7Days?.opens ?? 0).toLocaleString()}
            subtext={`Unique: ${(data?.last7Days?.uniqueOpens ?? 0).toLocaleString()}`}
            tone="#0ea5e9"
            change={opensChange ?? undefined}
          />
          <StatCard
            label="Total Opens"
            value={loading || resetting ? '...' : (data?.totals?.opensTotal ?? 0).toLocaleString()}
            subtext={`Unique: ${(data?.totals?.uniqueOpenersTotal ?? 0).toLocaleString()}`}
            tone="#6366f1"
            change={opensChange ?? undefined}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Subscriber Growth
              </h2>
              <span className="text-xs text-slate-500">Last 7 days</span>
            </div>
            <svg viewBox={`0 0 ${subscriberChart.width} ${subscriberChart.height}`} className="mt-4 h-32 w-full">
              <defs>
                <linearGradient id="subWaveFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.05" />
                </linearGradient>
              </defs>
              {subscriberChart.ticks.map((tick) => {
                const y = subscriberChart.padding.top + subscriberChart.chartHeight - (tick / subscriberChart.maxTick) * subscriberChart.chartHeight;
                return (
                  <g key={`sub-tick-${tick}`}>
                    <line
                      x1={subscriberChart.padding.left}
                      x2={subscriberChart.width - subscriberChart.padding.right}
                      y1={y}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray="3 4"
                    />
                    <text
                      x={subscriberChart.padding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="10"
                      fill="#94a3b8"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}
              <path d={subscriberChart.areaPath} fill="url(#subWaveFill)" />
              <path d={subscriberChart.linePath} fill="none" stroke="#2563eb" strokeWidth="3" />
              {subscriberChart.labels.map((label, index) => (
                <text
                  key={`sub-label-${label}`}
                  x={subscriberChart.points[index]?.x ?? subscriberChart.padding.left}
                  y={subscriberChart.baseY + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#94a3b8"
                >
                  {formatDayLabel(label)}
                </text>
              ))}
            </svg>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Affiliate Clicks
              </h2>
              <span className="text-xs text-slate-500">Last 7 days</span>
            </div>
            <svg viewBox={`0 0 ${clickChart.width} ${clickChart.height}`} className="mt-4 h-32 w-full">
              <defs>
                <linearGradient id="clickWaveFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.05" />
                </linearGradient>
              </defs>
              {clickChart.ticks.map((tick) => {
                const y = clickChart.padding.top + clickChart.chartHeight - (tick / clickChart.maxTick) * clickChart.chartHeight;
                return (
                  <g key={`click-tick-${tick}`}>
                    <line
                      x1={clickChart.padding.left}
                      x2={clickChart.width - clickChart.padding.right}
                      y1={y}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray="3 4"
                    />
                    <text
                      x={clickChart.padding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize="10"
                      fill="#94a3b8"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}
              <path d={clickChart.areaPath} fill="url(#clickWaveFill)" />
              <path d={clickChart.linePath} fill="none" stroke="#0ea5e9" strokeWidth="3" />
              {clickChart.labels.map((label, index) => (
                <text
                  key={`click-label-${label}`}
                  x={clickChart.points[index]?.x ?? clickChart.padding.left}
                  y={clickChart.baseY + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#94a3b8"
                >
                  {formatDayLabel(label)}
                </text>
              ))}
            </svg>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Signup Sources</h2>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                <input
                  type="checkbox"
                  checked={includeUnsubscribed}
                  onChange={(event) => setIncludeUnsubscribed(event.target.checked)}
                  className="h-4 w-4"
                />
                Include unsubscribed
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-6">
              <div className="relative h-36 w-36">
                <div
                  className="absolute inset-0 rounded-full shadow-[0_12px_30px_rgba(15,23,42,0.15)]"
                  style={{ background: sourceChartStyle }}
                />
                <div className="absolute inset-3 rounded-full bg-white shadow-inner dark:bg-slate-900" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Total</div>
                    <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {sources.reduce((sum, source) => sum + source.count, 0).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                {sources.length ? (
                  sources.map((source, index) => (
                    <div key={source.label} className="flex items-center gap-2 text-xs font-semibold">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            highlightSource && normalizeSourceKey(source.label) === highlightSource
                              ? '#f97316'
                              : SOURCE_COLORS[index % SOURCE_COLORS.length]
                        }}
                      />
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {formatSourceLabel(source.label)} - {source.percent}%
                      </span>
                      {highlightSource && normalizeSourceKey(source.label) === highlightSource ? (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                          New
                        </span>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div>No recent signups yet.</div>
                )}
              </div>
            </div>
          </Card>
          <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Recent Subscribers
                  </h2>
                  <span className="text-xs text-slate-500">
                    Last welcome sent:{' '}
                    {data?.welcomeEmailLastSentAt
                      ? `${formatRelativeTime(data.welcomeEmailLastSentAt)} (${new Date(
                          data.welcomeEmailLastSentAt
                        ).toLocaleString()})`
                      : 'Never'}
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <InlineToast toast={toasts['recent-add']} className="z-50" />
                    <button
                      type="button"
                      className="min-h-[28px] rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      onClick={handleAddSubscriber}
                    >
                      Add
                    </button>
                  </div>
                  <div className="relative">
                    <InlineToast toast={toasts['recent-resend-all']} />
                    <button
                      type="button"
                      className="min-h-[28px] rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
                      onClick={() => void handleResendAllConfirmations()}
                    >
                      Resender
                    </button>
                  </div>
                  <div className="relative">
                    <InlineToast toast={toasts['recent-copy-all']} />
                    <button
                      type="button"
                      className="min-h-[28px] rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      onClick={() => {
                        const emails = recentSubscribers.map((lead) => lead.email).filter(Boolean).join('\n');
                        if (!emails) {
                          showToast('recent-copy-all', 'No emails to copy.', 'warn');
                          return;
                        }
                        void navigator.clipboard.writeText(emails);
                        showToast('recent-copy-all', 'All emails copied.', 'success');
                      }}
                    >
                      Copy all
                    </button>
                  </div>
                </div>
              </div>
              <span className="text-xs text-slate-500">Latest 8</span>
            </div>
            <div
              className={`mt-4 space-y-3 pr-1 text-sm text-slate-600 dark:text-slate-300 ${
                recentSubscribers.length > 2 ? 'max-h-56 overflow-y-auto' : ''
              }`}
            >
              {recentSubscribers.length ? (
                recentSubscribers.map((lead) => (
                  <div
                    key={lead.id}
                    className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 dark:border-slate-700/70 dark:bg-slate-900/80"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {lead.email}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <InlineToast toast={toasts[`recent-copy-${lead.id}`]} />
                          <button
                            type="button"
                            onClick={() => {
                              if (!lead.email) return;
                              void navigator.clipboard.writeText(lead.email);
                              showToast(`recent-copy-${lead.id}`, 'Email copied.', 'success');
                            }}
                            className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            Copy
                          </button>
                        </div>
                        {!lead.confirmedAt ? (
                          <div className="relative">
                            <InlineToast toast={toasts[`recent-resend-${lead.id}`]} />
                            <button
                              type="button"
                              className="rounded-full border border-amber-300 px-2 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-50"
                              onClick={() => void handleResendConfirmation(lead.id)}
                              disabled={resendingId === lead.id}
                            >
                              {resendingId === lead.id ? '...' : 'Resend'}
                            </button>
                          </div>
                        ) : null}
                        <div className="relative">
                          <InlineToast toast={toasts[`recent-del-${lead.id}`]} />
                          <button
                            type="button"
                            className="rounded-full bg-emerald-500 px-2 py-1 text-[10px] font-semibold text-white shadow-sm hover:bg-emerald-600"
                            onClick={() => void handleDeleteSubscriber(lead.id)}
                            disabled={deletingId === lead.id}
                          >
                            {deletingId === lead.id ? '...' : 'Del'}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      {lead.name || 'Subscriber'} · {formatSourceLabel(lead.source)}
                    </div>
                    {!lead.confirmedAt ? (
                      <div className="mt-1 text-[11px] font-semibold text-amber-600">
                        Not confirmed
                      </div>
                    ) : null}
                    {lead.phone ? (
                      <div className="text-xs text-slate-500">
                        {(() => {
                          const dial = getDialCode(lead.country);
                          if (!dial) return lead.phone;
                          if (lead.phone.startsWith('+')) return lead.phone;
                          return `${dial} ${lead.phone}`;
                        })()}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div>No subscribers yet.</div>
              )}
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Top Campaigns (Last Activity)
            </h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              {data?.topCampaigns?.length ? (
                data.topCampaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-3 dark:border-slate-700/70 dark:bg-slate-900/80"
                  >
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {campaign.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Sent: {campaign.sentCount} · Clicks: {campaign.totalClicks} · Unique Clickers: {campaign.uniqueClickers}
                      · Opens: {campaign.totalOpens} · Unique Opens: {campaign.uniqueOpens}
                    </div>
                  </div>
                ))
              ) : (
                <div>No campaign performance data yet.</div>
              )}
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Top Affiliate Links (Last 7 days)
            </h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              {data?.topLinksLast7Days?.length ? (
                data.topLinksLast7Days.map((link) => (
                  <div
                    key={link.url}
                    className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-3 dark:border-slate-700/70 dark:bg-slate-900/80"
                  >
                    <div className="break-all text-xs text-slate-500">{link.url}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Clicks: {link.clicks}
                    </div>
                  </div>
                ))
              ) : (
                <div>No affiliate clicks yet.</div>
              )}
            </div>
            {data?.topLinksAllTime?.length ? (
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Top Links (All time)
                </h3>
                <div className="mt-3 space-y-2 text-xs text-slate-500">
                  {data.topLinksAllTime.slice(0, 5).map((link) => (
                    <div key={link.url} className="flex items-start justify-between gap-3">
                      <span className="flex-1 break-all">{link.url}</span>
                      <span className="shrink-0 font-semibold">{link.clicks}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Top Automations (Last Activity)
            </h2>
            {automationsSummary ? (
              <span className="text-xs text-slate-500">
                Total: {automationsSummary.total} ·{' '}
                {Object.entries(automationsSummary.byStatus || {})
                  .map(([status, count]) => `${status}: ${count}`)
                  .join(', ')}
              </span>
            ) : null}
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
            {data?.topAutomations?.length ? (
              data.topAutomations.map((automation) => (
                <div
                  key={automation.id}
                  className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-3 dark:border-slate-700/70 dark:bg-slate-900/80"
                >
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {automation.name}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Sent: {automation.sentCount} · Clicks: {automation.totalClicks} · Unique Clickers: {automation.uniqueClickers}
                    · Opens: {automation.totalOpens} · Unique Opens: {automation.uniqueOpens}
                  </div>
                </div>
              ))
            ) : (
              <div>No automation performance data yet.</div>
            )}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
