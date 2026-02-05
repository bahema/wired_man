import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, DeliverabilityStatus, SystemHealthStatus } from '../services/adminApi';

const toneClass = (tone: 'emerald' | 'amber' | 'rose') => {
  if (tone === 'emerald') return 'text-emerald-600 dark:text-emerald-400';
  if (tone === 'amber') return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

export default function BossSystemHealthPage() {
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [deliverability, setDeliverability] = useState<DeliverabilityStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [healthPayload, deliverabilityPayload] = await Promise.all([
          adminApi.getSystemHealth(),
          adminApi.getDeliverabilityStatus()
        ]);
        if (active) {
          setHealth(healthPayload);
          setDeliverability(deliverabilityPayload);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load system health.');
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

  const checklist = useMemo(() => {
    if (!health) return [];
    const warningsEnabled = health.deliverabilityWarningsEnabled;
    return [
      {
        label: 'PUBLIC_URL uses HTTPS',
        ok: health.publicUrlIsHttps,
        detail: health.publicUrl
      },
      {
        label: 'SMTP configured',
        ok: health.smtpConfigured,
        detail: health.smtpConfigured ? 'Ready' : 'Missing host/user/pass'
      },
      {
        label: 'Throttling enabled',
        ok: health.sendRatePerMinute > 0 || health.sendRatePerHour > 0,
        detail: `${health.sendRatePerMinute}/min · ${health.sendRatePerHour}/hour`
      },
      {
        label: 'Unsubscribe injection',
        ok: health.unsubscribeInjectionEnabled,
        detail: 'Always on'
      },
      {
        label: 'Deliverability warnings',
        ok: warningsEnabled,
        detail: warningsEnabled ? 'Active' : 'Disabled'
      },
      {
        label: 'Dry run mode',
        ok: !health.dryRunMode,
        detail: health.dryRunMode ? 'Enabled' : 'Disabled'
      }
    ];
  }, [health]);

  const deliverabilityChecks = useMemo(() => {
    if (!deliverability) return [];
    return [
      { label: 'SPF', ok: deliverability.spfConfigured },
      { label: 'DKIM', ok: deliverability.dkimConfigured },
      { label: 'DMARC', ok: deliverability.dmarcConfigured }
    ];
  }, [deliverability]);

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              System Health
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Release checklist for safe affiliate sending.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>

        {errorMessage ? <Card className="p-4 text-sm text-red-600">{errorMessage}</Card> : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {checklist.map((item) => (
            <Card key={item.label} className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {item.label}
              </p>
              <p className={`mt-3 text-2xl font-semibold ${toneClass(item.ok ? 'emerald' : 'rose')}`}>
                {loading ? '...' : item.ok ? 'OK' : 'Fix'}
              </p>
              <p className="mt-2 text-xs text-slate-500">{loading ? '...' : item.detail}</p>
            </Card>
          ))}
        </div>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Deliverability DNS
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            These must be green before you send to a large audience.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {deliverabilityChecks.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm dark:border-slate-700/70 dark:bg-slate-900/80"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {item.label}
                </div>
                <div className={`mt-2 text-lg font-semibold ${toneClass(item.ok ? 'emerald' : 'rose')}`}>
                  {loading ? '...' : item.ok ? 'Configured' : 'Missing'}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              System & Database
            </h2>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
              <div>Uptime: {loading ? '...' : `${health?.system?.uptimeSec ?? 0}s`}</div>
              <div>Node: {loading ? '...' : health?.system?.nodeVersion || '—'}</div>
              <div>App Version: {loading ? '...' : health?.system?.appVersion || '—'}</div>
              <div>PID: {loading ? '...' : health?.system?.pid ?? '—'}</div>
              <div>
                DB Status:{' '}
                <span className={toneClass(health?.database?.ok ? 'emerald' : 'rose')}>
                  {loading ? '...' : health?.database?.ok ? 'OK' : 'Down'}
                </span>
              </div>
              <div>DB Latency: {loading ? '...' : `${health?.database?.latencyMs ?? 0} ms`}</div>
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Workers
            </h2>
            <div className="mt-3 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">Email Worker</div>
                <div>Status: {health?.workers?.email?.running ? 'Running' : 'Stopped'}</div>
                <div>Started: {formatTimestamp(health?.workers?.email?.startedAt || null)}</div>
                <div>Last Job: {formatTimestamp(health?.workers?.email?.lastJobAt || null)}</div>
                <div>Last Error: {health?.workers?.email?.lastError || '—'}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">Export Worker</div>
                <div>Status: {health?.workers?.export?.running ? 'Running' : 'Stopped'}</div>
                <div>Started: {formatTimestamp(health?.workers?.export?.startedAt || null)}</div>
                <div>Last Job: {formatTimestamp(health?.workers?.export?.lastJobAt || null)}</div>
                <div>Last Error: {health?.workers?.export?.lastError || '—'}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">Automation Scheduler</div>
                <div>Status: {health?.workers?.automation?.running ? 'Running' : 'Stopped'}</div>
                <div>Last Run: {formatTimestamp(health?.workers?.automation?.lastRunAt || null)}</div>
                <div>Last Error: {health?.workers?.automation?.lastError || '—'}</div>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Queue Depth
            </h2>
            <div className="mt-3 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="font-semibold text-slate-900 dark:text-slate-100">Email Jobs</div>
              <div>Queued: {health?.queues?.emailJobs?.queued ?? 0}</div>
              <div>Processing: {health?.queues?.emailJobs?.processing ?? 0}</div>
              <div>Failed: {health?.queues?.emailJobs?.failed ?? 0}</div>
              <div>Skipped: {health?.queues?.emailJobs?.skipped ?? 0}</div>
              <div className="mt-2 font-semibold text-slate-900 dark:text-slate-100">Export Jobs</div>
              <div>Queued: {health?.queues?.exportJobs?.queued ?? 0}</div>
              <div>Processing: {health?.queues?.exportJobs?.processing ?? 0}</div>
              <div>Failed: {health?.queues?.exportJobs?.failed ?? 0}</div>
              <div>Completed: {health?.queues?.exportJobs?.completed ?? 0}</div>
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Recent Jobs
            </h2>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
              <div>Last Email Job: {formatTimestamp(health?.jobs?.lastEmailJobAt || null)}</div>
              <div>Last Email Error: {formatTimestamp(health?.jobs?.lastEmailErrorAt || null)}</div>
              <div>Last Export Job: {formatTimestamp(health?.jobs?.lastExportJobAt || null)}</div>
              <div>Last Export Error: {formatTimestamp(health?.jobs?.lastExportErrorAt || null)}</div>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              SMTP Activity
            </h2>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
              <div>Last Success: {formatTimestamp(health?.smtp?.lastSuccessAt || null)}</div>
              <div>Last Error: {formatTimestamp(health?.smtp?.lastErrorAt || null)}</div>
              <div>Last SMTP Info: {health?.smtp?.lastInfo?.message || '—'}</div>
              <div>Last SMTP Error: {health?.smtp?.lastError?.message || '—'}</div>
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Storage & Streams
            </h2>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
              <div>Uploads Path: {health?.storage?.uploadsPath || '—'}</div>
              <div>Uploads Size: {health?.storage?.uploadsSizeMb ?? 0} MB</div>
              <div>Content Stream Listeners: {health?.streams?.contentListeners ?? 0}</div>
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Sandbox Mode
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Use sandbox sends to validate templates with allowlisted emails or test subscribers.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <div>Allowlist count: {loading ? '...' : health?.testSendAllowlistCount ?? 0}</div>
            <div>Dry run: {loading ? '...' : health?.dryRunMode ? 'On' : 'Off'}</div>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
