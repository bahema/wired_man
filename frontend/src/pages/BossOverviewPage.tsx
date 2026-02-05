import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, AdminAnalytics } from '../services/adminApi';

const buildSparkline = (series: number[], width = 260, height = 90) => {
  const safe = series.length ? series : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...safe, 1);
  const min = Math.min(...safe, 0);
  const range = Math.max(1, max - min);
  const padding = 6;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const points = safe.map((value, index) => {
    const x = padding + (index / (safe.length - 1 || 1)) * chartWidth;
    const y = padding + chartHeight - ((value - min) / range) * chartHeight;
    return `${x},${y}`;
  });
  return points.join(' ');
};

const formatSourceLabel = (label?: string | null) => {
  if (!label || label === 'Unknown') return 'Unknown';
  return label.replace(/^\/+/, '').replaceAll('-', ' ');
};

export default function BossOverviewPage() {
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const payload = await adminApi.getAnalytics();
        if (active) {
          setData(payload);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load analytics.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const totals = data?.totals;
  const last7Days = data?.last7Days;
  const topSource = data?.sources?.[0] || null;
  const topLink = data?.topLinksLast7Days?.[0] || null;
  const deliverability = data?.deliverability;
  const trends = data?.trends;
  const topCampaigns = data?.topCampaigns ?? [];
  const topAutomations = data?.topAutomations ?? [];
  const sparklineSubs = useMemo(
    () => buildSparkline(trends?.subscribersByDay ?? []),
    [trends?.subscribersByDay]
  );
  const sparklineClicks = useMemo(
    () => buildSparkline(trends?.clicksByDay ?? []),
    [trends?.clicksByDay]
  );
  const recentClickRate = useMemo(() => {
    if (!last7Days?.subscribers) return 0;
    return (last7Days?.clicks || 0) / last7Days.subscribers;
  }, [last7Days]);

  const campaignsSummary = data?.campaignsSummary;
  const automationsSummary = data?.automationsSummary;
  const clickRate = data?.campaignClickStats?.clickRate ?? 0;
  const uniqueClickers = data?.campaignClickStats?.uniqueClickers ?? 0;
  const uniqueOpeners = totals?.uniqueOpenersTotal ?? 0;

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Command Center
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Track email performance and audience momentum in one view.
            </p>
          </div>
          <Link to="/boss/campaigns/new">
            <Button>Create Campaign</Button>
          </Link>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}

        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-900/70 dark:to-slate-950" />
          <svg
            className="absolute left-0 top-0 h-full w-full opacity-40"
            viewBox="0 0 1200 260"
            preserveAspectRatio="none"
          >
            <path
              d="M0,120 C180,60 320,200 520,150 C720,90 880,210 1200,120 L1200,260 L0,260 Z"
              fill="rgba(59,130,246,0.15)"
            />
            <path
              d="M0,160 C160,110 360,240 560,190 C760,140 960,230 1200,160"
              fill="none"
              stroke="rgba(37,99,235,0.4)"
              strokeWidth="3"
            />
          </svg>
          <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Command Center
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  Live Growth Pulse
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  A single wave summary of subscribers, clicks, opens, and deliverability.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                {[
                  { label: 'Subscribers', value: totals?.subscribers ?? 0 },
                  { label: 'New (7d)', value: last7Days?.subscribers ?? 0 },
                  { label: 'Clicks (7d)', value: last7Days?.clicks ?? 0 },
                  { label: 'Opens (7d)', value: last7Days?.opens ?? 0 },
                  { label: 'Click Rate', value: `${clickRate}%` },
                  { label: 'Unsubs (7d)', value: data?.unsubscribes?.last7Days ?? 0 },
                  { label: 'Delivery Rate', value: `${deliverability?.deliveryRate ?? 0}%` },
                  { label: 'Failure Rate', value: `${deliverability?.failureRate ?? 0}%` }
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/50 bg-white/80 px-4 py-3 text-sm shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {item.label}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {loading ? '...' : item.value.toLocaleString?.() ?? item.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2 md:gap-4">
                <div className="rounded-2xl border border-white/50 bg-white/80 px-4 py-3 text-sm shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Top Source
                  </p>
                  <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {loading ? '...' : formatSourceLabel(topSource?.label)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {topSource ? `${topSource.count.toLocaleString()} signups` : 'No data yet'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/50 bg-white/80 px-4 py-3 text-sm shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Top Offer (7d)
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {loading ? '...' : topLink?.url || 'No top offer yet'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {topLink ? `${topLink.clicks} clicks` : 'Waiting for clicks'}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/50 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Growth Radar
                  </p>
                  <span className="text-xs text-slate-400">Last 7 days</span>
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-600">Subscribers</p>
                    <svg viewBox="0 0 260 90" className="mt-2 h-20 w-full">
                      <polyline
                        points={sparklineSubs}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600">Clicks</p>
                    <svg viewBox="0 0 260 90" className="mt-2 h-20 w-full">
                      <polyline
                        points={sparklineClicks}
                        fill="none"
                        stroke="#0ea5e9"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/50 bg-white/80 p-4 text-sm shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Audience & Engagement
                </p>
                <div className="mt-3 grid gap-2 text-xs text-slate-600">
                  <div>Total Subscribers: {loading ? '...' : (totals?.subscribers ?? 0).toLocaleString()}</div>
                  <div>Unique Openers: {loading ? '...' : uniqueOpeners.toLocaleString()}</div>
                  <div>Unique Clickers: {loading ? '...' : uniqueClickers.toLocaleString()}</div>
                  <div>Engagement: {last7Days?.subscribers ? `${Math.round(recentClickRate * 1000) / 10}%` : 'No data'}</div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recent Campaign Activity</h2>
              <Link to="/boss/campaigns">
                <Button size="sm" variant="outline">View All</Button>
              </Link>
            </div>
            <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
              {topCampaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="rounded-xl border border-border-subtle bg-panel-elevated p-3 dark:border-slate-700/70 dark:bg-slate-900/80"
                >
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{campaign.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Sent: {campaign.sentCount} · Clicks: {campaign.totalClicks} · Opens: {campaign.totalOpens}
                  </div>
                </div>
              ))}
              {!loading && topCampaigns.length === 0 ? (
                <div>No campaign activity yet.</div>
              ) : null}
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Automation Snapshot</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {automationsSummary
                ? `Total ${automationsSummary.total} · ${Object.entries(automationsSummary.byStatus || {})
                  .map(([status, count]) => `${status}: ${count}`)
                  .join(', ')}`
                : 'No automation data yet.'}
            </p>
            <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
              {topAutomations.map((automation) => (
                <div
                  key={automation.id}
                  className="rounded-xl border border-border-subtle bg-panel-elevated p-3 dark:border-slate-700/70 dark:bg-slate-900/80"
                >
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{automation.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Sent: {automation.sentCount} · Clicks: {automation.totalClicks} · Opens: {automation.totalOpens}
                  </div>
                </div>
              ))}
              {!loading && topAutomations.length === 0 ? (
                <div>No automation activity yet.</div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
