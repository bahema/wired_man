import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, AdminAudienceSummary } from '../services/adminApi';
import { buildApiUrl } from '../data/mediaLibrary';

export default function BossAudiencesPage() {
  const [summary, setSummary] = useState<AdminAudienceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadSummary = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setErrorMessage('');
    }
    try {
      const data = await adminApi.getAudiencesSummary();
      setSummary(data);
    } catch (error) {
      if (!silent) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load audiences.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const source = new EventSource(buildApiUrl('/api/public/stream'));
    const refreshTypes = ['subscriber', 'unsubscribe', 'open', 'click'];

    const handleFocus = () => {
      void loadSummary(true);
    };
    const interval = window.setInterval(() => {
      if (!document.hidden) {
        void loadSummary(true);
      }
    }, 20000);

    const handleStream = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { changed?: string[] };
        const changed = payload.changed || [];
        if (changed.some((item) => refreshTypes.includes(item))) {
          void loadSummary(true);
        }
      } catch {
        // ignore malformed events
      }
    };
    source.addEventListener('content', handleStream);
    window.addEventListener('focus', handleFocus);

    return () => {
      source.removeEventListener('content', handleStream);
      source.close();
      window.removeEventListener('focus', handleFocus);
      window.clearInterval(interval);
    };
  }, [loadSummary]);

  const segments = useMemo(() => {
    if (!summary) return [];
    const continentSegments = summary.continents.slice(0, 6).map((item) => ({
      name: `${item.name} Subscribers`,
      type: 'Continent',
      count: item.count,
      filter: { continents: [item.name] }
    }));
    const topicSegments = summary.topics.slice(0, 6).map((item) => ({
      name: item.name,
      type: 'Topic',
      count: item.count,
      filter: { topics: [item.name] }
    }));
    return [...continentSegments, ...topicSegments].slice(0, 9);
  }, [summary]);

  const buildCampaignLink = (filter: { continents?: string[]; topics?: string[]; tags?: string[] }) => {
    const params = new URLSearchParams();
    if (filter.continents?.length) params.set('continent', filter.continents.join(','));
    if (filter.topics?.length) params.set('topic', filter.topics.join(','));
    if (filter.tags?.length) params.set('tag', filter.tags.join(','));
    const qs = params.toString();
    return `/boss/campaigns/new${qs ? `?${qs}` : ''}`;
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Audiences</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Segment your subscribers based on interests and engagement.
            </p>
          </div>
          <Link to="/boss/segments">
            <Button>Create Segment</Button>
          </Link>
        </div>

        {errorMessage ? (
          <Card className="p-3 text-sm text-red-600">{errorMessage}</Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total Subscribers', value: summary?.totals?.subscribers ?? 0 },
            { label: 'Active Subscribers', value: summary?.totals?.active ?? 0 },
            { label: 'New (7 days)', value: summary?.totals?.newLast7Days ?? 0 },
            { label: 'Engaged (7 days)', value: summary?.engagement?.engaged7d ?? 0 }
          ].map((item) => (
            <Card key={item.label} className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {item.label}
              </p>
              <p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {loading ? '...' : item.value.toLocaleString()}
              </p>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              By Continent
            </h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              {summary?.continents?.length ? (
                summary.continents.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-xl border border-border-subtle bg-panel-elevated px-3 py-3"
                  >
                    <span className="font-medium text-slate-900 dark:text-slate-100">{item.name}</span>
                    <span className="text-sm text-slate-500">{item.count.toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <div>{loading ? 'Loading...' : 'No subscribers yet.'}</div>
              )}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Engagement Snapshot
            </h2>
            <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              {[
                { label: 'Opens (7 days)', value: summary?.engagement?.opens7d ?? 0 },
                { label: 'Clicks (7 days)', value: summary?.engagement?.clicks7d ?? 0 },
                { label: 'Inactive (30 days)', value: summary?.engagement?.inactive30d ?? 0 },
                { label: 'Unsubscribed', value: summary?.totals?.unsubscribed ?? 0 }
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-xl border border-border-subtle bg-panel-elevated px-3 py-3"
                >
                  <span>{item.label}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {loading ? '...' : item.value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Top Topics
            </h2>
            <span className="text-xs text-slate-500">Based on subscriber interests</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary?.topics?.length ? (
              summary.topics.map((topic) => (
                <div
                  key={topic.name}
                  className="flex items-center justify-between rounded-xl border border-border-subtle bg-panel-elevated px-3 py-3 text-sm text-slate-600"
                >
                  <span className="font-medium text-slate-900 dark:text-slate-100">{topic.name}</span>
                  <span>{topic.count.toLocaleString()}</span>
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">
                {loading ? 'Loading...' : 'No topics recorded yet.'}
              </div>
            )}
          </div>
        </Card>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {segments.map((segment) => (
            <Card key={`${segment.type}-${segment.name}`} className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {segment.type} Segment
              </p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {segment.name}
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {segment.count.toLocaleString()} subscribers
              </p>
              <div className="mt-4 flex gap-2">
                <Link to={buildCampaignLink(segment.filter)}>
                  <Button size="sm" variant="secondary">Create Campaign</Button>
                </Link>
                <Link to="/boss/segments">
                  <Button size="sm" variant="outline">View Segments</Button>
                </Link>
              </div>
            </Card>
          ))}
          {!segments.length ? (
            <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
              {loading ? 'Loading audiences...' : 'No audience data yet.'}
            </Card>
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}

