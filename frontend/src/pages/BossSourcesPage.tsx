import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, AdminExportFormat, AdminExportJobWithParams, AdminSourceAlias, AdminSourcesSummary } from '../services/adminApi';
import { resolveMediaUrl } from '../data/mediaLibrary';

export default function BossSourcesPage() {
  const [summary, setSummary] = useState<AdminSourcesSummary | null>(null);
  const [exportHistory, setExportHistory] = useState<AdminExportJobWithParams[]>([]);
  const [aliases, setAliases] = useState<AdminSourceAlias[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'total' | 'growth' | 'last7d'>('total');
  const [filterChip, setFilterChip] = useState<'all' | 'high' | 'declining'>('all');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<AdminExportFormat>('csv');
  const [exportTarget, setExportTarget] = useState<string>('');
  const [liveEnabled, setLiveEnabled] = useState(() => {
    const stored = localStorage.getItem('boss-sources-live');
    return stored ? stored === 'true' : true;
  });
  const [aliasDialogOpen, setAliasDialogOpen] = useState(false);
  const [aliasValue, setAliasValue] = useState('');
  const [canonicalValue, setCanonicalValue] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const data = await adminApi.getSourcesSummary();
        if (active) {
          setSummary(data);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load sources.');
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

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const items = await adminApi.getSourceAliases();
        if (active) {
          setAliases(items);
        }
      } catch {
        // Ignore alias fetch errors.
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('boss-sources-live', String(liveEnabled));
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
    const source = new EventSource(`/api/admin/sources/stream?${params.toString()}`);
    const handler = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as AdminSourcesSummary;
        setSummary(payload);
      } catch {
        // Ignore malformed SSE payloads.
      }
    };
    source.addEventListener('sources', handler);
    source.onerror = () => {
      source.close();
    };
    return () => {
      source.removeEventListener('sources', handler);
      source.close();
    };
  }, [liveEnabled]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const items = await adminApi.getSourceExportHistory(80);
        if (active) {
          setExportHistory(items);
        }
      } catch {
        // Ignore export history errors.
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const sources = useMemo(() => {
    if (!summary?.sources?.length) return [];
    return summary.sources.map((source) => {
      const prev = source.prev7d;
      const growth = prev > 0 ? Math.round(((source.last7d - prev) / prev) * 100) : (source.last7d > 0 ? 100 : 0);
      const trend = growth >= 0 ? 'up' : 'down';
      return {
        name: source.name,
        signups: source.total,
        last7d: source.last7d,
        prev7d: source.prev7d,
        growth,
        trend
      };
    }).filter((source) => {
      if (filterChip === 'high') return source.growth >= 10;
      if (filterChip === 'declining') return source.growth < 0;
      return true;
    }).filter((source) => {
      if (!searchQuery.trim()) return true;
      return source.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    }).sort((a, b) => {
      if (sortBy === 'growth') return b.growth - a.growth;
      if (sortBy === 'last7d') return b.last7d - a.last7d;
      return b.signups - a.signups;
    });
  }, [summary, searchQuery, sortBy, filterChip]);

  const totals = useMemo(() => {
    const total = summary?.totals?.signups ?? 0;
    const last7d = summary?.totals?.last7d ?? 0;
    const prev7d = summary?.totals?.prev7d ?? 0;
    const growth = prev7d > 0 ? Math.round(((last7d - prev7d) / prev7d) * 100) : (last7d > 0 ? 100 : 0);
    return { total, last7d, growth };
  }, [summary]);

  const openExportDialog = (sourceName: string) => {
    setExportTarget(sourceName);
    setExportFormat('csv');
    setExportDialogOpen(true);
  };

  const openAliasDialog = () => {
    setAliasValue('');
    setCanonicalValue('');
    setAliasDialogOpen(true);
  };

  const createAlias = async () => {
    if (!aliasValue.trim() || !canonicalValue.trim()) {
      setErrorMessage('Alias and canonical name are required.');
      return;
    }
    try {
      await adminApi.createSourceAlias({ alias: aliasValue.trim(), canonical: canonicalValue.trim() });
      const items = await adminApi.getSourceAliases();
      setAliases(items);
      setAliasDialogOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create alias.');
    }
  };

  const deleteAlias = async (alias: AdminSourceAlias) => {
    try {
      await adminApi.deleteSourceAlias(alias.id);
      setAliases((current) => current.filter((item) => item.id !== alias.id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete alias.');
    }
  };

  const runExport = async () => {
    if (!exportTarget) return;
    try {
      await adminApi.createSourceExport({ source: exportTarget, format: exportFormat });
      const items = await adminApi.getSourceExportHistory(80);
      setExportHistory(items);
      setExportDialogOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start export.');
    }
  };

  const exportHistoryForSource = (sourceName: string) =>
    exportHistory.filter((job) => {
      const params = job.params || {};
      return params.source === sourceName;
    }).slice(0, 2);

  return (
    <AdminShell>
      <div className="space-y-8">
        <section className="relative overflow-hidden rounded-3xl border border-border-subtle bg-eye-comfort p-6 sm:p-8">
          <div className="pointer-events-none absolute -top-24 right-[-10%] h-56 w-56 rounded-full bg-gradient-to-br from-sky-300/25 via-blue-400/20 to-transparent blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-[-10%] h-56 w-56 rounded-full bg-gradient-to-br from-rose-300/20 via-red-200/20 to-transparent blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Sources
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
                Forms & Sources
              </h1>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Track where subscribers enter your list and spot the fastest-growing channels.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 text-xs">
                {[
                  { label: 'Total signups', value: totals.total.toLocaleString() },
                  { label: 'Top source', value: sources[0]?.name || '—' },
                  { label: 'Weekly growth', value: `${totals.growth >= 0 ? '+' : ''}${totals.growth}%` }
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-full border border-white/60 bg-white/70 px-4 py-2 font-semibold text-slate-700 shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100"
                  >
                    {item.label}: {item.value}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setLiveEnabled((current) => !current)}>
                Live: {liveEnabled ? 'On' : 'Off'}
              </Button>
              <Button variant="outline">Export report</Button>
              <Button>Connect data</Button>
            </div>
          </div>
        </section>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Filters</p>
            <div className="flex flex-wrap gap-2">
              <button
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  filterChip === 'all'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-border-subtle bg-white text-slate-600'
                }`}
                onClick={() => setFilterChip('all')}
              >
                All
              </button>
              <button
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  filterChip === 'high'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-border-subtle bg-white text-slate-600'
                }`}
                onClick={() => setFilterChip('high')}
              >
                High growth
              </button>
              <button
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  filterChip === 'declining'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-border-subtle bg-white text-slate-600'
                }`}
                onClick={() => setFilterChip('declining')}
              >
                Declining
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-300">
              <label className="grid gap-2 text-xs text-slate-500">
                Search sources
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by source name..."
                  className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-300">
              <label className="grid gap-2 text-xs text-slate-500">
                Sort by
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                  className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="total">Total signups</option>
                  <option value="last7d">Last 7 days</option>
                  <option value="growth">Growth %</option>
                </select>
              </label>
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Attribution rules</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Normalize similar source names into a single canonical label.
              </p>
            </div>
            <Button variant="outline" onClick={openAliasDialog}>Add rule</Button>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
            {aliases.length ? aliases.map((alias) => (
              <div
                key={alias.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 dark:border-slate-700/70 dark:bg-slate-900/80"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">{alias.alias}</p>
                  <p className="text-xs text-slate-500">→ {alias.canonical}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => deleteAlias(alias)}>
                  Delete
                </Button>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-border-subtle p-4 text-center text-sm text-slate-500">
                No attribution rules yet.
              </div>
            )}
          </div>
        </Card>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {sources.map((source) => (
            <Card key={source.name} className="p-5">
              <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-gradient-to-r from-sky-400/70 via-blue-500/70 to-rose-400/70" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {source.name}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {source.signups.toLocaleString()} signups
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {source.last7d.toLocaleString()} last 7d · {source.prev7d.toLocaleString()} prev 7d
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    source.trend === 'up'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {source.trend === 'up' ? '+' : ''}{source.growth}%
                </span>
              </div>
              <div className="mt-4 h-2 w-full rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-sky-400 to-blue-500"
                  style={{ width: `${Math.min(100, Math.max(20, source.signups / 8))}%` }}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={`/boss/sources/detail?source=${encodeURIComponent(source.name)}`}>
                  <Button size="sm" variant="outline">View details</Button>
                </Link>
                <Link to={`/boss/campaigns/new?source=${encodeURIComponent(source.name)}`}>
                  <Button size="sm">Create campaign</Button>
                </Link>
                <Button size="sm" variant="outline" onClick={() => openExportDialog(source.name)}>
                  Download
                </Button>
              </div>
              {(() => {
                const history = exportHistoryForSource(source.name);
                if (!history.length) return null;
                return (
                  <div className="mt-3 text-xs text-slate-500">
                    <p className="font-semibold text-slate-700">Recent exports</p>
                    {history.map((item) => {
                      const params = item.params || {};
                      const format = params.format ? String(params.format) : 'csv';
                      return (
                        <div key={item.id} className="flex items-center justify-between">
                          <span>{new Date(item.createdAt).toLocaleDateString()} · {format}</span>
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
          {!sources.length ? (
            <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
              {loading ? 'Loading sources...' : 'No sources available yet.'}
            </Card>
          ) : null}
        </div>
      </div>
      <AdminModal
        title="Download source"
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onSave={runExport}
      >
        <p className="text-sm text-slate-600">
          Choose a file format to export this source.
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
      <AdminModal
        title="Add attribution rule"
        open={aliasDialogOpen}
        onClose={() => setAliasDialogOpen(false)}
        onSave={createAlias}
      >
        <label className="grid gap-2 text-sm text-slate-600">
          Alias (existing source label)
          <input
            value={aliasValue}
            onChange={(event) => setAliasValue(event.target.value)}
            placeholder="e.g. Hero CTA"
            className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <label className="grid gap-2 text-sm text-slate-600">
          Canonical name
          <input
            value={canonicalValue}
            onChange={(event) => setCanonicalValue(event.target.value)}
            placeholder="e.g. Hero Subscribe CTA"
            className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
      </AdminModal>
    </AdminShell>
  );
}

