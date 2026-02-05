import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, AdminSourceAlias, AdminSourcesSummary } from '../services/adminApi';

export default function BossAttributionStudioPage() {
  const [summary, setSummary] = useState<AdminSourcesSummary | null>(null);
  const [aliases, setAliases] = useState<AdminSourceAlias[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [aliasDialogOpen, setAliasDialogOpen] = useState(false);
  const [aliasValue, setAliasValue] = useState('');
  const [canonicalValue, setCanonicalValue] = useState('');
  const [serverSuggestions, setServerSuggestions] = useState<string[]>([]);
  const [quickAddLoading, setQuickAddLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [liveEnabled, setLiveEnabled] = useState(() => {
    const stored = localStorage.getItem('boss-attribution-live');
    return stored ? stored === 'true' : true;
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [summaryData, aliasData] = await Promise.all([
          adminApi.getSourcesSummary(),
          adminApi.getSourceAliases()
        ]);
        if (active) {
          setSummary(summaryData);
          setAliases(aliasData);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load attribution data.');
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
    localStorage.setItem('boss-attribution-live', String(liveEnabled));
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

  const sources = useMemo(() => {
    if (!summary?.sources?.length) return [];
    return summary.sources
      .map((source) => {
        const prev = source.prev7d;
        const growth = prev > 0 ? Math.round(((source.last7d - prev) / prev) * 100) : (source.last7d > 0 ? 100 : 0);
        return {
          name: source.name,
          signups: source.total,
          last7d: source.last7d,
          prev7d: source.prev7d,
          growth
        };
      })
      .filter((source) => {
        if (!searchQuery.trim()) return true;
        return source.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      })
      .sort((a, b) => b.signups - a.signups);
  }, [summary, searchQuery]);

  const sourceOptions = useMemo(() => sources.map((source) => source.name), [sources]);
  const topSources = useMemo(() => sources.slice(0, 3), [sources]);
  const canonicalOptions = useMemo(() => {
    const items = new Set<string>();
    sourceOptions.forEach((name) => items.add(name));
    aliases.forEach((alias) => {
      if (alias.canonical.trim()) {
        items.add(alias.canonical.trim());
      }
    });
    return [...items];
  }, [aliases, sourceOptions]);

  const normalizeToken = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

  const getCanonicalSuggestions = (alias: string, options: string[], aliasMap: AdminSourceAlias[]) => {
    const aliasValue = alias.trim().toLowerCase();
    if (!aliasValue) return [] as string[];
    const direct = aliasMap.find((item) => normalizeToken(item.alias) === normalizeToken(alias));
    const scored = new Map<string, number>();
    if (direct?.canonical) {
      scored.set(direct.canonical, 100);
    }
    options.forEach((option) => {
      const optionValue = option.toLowerCase();
      let score = 0;
      if (optionValue === aliasValue) score += 10;
      if (optionValue.includes(aliasValue) || aliasValue.includes(optionValue)) score += 4;
      const aliasTokens = new Set(aliasValue.split(/\s+/));
      const optionTokens = new Set(optionValue.split(/\s+/));
      let shared = 0;
      aliasTokens.forEach((token) => {
        if (optionTokens.has(token)) shared += 1;
      });
      score += shared;
      const current = scored.get(option) || 0;
      if (score > current) scored.set(option, score);
    });
    return [...scored.entries()]
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([option]) => option)
      .slice(0, 3);
  };

  const totals = useMemo(() => {
    const total = summary?.totals?.signups ?? 0;
    const last7d = summary?.totals?.last7d ?? 0;
    const prev7d = summary?.totals?.prev7d ?? 0;
    const growth = prev7d > 0 ? Math.round(((last7d - prev7d) / prev7d) * 100) : (last7d > 0 ? 100 : 0);
    return { total, last7d, growth };
  }, [summary]);
  const coverage = summary?.unmapped ?? {
    total: 0,
    unknown: 0,
    coveragePct: 100,
    top: [],
    trend7d: { labels: [], counts: [] },
    trend30d: { labels: [], counts: [] }
  };
  const trend7d = coverage.trend7d?.counts || [];
  const trend30d = coverage.trend30d?.counts || [];

  const openAliasDialog = () => {
    setAliasValue('');
    setCanonicalValue('');
    setAliasDialogOpen(true);
  };
  const openAliasDialogFor = (label: string) => {
    setAliasValue(label);
    const suggestion = getCanonicalSuggestions(label, canonicalOptions, aliases)[0] || '';
    setCanonicalValue(suggestion);
    setAliasDialogOpen(true);
  };
  const suggestionOptions = useMemo(
    () => getCanonicalSuggestions(aliasValue, canonicalOptions, aliases),
    [aliasValue, canonicalOptions, aliases]
  );
  const activeSuggestions = serverSuggestions.length ? serverSuggestions : suggestionOptions;
  const aliasWarnings = useMemo(() => {
    const warnings: string[] = [];
    const normalizedAlias = normalizeToken(aliasValue);
    const normalizedCanonical = normalizeToken(canonicalValue);
    if (normalizedCanonical === 'unknown') {
      warnings.push('Avoid using "Unknown" as a canonical name.');
    }
    const existing = aliases.find((item) => normalizeToken(item.alias) === normalizedAlias);
    if (existing && normalizeToken(existing.canonical) !== normalizedCanonical && normalizedCanonical) {
      warnings.push(`"${existing.alias}" is already mapped to "${existing.canonical}".`);
    }
    if (existing && normalizeToken(existing.canonical) === normalizedCanonical && normalizedCanonical) {
      warnings.push('This rule already exists.');
    }
    if (normalizedAlias && normalizedCanonical && normalizedAlias === normalizedCanonical) {
      warnings.push('Alias and canonical are identical. Consider skipping the rule.');
    }
    return warnings;
  }, [aliasValue, canonicalValue, aliases]);

  useEffect(() => {
    let active = true;
    if (!aliasValue.trim()) {
      setServerSuggestions([]);
      return () => {
        active = false;
      };
    }
    const timer = setTimeout(() => {
      adminApi
        .suggestSourceAlias({ alias: aliasValue.trim() })
        .then((response) => {
          if (active) {
            setServerSuggestions(response.suggestions || []);
          }
        })
        .catch(() => {
          if (active) setServerSuggestions([]);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [aliasValue]);

  const renderSparkline = (values: number[]) => {
    if (!values.length) return null;
    const width = 120;
    const height = 36;
    const max = Math.max(...values, 1);
    const points = values.map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * (width - 2) + 1;
      const y = height - (value / max) * (height - 6) - 3;
      return `${x},${y}`;
    }).join(' ');
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-sky-500">
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={points}
        />
      </svg>
    );
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(''), 3200);
  };

  const applyOptimisticAliasUpdate = (
    current: AdminSourcesSummary | null,
    aliasLabel: string,
    trend7d?: { labels: string[]; counts: number[] },
    trend30d?: { labels: string[]; counts: number[] }
  ) => {
    if (!current) return current;
    const normalized = normalizeToken(aliasLabel);
    if (!normalized) return current;
    const match = current.unmapped.top.find((item) => normalizeToken(item.name) === normalized);
    if (!match) return current;
    const remainingTop = current.unmapped.top.filter((item) => normalizeToken(item.name) !== normalized);
    const updatedTotal = Math.max(0, current.unmapped.total - match.count);
    const coveragePct = current.totals.signups > 0
      ? Math.round(((current.totals.signups - updatedTotal) / current.totals.signups) * 100)
      : 100;
    const updateTrend = (currentTrend: { labels: string[]; counts: number[] }, impact?: { labels: string[]; counts: number[] }) => {
      if (!impact?.labels?.length) return currentTrend;
      const impactMap = new Map<string, number>();
      impact.labels.forEach((label, index) => {
        impactMap.set(label, impact.counts[index] || 0);
      });
      return {
        labels: currentTrend.labels,
        counts: currentTrend.labels.map((label, index) =>
          Math.max(0, (currentTrend.counts[index] || 0) - (impactMap.get(label) || 0))
        )
      };
    };
    return {
      ...current,
      unmapped: {
        ...current.unmapped,
        total: updatedTotal,
        coveragePct,
        top: remainingTop,
        trend7d: updateTrend(current.unmapped.trend7d, trend7d),
        trend30d: updateTrend(current.unmapped.trend30d, trend30d)
      }
    };
  };

  const createAlias = async () => {
    if (!aliasValue.trim() || !canonicalValue.trim()) {
      setErrorMessage('Alias and canonical name are required.');
      return;
    }
    try {
      const created = await adminApi.createSourceAlias({ alias: aliasValue.trim(), canonical: canonicalValue.trim() });
      const items = await adminApi.getSourceAliases();
      setAliases(items);
      setSummary((current) =>
        applyOptimisticAliasUpdate(current, aliasValue.trim(), created.impactTrend7d, created.impactTrend30d)
      );
      if (typeof created.impactCount === 'number') {
        showToast(`Mapped ${created.impactCount.toLocaleString()} signups from "${aliasValue.trim()}"`);
      } else {
        showToast('Alias rule added.');
      }
      setAliasDialogOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create alias.');
    }
  };

  const quickAddAlias = async (label: string) => {
    const suggestion = getCanonicalSuggestions(label, canonicalOptions, aliases)[0] || '';
    if (!suggestion) {
      openAliasDialogFor(label);
      return;
    }
    setQuickAddLoading(label);
    try {
      const created = await adminApi.createSourceAlias({ alias: label.trim(), canonical: suggestion });
      const items = await adminApi.getSourceAliases();
      setAliases(items);
      setSummary((current) =>
        applyOptimisticAliasUpdate(current, label.trim(), created.impactTrend7d, created.impactTrend30d)
      );
      if (typeof created.impactCount === 'number') {
        showToast(`Mapped ${created.impactCount.toLocaleString()} signups from "${label.trim()}"`);
      } else {
        showToast('Alias rule added.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create alias.');
    } finally {
      setQuickAddLoading(null);
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

  return (
    <AdminShell>
      <div className="space-y-8">
        <section className="relative overflow-hidden rounded-3xl border border-border-subtle bg-eye-comfort p-6 sm:p-8">
          <div className="pointer-events-none absolute -top-24 right-[-10%] h-56 w-56 rounded-full bg-gradient-to-br from-sky-300/25 via-blue-400/20 to-transparent blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-[-10%] h-56 w-56 rounded-full bg-gradient-to-br from-rose-300/20 via-red-200/20 to-transparent blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Attribution Studio
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
                Unify your signup sources
              </h1>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Normalize messy source labels, monitor growth, and jump straight into campaigns.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 text-xs">
                {[
                  { label: 'Total signups', value: totals.total.toLocaleString() },
                  { label: 'Last 7 days', value: totals.last7d.toLocaleString() },
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
              {topSources.length ? (
                <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                  <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Top sources</span>
                  {topSources.map((source) => (
                    <Link
                      key={source.name}
                      to={`/boss/sources/detail?source=${encodeURIComponent(source.name)}`}
                      className="rounded-full border border-white/60 bg-white/70 px-3 py-1 font-semibold text-slate-700 shadow-sm backdrop-blur hover:text-slate-900 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100"
                    >
                      {source.name} · {source.signups.toLocaleString()}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setLiveEnabled((current) => !current)}>
                Live: {liveEnabled ? 'On' : 'Off'}
              </Button>
              <Link to="/boss/sources">
                <Button variant="outline">Sources dashboard</Button>
              </Link>
              <Button>New campaign</Button>
            </div>
          </div>
        </section>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {toastMessage ? (
          <div className="fixed right-6 top-6 z-50 w-[min(90vw,360px)] rounded-2xl border border-emerald-200 bg-emerald-50/95 p-4 text-sm text-emerald-800 shadow-lg">
            {toastMessage}
          </div>
        ) : null}

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Data coverage</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Track how much of your signup data is standardized by attribution rules.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                { label: 'Coverage', value: `${coverage.coveragePct}%` },
                { label: 'Unmapped signups', value: coverage.total.toLocaleString() },
                { label: 'Unknown source', value: coverage.unknown.toLocaleString() }
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
          <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Top unmapped labels</p>
            {coverage.top.length ? coverage.top.map((item) => (
              <div
                key={item.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 dark:border-slate-700/70 dark:bg-slate-900/80"
              >
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</div>
                  <div className="text-xs text-slate-500">{item.count.toLocaleString()} signups</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    onClick={() => quickAddAlias(item.name)}
                    disabled={quickAddLoading === item.name}
                  >
                    {quickAddLoading === item.name ? 'Adding...' : 'Quick add'}
                  </button>
                  <Link to={`/boss/sources/detail?source=${encodeURIComponent(item.name)}`}>
                    <Button size="sm" variant="outline">Details</Button>
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => openAliasDialogFor(item.name)}>
                    Add rule
                  </Button>
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-border-subtle p-4 text-center text-sm text-slate-500">
                {loading ? 'Loading coverage...' : 'No unmapped labels right now.'}
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
            <div className="rounded-xl border border-border-subtle bg-white/70 px-4 py-3 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/60">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em]">Unmapped last 7d</p>
              <div className="mt-2">{renderSparkline(trend7d)}</div>
            </div>
            <div className="rounded-xl border border-border-subtle bg-white/70 px-4 py-3 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/60">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em]">Unmapped last 30d</p>
              <div className="mt-2">{renderSparkline(trend30d)}</div>
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Attribution rules</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Map aliases to a canonical label to keep reports clean.
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
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {alias.impactCount.toLocaleString()} signups
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link to={`/boss/campaigns/new?source=${encodeURIComponent(alias.canonical)}`}>
                    <Button size="sm" variant="outline">Campaign</Button>
                  </Link>
                  <Link to={`/boss/automations/new?source=${encodeURIComponent(alias.canonical)}`}>
                    <Button size="sm" variant="outline">Automation</Button>
                  </Link>
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

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Source coverage</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Explore your highest volume signup sources.
              </p>
            </div>
            <div className="w-full sm:w-64">
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search sources..."
                className="w-full rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sources.map((source) => (
              <Card key={source.name} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{source.name}</p>
                    <p className="text-xs text-slate-500">
                      {source.signups.toLocaleString()} signups · {source.last7d.toLocaleString()} last 7d
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    source.growth >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {source.growth >= 0 ? '+' : ''}{source.growth}%
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/boss/sources/detail?source=${encodeURIComponent(source.name)}`}>
                    <Button size="sm" variant="outline">Details</Button>
                  </Link>
                  <Link to={`/boss/campaigns/new?source=${encodeURIComponent(source.name)}`}>
                    <Button size="sm">Campaign</Button>
                  </Link>
                  <Link to={`/boss/automations/new?source=${encodeURIComponent(source.name)}`}>
                    <Button size="sm" variant="outline">Automation</Button>
                  </Link>
                </div>
              </Card>
            ))}
            {!sources.length ? (
              <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
                {loading ? 'Loading sources...' : 'No source data available.'}
              </Card>
            ) : null}
          </div>
        </Card>
      </div>
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
          {activeSuggestions.length ? (
            <div className="flex flex-wrap gap-2 text-xs">
              {activeSuggestions.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  onClick={() => setCanonicalValue(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
          {aliasWarnings.length ? (
            <div className="grid gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {aliasWarnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}
        </label>
      </AdminModal>
    </AdminShell>
  );
}
