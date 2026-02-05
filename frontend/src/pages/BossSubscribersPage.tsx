import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, AdminSubscriberListResponse } from '../services/adminApi';

export default function BossSubscribersPage() {
  const [data, setData] = useState<AdminSubscriberListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [unsubscribed, setUnsubscribed] = useState('all');
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);

  const filters = useMemo(() => ({
    query: query.trim(),
    source: source.trim(),
    unsubscribed: unsubscribed === 'all' ? '' : unsubscribed
  }), [query, source, unsubscribed]);

  const loadSubscribers = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await adminApi.getSubscribers({
        limit,
        offset,
        query: filters.query || undefined,
        source: filters.source || undefined,
        unsubscribed: filters.unsubscribed || undefined
      });
      setData(res);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load subscribers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscribers();
  }, [limit, offset, filters.query, filters.source, filters.unsubscribed]);

  const total = data?.total ?? 0;
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const canPrev = offset > 0;
  const canNext = offset + limit < total;

  const handleSearch = () => {
    setOffset(0);
    void loadSubscribers();
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Subscribers</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              View and manage subscriber records (boss-only).
            </p>
          </div>
          <Button>Import</Button>
        </div>
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-slate-600 dark:text-slate-300">
            <span>Latest signups</span>
            <Button size="sm" variant="outline" disabled>
              Export CSV
            </Button>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
            <div className="grid gap-3 md:grid-cols-[1fr_200px_160px_auto]">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search email or name"
                className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
              />
              <input
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="Source"
                className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
              />
              <select
                value={unsubscribed}
                onChange={(event) => setUnsubscribed(event.target.value)}
                className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
              >
                <option value="all">All statuses</option>
                <option value="false">Subscribed</option>
                <option value="true">Unsubscribed</option>
              </select>
              <Button size="sm" onClick={handleSearch} disabled={loading}>
                Search
              </Button>
            </div>

            {loading ? (
              <div className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 dark:border-slate-700/70 dark:bg-slate-900/80">
                Loading subscribers...
              </div>
            ) : errorMessage ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-200">
                {errorMessage}
              </div>
            ) : data?.items?.length ? (
              data.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 dark:border-slate-700/70 dark:bg-slate-900/80"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {item.email}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {item.name || 'Unnamed'} · {item.source || 'Unknown'} · {item.country || 'Unknown'}
                      </div>
                    </div>
                    <span className={`text-xs font-semibold ${item.isUnsubscribed ? 'text-red-600' : 'text-emerald-600'}`}>
                      {item.isUnsubscribed ? 'Unsubscribed' : 'Subscribed'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 dark:border-slate-700/70 dark:bg-slate-900/80">
                No subscribers found.
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Showing {data?.items?.length ?? 0} of {total} subscribers
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={!canPrev || loading} onClick={() => setOffset(Math.max(offset - limit, 0))}>
                Prev
              </Button>
              <span>
                Page {currentPage} of {totalPages}
              </span>
              <Button size="sm" variant="outline" disabled={!canNext || loading} onClick={() => setOffset(offset + limit)}>
                Next
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
