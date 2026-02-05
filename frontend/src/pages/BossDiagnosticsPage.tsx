import React, { useCallback, useMemo, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi } from '../services/adminApi';
import { publicApi } from '../services/publicApi';
import { appendMediaVersion, buildApiUrl, toMediaUrl } from '../data/mediaLibrary';

type CheckResult = {
  key: string;
  label: string;
  path: string;
  status: number;
  timeMs: number;
  ok: boolean;
  summary: string;
  error?: string;
  data?: unknown;
};

type MediaIssue = {
  url: string;
  status: number;
  source: string;
  label: string;
};

const formatMs = (value: number) => `${Math.round(value)}ms`;

const safeCount = (value: unknown) => (Array.isArray(value) ? value.length : 0);

const extractMediaValues = (key: string, data: unknown) => {
  const items: Array<{ value: string; label: string }> = [];
  if (!data) return items;

  if (key === 'hero') {
    const payload = data as { hero?: Record<string, unknown> | null; featured?: Array<Record<string, unknown>> };
    const hero = payload.hero || null;
    if (hero && typeof hero.backgroundImageUrl === 'string') {
      items.push({ value: hero.backgroundImageUrl, label: 'hero.backgroundImageUrl' });
    }
    if (hero && typeof hero.heroBadge === 'string') {
      items.push({ value: hero.heroBadge, label: 'hero.heroBadge' });
    }
    (payload.featured || []).forEach((slot, index) => {
      if (typeof slot.imageUrl === 'string' && slot.imageUrl) {
        items.push({ value: slot.imageUrl, label: `featured[${index}].imageUrl` });
      }
    });
  }

  if (key.startsWith('products')) {
    const list = Array.isArray(data) ? data : [];
    list.forEach((product, index) => {
      if (product && typeof product.imageUrl === 'string' && product.imageUrl) {
        items.push({ value: product.imageUrl, label: `products[${index}].imageUrl` });
      }
      if (product && Array.isArray(product.galleryUrls)) {
        product.galleryUrls.forEach((url: string, gIndex: number) => {
          if (typeof url === 'string' && url) {
            items.push({ value: url, label: `products[${index}].galleryUrls[${gIndex}]` });
          }
        });
      }
    });
  }

  if (key === 'upcoming') {
    const list = Array.isArray(data) ? data : [];
    list.forEach((item, index) => {
      if (item && typeof item.imageUrl === 'string' && item.imageUrl) {
        items.push({ value: item.imageUrl, label: `upcoming[${index}].imageUrl` });
      }
    });
  }

  if (key === 'videos') {
    const list = Array.isArray(data) ? data : [];
    list.forEach((video, index) => {
      if (video && typeof video.src === 'string' && video.src) {
        items.push({ value: video.src, label: `videos[${index}].src` });
      }
      if (video && typeof video.poster === 'string' && video.poster) {
        items.push({ value: video.poster, label: `videos[${index}].poster` });
      }
    });
  }

  if (key === 'partners') {
    const payload = data as { items?: Array<Record<string, unknown>> };
    (payload.items || []).forEach((partner, index) => {
      if (partner && typeof partner.logoUrl === 'string' && partner.logoUrl) {
        items.push({ value: partner.logoUrl, label: `partners[${index}].logoUrl` });
      }
    });
  }

  return items;
};

const endpointConfigs = [
  {
    key: 'hero',
    label: '/api/public/hero',
    path: '/api/public/hero',
    summarize: (data: any) =>
      `hero:${data?.hero ? 'yes' : 'no'}, featured:${safeCount(data?.featured)}`
  },
  {
    key: 'ticker',
    label: '/api/public/ticker',
    path: '/api/public/ticker',
    summarize: (data: any) => `items:${safeCount(data?.items)}`
  },
  {
    key: 'products-home',
    label: '/api/public/products?placement=home',
    path: '/api/public/products?placement=home',
    summarize: (data: any) => `items:${safeCount(data)}`
  },
  {
    key: 'products-items',
    label: '/api/public/products?placement=items',
    path: '/api/public/products?placement=items',
    summarize: (data: any) => `items:${safeCount(data)}`
  },
  {
    key: 'products-forex',
    label: '/api/public/products?placement=forex',
    path: '/api/public/products?placement=forex',
    summarize: (data: any) => `items:${safeCount(data)}`
  },
  {
    key: 'upcoming',
    label: '/api/public/upcoming',
    path: '/api/public/upcoming',
    summarize: (data: any) => `items:${safeCount(data)}`
  },
  {
    key: 'videos',
    label: '/api/public/videos',
    path: '/api/public/videos',
    summarize: (data: any) => `items:${safeCount(data)}`
  },
  {
    key: 'faqs',
    label: '/api/public/faqs',
    path: '/api/public/faqs',
    summarize: (data: any) => `items:${safeCount(data?.items)}`
  },
  {
    key: 'partners',
    label: '/api/public/partners',
    path: '/api/public/partners',
    summarize: (data: any) => `items:${safeCount(data?.items)}`
  },
  {
    key: 'modal-copy',
    label: '/api/public/modal-copy',
    path: '/api/public/modal-copy',
    summarize: (data: any) => `title:${data?.title ? 'yes' : 'no'}`
  },
  {
    key: 'theme',
    label: '/api/public/theme',
    path: '/api/public/theme',
    summarize: (data: any) => `mode:${data?.mode || 'unknown'}`
  }
];

export default function BossDiagnosticsPage() {
  const [sessionOk, setSessionOk] = useState<boolean | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [mediaIssues, setMediaIssues] = useState<MediaIssue[]>([]);
  const [mediaStatus, setMediaStatus] = useState('');
  const [smtpStatus, setSmtpStatus] = useState({
    smtpConfigured: false,
    smtpLastKnownGood: false,
    signupEnabled: false
  });
  const [subscribedFlag, setSubscribedFlag] = useState(() => {
    return localStorage.getItem('isSubscribed') === 'true';
  });

  const configs = useMemo(() => endpointConfigs, []);

  const runCheck = useCallback(async (config: typeof endpointConfigs[number]) => {
    const start = performance.now();
    try {
      const res = await fetch(buildApiUrl(config.path), {
        headers: { 'Cache-Control': 'no-cache' }
      });
      const timeMs = performance.now() - start;
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      return {
        key: config.key,
        label: config.label,
        path: config.path,
        status: res.status,
        timeMs,
        ok: res.ok,
        summary: res.ok ? config.summarize(data) : 'Error',
        data
      } as CheckResult;
    } catch (error) {
      const timeMs = performance.now() - start;
      return {
        key: config.key,
        label: config.label,
        path: config.path,
        status: 0,
        timeMs,
        ok: false,
        summary: 'Request failed',
        error: error instanceof Error ? error.message : 'Request failed'
      } as CheckResult;
    }
  }, []);

  const runMediaChecks = useCallback(async (results: Record<string, CheckResult>) => {
    setMediaStatus('Checking media assets...');
    let mediaVersion = 0;
    try {
      const res = await fetch(buildApiUrl('/api/public/media-version'));
      if (res.ok) {
        const payload = await res.json().catch(() => null);
        mediaVersion = typeof payload?.version === 'number' ? payload.version : 0;
      }
    } catch {
      mediaVersion = 0;
    }

    const mediaItems: Array<{ url: string; source: string; label: string }> = [];
    Object.values(results).forEach((result) => {
      const items = extractMediaValues(result.key, result.data);
      items.forEach((item) => {
        const resolved = appendMediaVersion(item.value, mediaVersion);
        if (!resolved) return;
        mediaItems.push({
          url: resolved || toMediaUrl(item.value),
          source: result.label,
          label: item.label
        });
      });
    });

    const issues: MediaIssue[] = [];
    await Promise.all(
      mediaItems.map(async (item) => {
        try {
          let res = await fetch(item.url, { method: 'HEAD' });
          if (!res.ok) {
            res = await fetch(item.url, { method: 'GET' });
          }
          if (!res.ok) {
            issues.push({
              url: item.url,
              status: res.status,
              source: item.source,
              label: item.label
            });
          }
        } catch (error) {
          issues.push({
            url: item.url,
            status: 0,
            source: item.source,
            label: item.label
          });
        }
      })
    );
    setMediaIssues(issues);
    setMediaStatus(
      issues.length
        ? `Found ${issues.length} broken media URLs`
        : `All media URLs resolved (${mediaItems.length})`
    );
  }, []);

  const runAll = useCallback(async () => {
    setCheckingAll(true);
    const entries = await Promise.all(configs.map((config) => runCheck(config)));
    const next: Record<string, CheckResult> = {};
    entries.forEach((entry) => {
      next[entry.key] = entry;
    });
    setChecks(next);
    setCheckingAll(false);
    await runMediaChecks(next);
  }, [configs, runCheck, runMediaChecks]);

  const rerunSingle = useCallback(
    async (config: typeof endpointConfigs[number]) => {
      const result = await runCheck(config);
      setChecks((prev) => {
        const next = { ...prev, [config.key]: result };
        void runMediaChecks(next);
        return next;
      });
    },
    [runCheck, runMediaChecks]
  );

  const checkSession = useCallback(async () => {
    setSessionError('');
    try {
      const result = await adminApi.getSession();
      setSessionOk(Boolean(result.ok));
    } catch (error) {
      setSessionOk(false);
      setSessionError(error instanceof Error ? error.message : 'Unauthorized');
    }
  }, []);

  const loadSmtpStatus = useCallback(async () => {
    try {
      const settings = await publicApi.fetchAdminLoginSettings();
      setSmtpStatus({
        smtpConfigured: Boolean(settings.smtpConfigured),
        smtpLastKnownGood: Boolean(settings.smtpLastKnownGood),
        signupEnabled: Boolean(settings.signupEnabled)
      });
    } catch {
      setSmtpStatus({ smtpConfigured: false, smtpLastKnownGood: false, signupEnabled: false });
    }
  }, []);

  React.useEffect(() => {
    void runAll();
    void checkSession();
    void loadSmtpStatus();
  }, [runAll, checkSession, loadSmtpStatus]);

  const handleSetSubscribed = (value: boolean) => {
    localStorage.setItem('isSubscribed', value ? 'true' : 'false');
    setSubscribedFlag(value);
  };

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">Diagnostics</p>
          <h1 className="text-2xl font-semibold text-text">Boss Diagnostics</h1>
          <p className="mt-1 text-sm text-text-muted">
            Auto-checks public endpoints, media visibility, and SMTP readiness.
          </p>
        </div>
        <Button onClick={runAll} disabled={checkingAll}>
          {checkingAll ? 'Running checks...' : 'Re-run all'}
        </Button>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card hover={false} className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">Session</h2>
            <Button size="sm" variant="outline" onClick={checkSession}>
              Re-check
            </Button>
          </div>
          <p className="mt-3 text-sm text-text-muted">
            {sessionOk === null
              ? 'Checking session...'
              : sessionOk
                ? 'OK (session accepted by backend)'
                : `Unauthorized${sessionError ? `: ${sessionError}` : ''}`}
          </p>
        </Card>

        <Card hover={false} className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">SMTP readiness</h2>
            <Button size="sm" variant="outline" onClick={loadSmtpStatus}>
              Refresh
            </Button>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-text-muted">
            <div className="flex items-center justify-between">
              <span>smtpConfigured</span>
              <span className={smtpStatus.smtpConfigured ? 'text-emerald-600' : 'text-amber-600'}>
                {smtpStatus.smtpConfigured ? 'true' : 'false'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>smtpLastKnownGood</span>
              <span className={smtpStatus.smtpLastKnownGood ? 'text-emerald-600' : 'text-amber-600'}>
                {smtpStatus.smtpLastKnownGood ? 'true' : 'false'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>signupEnabled</span>
              <span className={smtpStatus.signupEnabled ? 'text-emerald-600' : 'text-amber-600'}>
                {smtpStatus.signupEnabled ? 'true' : 'false'}
              </span>
            </div>
            {!smtpStatus.smtpConfigured ? (
              <p className="text-xs text-amber-600">Configure SMTP in Settings to enable OTP delivery.</p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card hover={false} className="mt-6 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Public content endpoints</h2>
          <span className="text-xs text-text-muted">Auto-run on load</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs text-text-muted">
            <thead>
              <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-text-muted">
                <th className="py-2 pr-4">Endpoint</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Summary</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((config) => {
                const result = checks[config.key];
                return (
                  <tr key={config.key} className="border-b border-border-subtle">
                    <td className="py-3 pr-4 font-medium text-text">{config.label}</td>
                    <td className="py-3 pr-4">
                      {result ? (
                        <span className={result.ok ? 'text-emerald-600' : 'text-red-600'}>
                          {result.status || 'ERR'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 pr-4">{result ? formatMs(result.timeMs) : '—'}</td>
                    <td className="py-3 pr-4">{result ? result.summary : 'Pending'}</td>
                    <td className="py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => rerunSingle(config)}>
                        Re-run
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card hover={false} className="mt-6 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Media checks</h2>
          <Button size="sm" variant="outline" onClick={() => runMediaChecks(checks)}>
            Re-run media checks
          </Button>
        </div>
        <p className="mt-2 text-xs text-text-muted">{mediaStatus || 'Not yet checked.'}</p>
        {mediaIssues.length ? (
          <div className="mt-3 space-y-2 text-xs text-red-600">
            {mediaIssues.map((issue, index) => (
              <div key={`${issue.url}-${index}`} className="rounded-lg border border-red-200 bg-red-50 p-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Status {issue.status || 'ERR'}</span>
                  <span className="text-[11px] text-red-500">{issue.source}</span>
                </div>
                <div className="mt-1 break-all">{issue.url}</div>
                <div className="text-[11px] text-red-500">{issue.label}</div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <Card hover={false} className="mt-6 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Subscribe gate state</h2>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => handleSetSubscribed(true)}>
              Set subscribed
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleSetSubscribed(false)}>
              Clear subscribed
            </Button>
          </div>
        </div>
        <p className="mt-3 text-sm text-text-muted">
          localStorage.isSubscribed ={' '}
          <span className={subscribedFlag ? 'text-emerald-600' : 'text-amber-600'}>
            {subscribedFlag ? 'true' : 'false'}
          </span>
        </p>
      </Card>
    </AdminShell>
  );
}
