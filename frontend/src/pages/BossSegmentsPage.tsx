import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, AdminExportFormat, AdminExportJob, AdminExportJobWithParams, AdminSavedSegment, AdminSegmentsSummary } from '../services/adminApi';
import { resolveMediaUrl } from '../data/mediaLibrary';

const ENGAGEMENT_OPTIONS = ['all', 'engaged', 'inactive'] as const;

export default function BossSegmentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [summary, setSummary] = useState<AdminSegmentsSummary | null>(null);
  const [savedSegments, setSavedSegments] = useState<AdminSavedSegment[]>([]);
  const [exportJobs, setExportJobs] = useState<Record<string, AdminExportJob>>({});
  const [exportHistory, setExportHistory] = useState<AdminExportJobWithParams[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [editingSavedId, setEditingSavedId] = useState<string | null>(null);
  const [editingSavedName, setEditingSavedName] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<AdminExportFormat>('csv');
  const [exportScope, setExportScope] = useState<'single' | 'bulk'>('single');
  const [exportTarget, setExportTarget] = useState<{ continent: string; source: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [liveEnabled, setLiveEnabled] = useState(() => {
    const stored = localStorage.getItem('boss-segments-live');
    return stored ? stored === 'true' : true;
  });
  const [continentFilter, setContinentFilter] = useState(
    () => searchParams.get('continent') || 'All continents'
  );
  const [sourceFilter, setSourceFilter] = useState(
    () => searchParams.get('source') || 'All sources'
  );
  const [engagementFilter, setEngagementFilter] = useState<(typeof ENGAGEMENT_OPTIONS)[number]>(
    () => (searchParams.get('engagement') as (typeof ENGAGEMENT_OPTIONS)[number]) || 'all'
  );

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await adminApi.getSegmentsSummary();
      setSummary(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load segments.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSavedSegments = useCallback(async () => {
    try {
      const items = await adminApi.getSavedSegments();
      setSavedSegments(items);
    } catch {
      // Ignore saved segments fetch errors.
    }
  }, []);

  const loadExportHistory = useCallback(async () => {
    try {
      const items = await adminApi.getSegmentExportHistory(80);
      setExportHistory(items);
    } catch {
      // Ignore export history errors.
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    void loadSavedSegments();
    void loadExportHistory();
  }, [loadSummary, loadSavedSegments, loadExportHistory]);

  useEffect(() => {
    const hasPending = exportHistory.some(
      (job) => job.status === 'queued' || job.status === 'processing'
    );
    const intervalMs = hasPending ? 5000 : 30000;
    const timer = window.setInterval(() => {
      void loadExportHistory();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [exportHistory, loadExportHistory]);

  useEffect(() => {
    localStorage.setItem('boss-segments-live', String(liveEnabled));
  }, [liveEnabled]);

  useEffect(() => {
    if (!liveEnabled) return undefined;
    const params = new URLSearchParams();
    const sessionToken =
      sessionStorage.getItem('boss-admin-session') || localStorage.getItem('boss-admin-session') || '';
    const adminToken =
      (import.meta as { env?: { VITE_ADMIN_TOKEN?: string } }).env?.VITE_ADMIN_TOKEN || '';
    if (sessionToken) params.set('adminSession', sessionToken);
    if (adminToken) params.set('adminToken', adminToken);
    const source = new EventSource(`/api/admin/segments/stream?${params.toString()}`);
    const handler = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as AdminSegmentsSummary;
        setSummary(payload);
      } catch {
        // Ignore malformed SSE payloads.
      }
    };
    source.addEventListener('segments', handler);
    source.onerror = () => {
      source.close();
    };
    return () => {
      source.removeEventListener('segments', handler);
      source.close();
    };
  }, [liveEnabled]);

  useEffect(() => {
    const pending = Object.values(exportJobs).filter(
      (job) => job.status === 'queued' || job.status === 'processing'
    );
    if (!pending.length) return undefined;
    const timer = window.setInterval(async () => {
      await Promise.all(
        pending.map(async (job) => {
          try {
            const next = await adminApi.getSegmentExportStatus(job.id);
            setExportJobs((current) => {
              const entry = Object.entries(current).find(([, value]) => value.id === job.id);
              if (!entry) return current;
              return { ...current, [entry[0]]: next };
            });
          } catch {
            // Ignore polling errors.
          }
        })
      );
    }, 2500);
    return () => window.clearInterval(timer);
  }, [exportJobs]);

  useEffect(() => {
    if (actionMessage) {
      const timer = window.setTimeout(() => setActionMessage(''), 2200);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [actionMessage]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('continent', continentFilter);
    params.set('source', sourceFilter);
    params.set('engagement', engagementFilter);
    setSearchParams(params, { replace: true });
  }, [continentFilter, sourceFilter, engagementFilter, setSearchParams]);

  const continents = useMemo(() => {
    const items = summary?.continents?.map((item) => item.name) || [];
    return ['All continents', ...items];
  }, [summary]);

  const sources = useMemo(() => {
    const items = summary?.sources?.map((item) => item.name) || [];
    return ['All sources', ...items];
  }, [summary]);

  const segments = useMemo(() => {
    if (!summary?.segments?.length) return [];
    return summary.segments.filter((segment) => {
      if (continentFilter !== 'All continents' && segment.continent !== continentFilter) return false;
      if (sourceFilter !== 'All sources' && segment.source !== sourceFilter) return false;
      if (engagementFilter === 'engaged' && segment.engaged30d <= 0) return false;
      if (engagementFilter === 'inactive' && segment.inactive30d <= 0) return false;
      if (searchQuery.trim()) {
        const term = searchQuery.trim().toLowerCase();
        const haystack = `${segment.continent} ${segment.source}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [summary, continentFilter, sourceFilter, engagementFilter, searchQuery]);

  const metrics = useMemo(() => {
    const active = summary?.totals?.active ?? 0;
    const totalSegments = summary?.segments?.length ?? 0;
    const engaged = summary?.segments?.reduce((acc, segment) => acc + (segment.engaged30d || 0), 0) ?? 0;
    const inactive = summary?.segments?.reduce((acc, segment) => acc + (segment.inactive30d || 0), 0) ?? 0;
    const generatedAt = summary?.generatedAt ?? '';
    return { active, totalSegments, engaged, inactive, generatedAt };
  }, [summary]);

  const saveCurrentSegment = async () => {
    const name = window.prompt('Name this segment');
    if (!name) return;
    try {
      await adminApi.createSavedSegment({
        name,
        continent: continentFilter,
        source: sourceFilter,
        engagement: engagementFilter
      });
      await loadSavedSegments();
      setActionMessage('Segment saved.');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Failed to save segment.');
    }
  };

  const renameSavedSegment = async (segment: AdminSavedSegment) => {
    setEditingSavedId(segment.id);
    setEditingSavedName(segment.name);
  };

  const deleteSavedSegment = async (segment: AdminSavedSegment) => {
    const ok = window.confirm(`Delete "${segment.name}"?`);
    if (!ok) return;
    try {
      await adminApi.deleteSavedSegment(segment.id);
      await loadSavedSegments();
      setActionMessage('Segment deleted.');
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Failed to delete segment.');
    }
  };

  const applySavedSegment = (segment: AdminSavedSegment) => {
    setContinentFilter(segment.continent);
    setSourceFilter(segment.source);
    setEngagementFilter(segment.engagement);
    setActionMessage('Segment loaded.');
  };

  const copyShareLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('continent', continentFilter);
      url.searchParams.set('source', sourceFilter);
      url.searchParams.set('engagement', engagementFilter);
      await navigator.clipboard.writeText(url.toString());
      setActionMessage('Link copied.');
    } catch {
      setActionMessage('Unable to copy link.');
    }
  };

  const buildExportKey = (segment: { continent: string; source: string }, engagement: string, format: string) =>
    `${segment.continent}||${segment.source}||${engagement}||${format}`;

  const startExport = async (segment: { continent: string; source: string }, format: AdminExportFormat) => {
    try {
      const response = await adminApi.createSegmentExport({
        continent: segment.continent,
        source: segment.source,
        engagement: engagementFilter,
        format
      });
      const key = buildExportKey(segment, engagementFilter, format);
      setActionMessage('Export started.');
      setExportJobs((current) => ({
        ...current,
        [key]: {
          id: response.id,
          status: 'queued',
          fileUrl: null,
          error: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          completedAt: null
        }
      }));
      await loadExportHistory();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Failed to start export.');
    }
  };

  const exportJobForSegment = (segment: { continent: string; source: string }) => {
    const key = buildExportKey(segment, engagementFilter, exportFormat);
    return exportJobs[key];
  };

  const exportHistoryForSegment = (segment: { continent: string; source: string }) =>
    exportHistory.filter((job) => {
      const params = job.params || {};
      return params.continent === segment.continent && params.source === segment.source;
    }).slice(0, 2);

  const openExportDialog = (scope: 'single' | 'bulk', segment?: { continent: string; source: string }) => {
    setExportScope(scope);
    setExportTarget(segment ?? null);
    setExportFormat('csv');
    setExportDialogOpen(true);
  };

  const runExport = async () => {
    if (exportScope === 'bulk') {
      if (!segments.length) {
        setActionMessage('No segments to export.');
        setExportDialogOpen(false);
        return;
      }
      for (const segment of segments) {
        // eslint-disable-next-line no-await-in-loop
        await startExport(segment, exportFormat);
      }
      setExportDialogOpen(false);
      return;
    }
    if (!exportTarget) return;
    await startExport(exportTarget, exportFormat);
    setExportDialogOpen(false);
  };

  const buildFilteredCampaignLink = () => {
    const params = new URLSearchParams();
    if (continentFilter !== 'All continents') {
      params.set('continent', continentFilter);
    }
    if (sourceFilter !== 'All sources') {
      params.set('source', sourceFilter);
    }
    const qs = params.toString();
    return `/boss/campaigns/new${qs ? `?${qs}` : ''}`;
  };

  const buildCampaignLink = (segment: { continent: string; source: string }) => {
    const params = new URLSearchParams();
    if (segment.continent && segment.continent !== 'Unknown') {
      params.set('continent', segment.continent);
    }
    if (segment.source && segment.source !== 'Unknown') {
      params.set('source', segment.source);
    }
    const qs = params.toString();
    return `/boss/campaigns/new${qs ? `?${qs}` : ''}`;
  };

  const buildSegmentDetailLink = (segment: { continent: string; source: string }) => {
    const params = new URLSearchParams();
    params.set('continent', segment.continent);
    params.set('source', segment.source);
    return `/boss/segments/detail?${params.toString()}`;
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <section className="relative overflow-hidden rounded-3xl border border-border-subtle bg-eye-comfort p-6 sm:p-8">
          <div className="pointer-events-none absolute -top-28 right-[-10%] h-64 w-64 rounded-full bg-gradient-to-br from-sky-300/25 via-blue-400/20 to-transparent blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-[-10%] h-64 w-64 rounded-full bg-gradient-to-br from-indigo-300/20 via-cyan-200/20 to-transparent blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Segments
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
                Segmented Clients
              </h1>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Organize subscribers by continent, source, and engagement signals.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 text-xs">
                {[
                  { label: 'Active', value: metrics.active },
                  { label: 'Segments', value: metrics.totalSegments },
                  { label: 'Engaged 30d', value: metrics.engaged },
                  { label: 'Inactive 30d', value: metrics.inactive }
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-full border border-white/60 bg-white/70 px-4 py-2 font-semibold text-slate-700 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100"
                  >
                    {item.label}: {item.value.toLocaleString()}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {metrics.generatedAt ? (
                <span className="text-xs font-medium text-slate-500">
                  Updated {new Date(metrics.generatedAt).toLocaleString()}
                </span>
              ) : null}
              {actionMessage ? (
                <span className="text-xs font-semibold text-emerald-600">{actionMessage}</span>
              ) : null}
              <Button
                variant="outline"
                onClick={() => setLiveEnabled((current) => !current)}
              >
                Live: {liveEnabled ? 'On' : 'Off'}
              </Button>
              <Button variant="outline" onClick={() => openExportDialog('bulk')}>
                Export filtered
              </Button>
              <Link to={buildFilteredCampaignLink()}>
                <Button variant="outline">Create campaign</Button>
              </Link>
              <Button variant="outline" onClick={copyShareLink}>
                Copy link
              </Button>
              <Button variant="outline" onClick={saveCurrentSegment}>
                Save segment
              </Button>
              <Button variant="outline" disabled={loading} onClick={loadSummary}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Link to="/boss/campaigns/new">
                <Button>Create Campaign</Button>
              </Link>
            </div>
          </div>
        </section>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Saved segments
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Reuse and share common filters with your team.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {savedSegments.length ? savedSegments.map((segment) => (
              <div
                key={segment.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-300"
              >
                <div>
                  {editingSavedId === segment.id ? (
                    <input
                      value={editingSavedName}
                      onChange={(event) => setEditingSavedName(event.target.value)}
                      className="w-full rounded-lg border border-border-subtle bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100"
                    />
                  ) : (
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{segment.name}</p>
                  )}
                  <p className="text-xs text-slate-500">
                    {segment.continent} · {segment.source} · {segment.engagement}
                  </p>
                </div>
                <div className="flex gap-2">
                  {editingSavedId === segment.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const trimmed = editingSavedName.trim();
                          if (!trimmed) {
                            setActionMessage('Name is required.');
                            return;
                          }
                          try {
                            await adminApi.updateSavedSegment(segment.id, { name: trimmed });
                            setEditingSavedId(null);
                            setEditingSavedName('');
                            await loadSavedSegments();
                            setActionMessage('Segment renamed.');
                          } catch (error) {
                            setActionMessage(error instanceof Error ? error.message : 'Failed to rename segment.');
                          }
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingSavedId(null);
                          setEditingSavedName('');
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => applySavedSegment(segment)}>
                        Load
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => renameSavedSegment(segment)}>
                        Rename
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => deleteSavedSegment(segment)}>
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-border-subtle px-4 py-4 text-sm text-slate-500">
                No saved segments yet.
              </div>
            )}
          </div>
        </Card>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}

        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Filters</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
              <span className="font-medium text-slate-700">Continent</span>
              <select
                value={continentFilter}
                onChange={(event) => setContinentFilter(event.target.value)}
                className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:ring-sky-500/30"
              >
                {continents.map((continent) => (
                  <option key={continent} value={continent}>{continent}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
              <span className="font-medium text-slate-700">Content source</span>
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
                className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:ring-sky-500/30"
              >
                {sources.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
              <span className="font-medium text-slate-700">Engagement (30 days)</span>
              <select
                value={engagementFilter}
                onChange={(event) => setEngagementFilter(event.target.value as typeof engagementFilter)}
                className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:ring-sky-500/30"
              >
                <option value="all">All</option>
                <option value="engaged">Engaged</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {ENGAGEMENT_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setEngagementFilter(option)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  engagementFilter === option
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-border-subtle bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {option === 'all' ? 'All' : option === 'engaged' ? 'Engaged' : 'Inactive'}
              </button>
            ))}
            <div className="ml-auto w-full sm:w-64">
              <input
                type="search"
                placeholder="Search continent or source..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-2 text-sm text-slate-900 shadow-sm transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100 dark:focus:ring-sky-500/30"
              />
            </div>
          </div>
        </Card>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {segments.map((segment) => (
            <Card key={`${segment.continent}-${segment.source}`} className="p-5">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-sky-400/70 via-blue-500/70 to-indigo-500/70" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Segment
              </p>
              <h2 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {segment.continent} · {segment.source}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
                  Engagement {segment.total ? Math.round((segment.engaged30d / segment.total) * 100) : 0}%
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Source</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{segment.source}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Subscribers</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {segment.total.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Engaged (30d)</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {segment.engaged30d.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Inactive (30d)</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {segment.inactive30d.toLocaleString()}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>Last updated</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {segment.lastUpdated ? new Date(segment.lastUpdated).toLocaleDateString() : '—'}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={buildCampaignLink(segment)}>
                  <Button size="sm" variant="outline">Send</Button>
                </Link>
                <Link to={buildSegmentDetailLink(segment)}>
                  <Button size="sm">Details</Button>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openExportDialog('single', segment)}
                >
                  Download
                </Button>
              </div>
              {(() => {
                const job = exportJobForSegment(segment);
                if (!job) return null;
                if (job.status === 'completed' && job.fileUrl) {
                  return (
                    <div className="mt-3 text-xs text-slate-500">
                      Export ready: <a className="font-semibold text-slate-700 underline" href={resolveMediaUrl(job.fileUrl)}>Download</a>
                    </div>
                  );
                }
                if (job.status === 'failed') {
                  return <div className="mt-3 text-xs text-red-600">Export failed.</div>;
                }
                return <div className="mt-3 text-xs text-slate-500">Export {job.status}...</div>;
              })()}
              {(() => {
                const history = exportHistoryForSegment(segment);
                if (!history.length) return null;
                return (
                  <div className="mt-3 text-xs text-slate-500">
                    <p className="font-semibold text-slate-700">Recent exports</p>
                    {history.map((item) => {
                      const params = item.params || {};
                      const engagement = params.engagement ? String(params.engagement) : 'all';
                      const format = params.format ? String(params.format) : 'csv';
                      return (
                      <div key={item.id} className="flex items-center justify-between">
                        <span>
                          {new Date(item.createdAt).toLocaleDateString()} · {engagement} · {format}
                        </span>
                        {item.fileUrl ? (
                          <a className="font-semibold text-slate-700 underline" href={resolveMediaUrl(item.fileUrl)}>
                            Download
                          </a>
                        ) : (
                          <span className="text-slate-400">{item.status}</span>
                        )}
                      </div>
                    );
                    })}
                  </div>
                );
              })()}
            </Card>
          ))}
          {!segments.length ? (
            <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
              {loading ? 'Loading segments...' : 'No segments match your filters.'}
            </Card>
          ) : null}
        </div>
      </div>
      <AdminModal
        title="Download segment"
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onSave={runExport}
      >
        <p className="text-sm text-slate-600">
          Choose a file format to export. You can open CSV in Excel, or use the native format below.
        </p>
        <div className="grid gap-2 text-sm text-slate-600">
          {(['csv', 'xlsx', 'pdf', 'docx'] as AdminExportFormat[]).map((format) => (
            <label key={format} className="flex items-center gap-3">
              <input
                type="radio"
                name="export-format"
                value={format}
                checked={exportFormat === format}
                onChange={() => setExportFormat(format)}
              />
              <span className="font-semibold uppercase">{format}</span>
            </label>
          ))}
        </div>
      </AdminModal>
    </AdminShell>
  );
}
