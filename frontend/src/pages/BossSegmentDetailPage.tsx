import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, AdminActivity, AdminSegmentDetail } from '../services/adminApi';

const PAGE_LIMIT = 25;

export default function BossSegmentDetailPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<AdminSegmentDetail | null>(null);
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [activityFilter, setActivityFilter] = useState<'segments' | 'all'>('segments');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const continent = searchParams.get('continent') ?? '';
  const source = searchParams.get('source') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!continent || !source) {
        setErrorMessage('Missing segment parameters.');
        return;
      }
      setLoading(true);
      setErrorMessage('');
      try {
        const [response, activityLog] = await Promise.all([
          adminApi.getSegmentDetail({
            continent,
            source,
            page,
            limit: PAGE_LIMIT
          }),
          adminApi.getAdminActivity({
            limit: 15,
            actionPrefix: activityFilter === 'segments' ? 'segments' : undefined
          })
        ]);
        if (active) {
          setData(response);
          setActivity(activityLog);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load segment.');
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
  }, [continent, source, page, activityFilter]);

  const summary = useMemo(() => {
    if (!data?.segment) {
      return {
        total: 0,
        engaged30d: 0,
        inactive30d: 0,
        lastUpdated: ''
      };
    }
    return data.segment;
  }, [data]);

  const setPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(nextPage));
    setSearchParams(params);
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Segments</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {continent || 'Segment'} · {source || 'Source'}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Subscribers inside this segment with engagement status over the last 30 days.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/boss/segments">
              <Button variant="outline">Back to Segments</Button>
            </Link>
            <Link to={`/boss/campaigns/new?continent=${encodeURIComponent(continent)}&source=${encodeURIComponent(source)}`}>
              <Button>Create Campaign</Button>
            </Link>
          </div>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}

        <Card className="p-5 sm:p-6">
          <div className="grid gap-3 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-4">
            <div className="rounded-2xl border border-border-subtle bg-panel-elevated p-4 text-center dark:border-slate-700/70 dark:bg-slate-900/80">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {summary.total.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-panel-elevated p-4 text-center dark:border-slate-700/70 dark:bg-slate-900/80">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Engaged 30d</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {summary.engaged30d.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-panel-elevated p-4 text-center dark:border-slate-700/70 dark:bg-slate-900/80">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Inactive 30d</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {summary.inactive30d.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-panel-elevated p-4 text-center dark:border-slate-700/70 dark:bg-slate-900/80">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Last updated</p>
              <p className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                {summary.lastUpdated ? new Date(summary.lastUpdated).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
            <span>Subscribers</span>
            <span>{data ? `${data.total.toLocaleString()} total` : '—'}</span>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
            {data?.leads?.length ? data.leads.map((lead) => (
              <div
                key={lead.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 dark:border-slate-700/70 dark:bg-slate-900/80"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {lead.name || lead.email}
                  </p>
                  <p className="text-xs text-slate-500">
                    {lead.email}{lead.country ? ` · ${lead.country}` : ''}
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  {lead.engaged30d ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-700">
                      Engaged
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600">
                      Inactive
                    </span>
                  )}
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-border-subtle p-4 text-center text-sm text-slate-500">
                {loading ? 'Loading subscribers...' : 'No subscribers found for this segment.'}
              </div>
            )}
          </div>
          <div className="mt-5 flex items-center justify-between text-sm text-slate-500">
            <span>Page {data?.page ?? page} of {data?.totalPages ?? 1}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={loading || page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={loading || (data?.totalPages ? page >= data.totalPages : true)}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
            <span>Recent activity</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={activityFilter === 'segments' ? 'outline' : 'ghost'}
                onClick={() => setActivityFilter('segments')}
              >
                Segments only
              </Button>
              <Button
                size="sm"
                variant={activityFilter === 'all' ? 'outline' : 'ghost'}
                onClick={() => setActivityFilter('all')}
              >
                All activity
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
            {activity.length ? activity.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 dark:border-slate-700/70 dark:bg-slate-900/80"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{item.action}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  {item.meta?.continent ? `${item.meta.continent} · ${item.meta.source}` : ''}
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-border-subtle p-4 text-center text-sm text-slate-500">
                No recent activity.
              </div>
            )}
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
