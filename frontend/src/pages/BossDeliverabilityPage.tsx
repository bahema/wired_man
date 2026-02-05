import { useEffect, useMemo, useRef, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, DeliverabilityChecklist, DeliverabilityError, DeliverabilityStatus, DeliverabilityTrends, SuppressedLeadsResponse, SmtpLogEntry } from '../services/adminApi';

export default function BossDeliverabilityPage() {
  const [status, setStatus] = useState<DeliverabilityStatus | null>(null);
  const [checklist, setChecklist] = useState<DeliverabilityChecklist | null>(null);
  const [suppressed, setSuppressed] = useState<SuppressedLeadsResponse | null>(null);
  const [trends, setTrends] = useState<DeliverabilityTrends | null>(null);
  const [trendWindow, setTrendWindow] = useState(30);
  const [errors, setErrors] = useState<DeliverabilityError[]>([]);
  const [smtpLogs, setSmtpLogs] = useState<SmtpLogEntry[]>([]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [diagnosticMessage, setDiagnosticMessage] = useState('');
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [suppressedOpen, setSuppressedOpen] = useState(false);
  const [dnsDomain, setDnsDomain] = useState('');
  const [dkimSelector, setDkimSelector] = useState('');
  const [dnsSaveMessage, setDnsSaveMessage] = useState('');
  const [smtpLastKnownGood, setSmtpLastKnownGood] = useState<boolean | null>(null);
  const [smtpHasBackup, setSmtpHasBackup] = useState<boolean | null>(null);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const [exportingSuppressed, setExportingSuppressed] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; tone: 'success' | 'error' }>>([]);
  const [suppressedPage, setSuppressedPage] = useState(1);
  const [suppressedReason, setSuppressedReason] = useState<'all' | 'unsubscribed' | 'email_invalid'>('all');
  const [suppressedSearch, setSuppressedSearch] = useState('');
  const [suppressedSource, setSuppressedSource] = useState('');
  const [suppressedCountry, setSuppressedCountry] = useState('');
  const [suppressedStart, setSuppressedStart] = useState('');
  const [suppressedEnd, setSuppressedEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalError, setModalError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [configStatus, setConfigStatus] = useState<{ smtpConfigured: boolean; publicUrl: string; publicUrlIsHttps: boolean } | null>(null);
  const [suppressedAction, setSuppressedAction] = useState<string | null>(null);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const autoRefreshRef = useRef(false);
  const actionButtonClass =
    '!border-sky-400/80 !bg-sky-600 !text-white shadow-sm transition hover:!border-sky-300 hover:!bg-sky-500 hover:!text-white';
  const neutralButtonClass =
    '!border-slate-500 !bg-slate-800 !text-slate-100 shadow-sm transition hover:!border-sky-300 hover:!bg-slate-700 hover:!text-white';

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [payload, trendPayload, settings] = await Promise.all([
          adminApi.getDeliverabilityStatus(),
          adminApi.getDeliverabilityTrends(trendWindow),
          adminApi.getSettings()
        ]);
        if (active) {
          setStatus(payload);
          setTrends(trendPayload);
          setDnsDomain(settings?.deliverabilityDomain || '');
          setDkimSelector(settings?.dkimSelector || '');
          setSmtpLastKnownGood(settings?.smtpLastKnownGood ?? null);
          setSmtpHasBackup(settings?.smtpHasBackup ?? null);
          if (typeof settings?.deliverabilityLive === 'boolean') {
            setLiveEnabled(settings.deliverabilityLive);
          }
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load deliverability status.');
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
  }, [trendWindow]);

  useEffect(() => {
    let active = true;
    const refreshAll = async () => {
      if (autoRefreshRef.current) return;
      autoRefreshRef.current = true;
      try {
        const [payload, trendPayload, settings] = await Promise.all([
          adminApi.getDeliverabilityStatus(),
          adminApi.getDeliverabilityTrends(trendWindow),
          adminApi.getSettings()
        ]);
        if (!active) return;
        setStatus(payload);
        setTrends(trendPayload);
        setDnsDomain(settings?.deliverabilityDomain || '');
        setDkimSelector(settings?.dkimSelector || '');
        setSmtpLastKnownGood(settings?.smtpLastKnownGood ?? null);
        setSmtpHasBackup(settings?.smtpHasBackup ?? null);
        if (typeof settings?.deliverabilityLive === 'boolean') {
          setLiveEnabled(settings.deliverabilityLive);
        }
        if (checklistOpen) {
          const checklistPayload = await adminApi.getDeliverabilityChecklist();
          if (active) {
            setChecklist(checklistPayload);
            setConfigStatus({
              smtpConfigured: checklistPayload.config.smtpConfigured,
              publicUrl: checklistPayload.config.publicUrl,
              publicUrlIsHttps: checklistPayload.config.publicUrlIsHttps
            });
          }
        }
        if (diagnosticsOpen) {
          const [errorsPayload, smtpPayload] = await Promise.all([
            adminApi.getDeliverabilityErrors(),
            adminApi.getSmtpLogs(40)
          ]);
          if (active) {
            setErrors(errorsPayload);
            setSmtpLogs(smtpPayload.items || []);
          }
        }
        if (suppressedOpen) {
          const suppressedPayload = await adminApi.getSuppressedLeads({
            page: suppressedPage,
            limit: 12,
            reason: suppressedReason === 'all' ? undefined : suppressedReason,
            search: suppressedSearch || undefined,
            source: suppressedSource || undefined,
            country: suppressedCountry || undefined,
            start: suppressedStart || undefined,
            end: suppressedEnd || undefined
          });
          if (active) {
            setSuppressed(suppressedPayload);
          }
        }
      } catch {
        if (active) {
          setErrorMessage('Auto-refresh failed. Please check the backend connection.');
        }
      } finally {
        autoRefreshRef.current = false;
      }
    };

    const interval = window.setInterval(refreshAll, 60000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [
    trendWindow,
    checklistOpen,
    diagnosticsOpen,
    suppressedOpen,
    suppressedPage,
    suppressedReason,
    suppressedSearch,
    suppressedSource,
    suppressedCountry,
    suppressedStart,
    suppressedEnd
  ]);

  useEffect(() => {
    if (!liveEnabled) return undefined;
    const params = new URLSearchParams();
    const sessionToken =
      sessionStorage.getItem('boss-admin-session') || localStorage.getItem('boss-admin-session') || '';
    const adminToken =
      (import.meta as { env?: { VITE_ADMIN_TOKEN?: string } }).env?.VITE_ADMIN_TOKEN || '';
    if (sessionToken) params.set('adminSession', sessionToken);
    if (adminToken) params.set('adminToken', adminToken);
    const source = new EventSource(`/api/admin/deliverability/stream?${params.toString()}`);
    const handler = (event: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(event.data) as { status: DeliverabilityStatus };
        if (payload?.status) {
          setStatus(payload.status);
        }
        if (payload?.config) {
          setConfigStatus(payload.config);
        }
      } catch {
        // Ignore malformed SSE payloads.
      }
    };
    source.addEventListener('deliverability', handler);
    source.onerror = () => {
      source.close();
    };
    return () => {
      source.removeEventListener('deliverability', handler);
      source.close();
    };
  }, [liveEnabled]);

  useEffect(() => {
    const stored = localStorage.getItem('boss-suppressed-filters');
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as {
        page?: number;
        reason?: 'all' | 'unsubscribed' | 'email_invalid';
        search?: string;
        source?: string;
        country?: string;
        start?: string;
        end?: string;
      };
      if (parsed.page) setSuppressedPage(parsed.page);
      if (parsed.reason) setSuppressedReason(parsed.reason);
      if (typeof parsed.search === 'string') setSuppressedSearch(parsed.search);
      if (typeof parsed.source === 'string') setSuppressedSource(parsed.source);
      if (typeof parsed.country === 'string') setSuppressedCountry(parsed.country);
      if (typeof parsed.start === 'string') setSuppressedStart(parsed.start);
      if (typeof parsed.end === 'string') setSuppressedEnd(parsed.end);
    } catch {
      // Ignore malformed stored state.
    }
  }, []);

  useEffect(() => {
    const payload = {
      page: suppressedPage,
      reason: suppressedReason,
      search: suppressedSearch,
      source: suppressedSource,
      country: suppressedCountry,
      start: suppressedStart,
      end: suppressedEnd
    };
    localStorage.setItem('boss-suppressed-filters', JSON.stringify(payload));
  }, [
    suppressedPage,
    suppressedReason,
    suppressedSearch,
    suppressedSource,
    suppressedCountry,
    suppressedStart,
    suppressedEnd
  ]);

  useEffect(() => {
    if (!diagnosticsOpen) return undefined;
    let active = true;
    const loadErrors = async () => {
      setDiagnosticMessage('');
      try {
        const [payload, smtpPayload] = await Promise.all([
          adminApi.getDeliverabilityErrors(),
          adminApi.getSmtpLogs(40)
        ]);
        if (active) {
          setErrors(payload);
          setSmtpLogs(smtpPayload.items || []);
        }
      } catch (error) {
        if (active) {
          setDiagnosticMessage(error instanceof Error ? error.message : 'Failed to load error log.');
        }
      }
    };
    void loadErrors();
    return () => {
      active = false;
    };
  }, [diagnosticsOpen]);

  useEffect(() => {
    if (!suppressedOpen) return undefined;
    let active = true;
    const loadSuppressed = async () => {
      setModalError('');
      try {
        const payload = await adminApi.getSuppressedLeads({
          page: suppressedPage,
          limit: 12,
          reason: suppressedReason === 'all' ? undefined : suppressedReason,
          search: suppressedSearch || undefined,
          source: suppressedSource || undefined,
          country: suppressedCountry || undefined,
          start: suppressedStart || undefined,
          end: suppressedEnd || undefined
        });
        if (active) {
          setSuppressed(payload);
        }
      } catch (error) {
        if (active) {
          setModalError(error instanceof Error ? error.message : 'Failed to load suppressed emails.');
        }
      }
    };
    void loadSuppressed();
    return () => {
      active = false;
    };
  }, [
    suppressedOpen,
    suppressedPage,
    suppressedReason,
    suppressedSearch,
    suppressedSource,
    suppressedCountry,
    suppressedStart,
    suppressedEnd
  ]);

  const pushToast = (message: string, tone: 'success' | 'error' = 'success') => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2500);
  };

  const openChecklist = async () => {
    setChecklistOpen(true);
    setModalError('');
    try {
      const payload = await adminApi.getDeliverabilityChecklist();
      setChecklist(payload);
      setConfigStatus({
        smtpConfigured: payload.config.smtpConfigured,
        publicUrl: payload.config.publicUrl,
        publicUrlIsHttps: payload.config.publicUrlIsHttps
      });
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Failed to load checklist.');
    }
  };

  const saveDnsSettings = async () => {
    setDnsSaveMessage('');
    try {
      await adminApi.updateSettings({
        deliverabilityDomain: dnsDomain.trim(),
        dkimSelector: dkimSelector.trim()
      });
      const nextStatus = await adminApi.getDeliverabilityStatus();
      setStatus(nextStatus);
      setDnsSaveMessage('DNS settings saved.');
      window.setTimeout(() => setDnsSaveMessage(''), 2000);
      pushToast('DNS settings saved.', 'success');
    } catch (error) {
      setDnsSaveMessage(error instanceof Error ? error.message : 'Failed to save DNS settings.');
      window.setTimeout(() => setDnsSaveMessage(''), 3000);
      pushToast('Failed to save DNS settings.', 'error');
    }
  };

  const openSuppressed = () => {
    setSuppressedOpen(true);
  };

  const openDiagnostics = () => {
    setDiagnosticsOpen(true);
    setDiagnosticMessage('');
  };

  const refreshStatus = async () => {
    setStatusRefreshing(true);
    setRefreshMessage('');
    try {
      const payload = await adminApi.getDeliverabilityStatus();
      setStatus(payload);
      setRefreshMessage('Checks refreshed.');
      window.setTimeout(() => setRefreshMessage(''), 2000);
      pushToast('Checks refreshed.', 'success');
    } catch {
      setErrorMessage('Failed to refresh deliverability status.');
      pushToast('Failed to refresh checks.', 'error');
    } finally {
      setStatusRefreshing(false);
    }
  };

  const toggleLive = async () => {
    const next = !liveEnabled;
    setLiveEnabled(next);
    try {
      await adminApi.updateSettings({ deliverabilityLive: next });
    } catch {
      setErrorMessage('Failed to update live refresh setting.');
    }
  };

  const dnsRecords = [
    { id: 'spf', label: 'SPF', value: checklist?.recordTemplates?.spf || 'v=spf1 include:your-smtp.com ~all' },
    { id: 'dkim', label: 'DKIM', value: checklist?.recordTemplates?.dkim || 'selector._domainkey.yourdomain.com TXT "k=rsa; p=YOUR_PUBLIC_KEY"' },
    { id: 'dmarc', label: 'DMARC', value: checklist?.recordTemplates?.dmarc || '_dmarc.yourdomain.com TXT "v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com"' }
  ];

  const copyRecord = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage('Record copied.');
      window.setTimeout(() => setCopyMessage(''), 2000);
      pushToast('Record copied.', 'success');
    } catch {
      setCopyMessage('Copy failed. Please copy manually.');
      window.setTimeout(() => setCopyMessage(''), 2000);
      pushToast('Copy failed. Please copy manually.', 'error');
    }
  };

  const copyAllRecords = async () => {
    const all = dnsRecords
      .map((record) => `${record.label}: ${record.value}`)
      .join('\n');
    await copyRecord(all);
  };

  const acknowledgeChecklist = async (itemId: string) => {
    if (!checklist) return;
    try {
      const payload = await adminApi.acknowledgeDeliverabilityChecklist({ itemId });
      setChecklist({
        ...checklist,
        acknowledgements: {
          ...checklist.acknowledgements,
          [itemId]: { acknowledgedAt: payload.acknowledgedAt, acknowledgedBy: null }
        }
      });
      pushToast('Checklist item acknowledged.', 'success');
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Failed to update checklist.');
      pushToast('Failed to update checklist.', 'error');
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail.trim()) {
      setDiagnosticMessage('Provide a test email address.');
      return;
    }
    setDiagnosticLoading(true);
    setDiagnosticMessage('');
    try {
      await adminApi.testSmtp(testEmail.trim());
      setDiagnosticMessage('Test email sent.');
      setSmtpLastKnownGood(true);
      pushToast('Test email sent.', 'success');
    } catch (error) {
      setDiagnosticMessage(error instanceof Error ? error.message : 'Failed to send test email.');
      pushToast('Failed to send test email.', 'error');
    } finally {
      setDiagnosticLoading(false);
    }
  };

  const updateSuppressedItem = (id: string) => {
    if (!suppressed) return;
    setSuppressed({
      ...suppressed,
      items: suppressed.items.filter((item) => item.id !== id),
      total: Math.max(0, suppressed.total - 1)
    });
  };

  const reinstateLead = async (id: string) => {
    setSuppressedAction(id);
    setModalError('');
    try {
      await adminApi.reinstateSuppressedLead(id);
      updateSuppressedItem(id);
      pushToast('Lead reinstated.', 'success');
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Failed to reinstate lead.');
      pushToast('Failed to reinstate lead.', 'error');
    } finally {
      setSuppressedAction(null);
    }
  };

  const clearInvalidLead = async (id: string) => {
    setSuppressedAction(id);
    setModalError('');
    try {
      await adminApi.clearInvalidSuppressedLead(id);
      updateSuppressedItem(id);
      pushToast('Invalid flag cleared.', 'success');
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Failed to clear invalid flag.');
      pushToast('Failed to clear invalid flag.', 'error');
    } finally {
      setSuppressedAction(null);
    }
  };

  const exportSuppressed = async () => {
    setExportingSuppressed(true);
    try {
      const params = new URLSearchParams();
      if (suppressedReason !== 'all') params.set('reason', suppressedReason);
      if (suppressedSearch) params.set('search', suppressedSearch);
      if (suppressedSource) params.set('source', suppressedSource);
      if (suppressedCountry) params.set('country', suppressedCountry);
      if (suppressedStart) params.set('start', suppressedStart);
      if (suppressedEnd) params.set('end', suppressedEnd);
      params.set('limit', '5000');
      const sessionToken =
        sessionStorage.getItem('boss-admin-session') || localStorage.getItem('boss-admin-session') || '';
      const adminToken =
        (import.meta as { env?: { VITE_ADMIN_TOKEN?: string } }).env?.VITE_ADMIN_TOKEN || '';
      if (sessionToken) params.set('adminSession', sessionToken);
      if (adminToken) params.set('adminToken', adminToken);
      const response = await fetch(`/api/admin/deliverability/suppressed/export?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to export suppressed list.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'suppressed-emails.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      pushToast('Export ready.', 'success');
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Failed to export suppressed list.');
      pushToast('Failed to export suppressed list.', 'error');
    } finally {
      setExportingSuppressed(false);
    }
  };

  // Translate SPF/DKIM/DMARC coverage into a simple health indicator.
  const health = useMemo(() => {
    const configured = [status?.spfConfigured, status?.dkimConfigured, status?.dmarcConfigured].filter(Boolean)
      .length;
    if (configured >= 3) return { label: 'Healthy', tone: 'emerald' };
    if (configured === 2) return { label: 'Needs Attention', tone: 'amber' };
    return { label: 'Critical', tone: 'rose' };
  }, [status]);

  const toneClass = (tone: 'emerald' | 'amber' | 'rose') => {
    if (tone === 'emerald') return 'text-emerald-300';
    if (tone === 'amber') return 'text-amber-300';
    return 'text-rose-300';
  };

  const renderSparkline = (values: number[]) => {
    if (!values.length) return null;
    const width = 140;
    const height = 40;
    const max = Math.max(...values, 1);
    const points = values.map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * (width - 2) + 1;
      const y = height - (value / max) * (height - 6) - 3;
      return `${x},${y}`;
    }).join(' ');
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-sky-400">
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={points}
        />
      </svg>
    );
  };

  return (
    <AdminShell>
      {toasts.length ? (
        <div className="fixed right-6 top-6 z-50 flex flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-xl border px-4 py-2 text-xs shadow-lg ${
                toast.tone === 'success'
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                  : 'border-rose-400/30 bg-rose-500/10 text-rose-100'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      ) : null}
      <div className="space-y-8 rounded-3xl border border-slate-900 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/70 p-4 shadow-xl sm:p-6">
        <section className="relative overflow-hidden rounded-3xl border border-slate-900 bg-gradient-to-br from-slate-950 via-slate-950 to-sky-900 px-6 py-8 text-slate-100 shadow-lg">
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-[-10%] h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-200">Deliverability</p>
            <h1 className="mt-3 text-3xl font-semibold">Protect your sender reputation</h1>
            <p className="mt-3 max-w-2xl text-sm text-sky-100/80">
              Monitor SPF/DKIM/DMARC coverage, catch risky gaps early, and keep your emails landing where they belong.
            </p>
            <div className="mt-4">
              <Button
                size="sm"
                variant="outline"
                className={actionButtonClass}
                onClick={toggleLive}
              >
                Live: {liveEnabled ? 'On' : 'Off'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={`ml-2 ${neutralButtonClass}`}
                disabled={statusRefreshing}
                onClick={refreshStatus}
              >
                {statusRefreshing ? 'Refreshing...' : 'Refresh checks'}
              </Button>
              {refreshMessage ? (
                <span className="ml-3 text-xs text-emerald-200">{refreshMessage}</span>
              ) : null}
            </div>
          </div>
        </section>

        {errorMessage ? <Card className="p-4 text-sm text-red-600">{errorMessage}</Card> : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              label: 'Deliverability Health',
              value: loading ? '...' : health.label,
              tone: health.tone
            },
            {
              label: 'SPF',
              value: loading ? '...' : status?.spfConfigured ? 'Configured' : 'Missing',
              tone: status?.spfConfigured ? 'emerald' : 'rose'
            },
            {
              label: 'DKIM',
              value: loading ? '...' : status?.dkimConfigured ? 'Configured' : 'Missing',
              tone: status?.dkimConfigured ? 'emerald' : 'rose'
            },
            {
              label: 'DMARC',
              value: loading ? '...' : status?.dmarcConfigured ? 'Configured' : 'Missing',
              tone: status?.dmarcConfigured ? 'emerald' : 'rose'
            }
          ].map((item) => (
            <Card key={item.label} className="p-4 border border-slate-800 bg-slate-950/90 shadow-md">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">
                {item.label}
              </p>
              <p className={`mt-3 text-2xl font-semibold ${toneClass(item.tone as 'emerald' | 'amber' | 'rose')}`}>
                {item.value}
              </p>
            </Card>
          ))}
        </div>

        <Card className="p-6 border border-slate-800 bg-slate-950/90 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Deliverability trends</h3>
              <p className="mt-2 text-sm text-sky-100">
                Track send outcomes and delivery quality over time.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-sky-100">
              <span>Window</span>
              <select
                value={trendWindow}
                onChange={(event) => setTrendWindow(Number(event.target.value))}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-sky-100"
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Delivery rate', value: `${trends?.summary?.deliveryRate ?? 0}%`, trend: trends?.series?.sent },
              { label: 'Failure rate', value: `${trends?.summary?.failureRate ?? 0}%`, trend: trends?.series?.failed },
              { label: 'Skip rate', value: `${trends?.summary?.skipRate ?? 0}%`, trend: trends?.series?.skipped },
              { label: 'Queued', value: (trends?.summary?.totals?.queued ?? 0).toLocaleString(), trend: trends?.series?.queued }
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-300">{item.label}</p>
                <p className="mt-2 text-xl font-semibold text-sky-100">{item.value}</p>
                <div className="mt-3">{renderSparkline(item.trend || [])}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 space-y-6 border border-slate-800 bg-slate-950/90 shadow-md">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">
              Configure SPF, DKIM, DMARC
            </h3>
            <p className="mt-2 text-sm text-sky-100">
              These DNS records protect your sender reputation and help inbox providers trust your campaigns.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <h4 className="text-sm font-semibold text-slate-100">SPF</h4>
              <p className="mt-2 text-xs text-sky-100/80">
                Authorize your SMTP host to send on behalf of your domain.
              </p>
              <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs text-sky-100">
{dnsRecords[0]?.value || 'v=spf1 include:your-smtp.com ~all'}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className={`mt-3 ${neutralButtonClass}`}
                onClick={() => copyRecord(dnsRecords[0]?.value || 'v=spf1 include:your-smtp.com ~all')}
              >
                Copy SPF
              </Button>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-100">DKIM</h4>
              <p className="mt-2 text-xs text-sky-100/80">
                Publish the DKIM TXT record from your SMTP provider.
              </p>
              <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs text-sky-100">
{dnsRecords[1]?.value || 'selector._domainkey.yourdomain.com TXT "k=rsa; p=YOUR_PUBLIC_KEY"'}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className={`mt-3 ${neutralButtonClass}`}
                onClick={() => copyRecord(dnsRecords[1]?.value || 'selector._domainkey.yourdomain.com TXT "k=rsa; p=YOUR_PUBLIC_KEY"')}
              >
                Copy DKIM
              </Button>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-100">DMARC</h4>
              <p className="mt-2 text-xs text-sky-100/80">
                Tell providers how to handle messages that fail SPF/DKIM.
              </p>
              <pre className="mt-3 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs text-sky-100">
{dnsRecords[2]?.value || '_dmarc.yourdomain.com TXT "v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com"'}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className={`mt-3 ${neutralButtonClass}`}
                onClick={() => copyRecord(dnsRecords[2]?.value || '_dmarc.yourdomain.com TXT "v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com"')}
              >
                Copy DMARC
              </Button>
            </div>
          </div>
          <div className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-900/85 p-4 text-xs text-sky-100/80">
            <p className="text-xs uppercase tracking-[0.3em] text-sky-300">DNS lookup detail</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span>Domain</span>
                  <span className="text-sky-100">{status?.details?.domain || 'Not set'}</span>
                </div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span>DKIM selector</span>
                  <span className="text-sky-100">{status?.details?.selector || 'Not set'}</span>
                </div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span>Last checked</span>
                  <span className="text-sky-100">
                    {status?.details?.lastCheckedAt ? new Date(status.details.lastCheckedAt).toLocaleString() : '—'}
                  </span>
                </div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span>SPF host</span>
                  <span className="text-sky-100">{status?.details?.spfHost || '—'}</span>
                </div>
                <p className={`mt-1 text-xs ${status?.details?.spfCheck === 'ok' ? 'text-emerald-200' : status?.details?.spfCheck === 'missing' ? 'text-rose-200' : 'text-amber-200'}`}>
                  {status?.details?.spfCheck ? `Check: ${status.details.spfCheck}` : 'Check: unavailable'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span>DKIM host</span>
                  <span className="text-sky-100">{status?.details?.dkimHost || '—'}</span>
                </div>
                <p className={`mt-1 text-xs ${status?.details?.dkimCheck === 'ok' ? 'text-emerald-200' : status?.details?.dkimCheck === 'missing' ? 'text-rose-200' : 'text-amber-200'}`}>
                  {status?.details?.dkimCheck ? `Check: ${status.details.dkimCheck}` : 'Check: unavailable'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span>DMARC host</span>
                  <span className="text-sky-100">{status?.details?.dmarcHost || '—'}</span>
                </div>
                <p className={`mt-1 text-xs ${status?.details?.dmarcCheck === 'ok' ? 'text-emerald-200' : status?.details?.dmarcCheck === 'missing' ? 'text-rose-200' : 'text-amber-200'}`}>
                  {status?.details?.dmarcCheck ? `Check: ${status.details.dmarcCheck}` : 'Check: unavailable'}
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 text-xs text-sky-100">
            <p className="text-xs uppercase tracking-[0.3em] text-sky-300">DNS Lookup Settings</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs text-sky-100/80">
                <span className="font-medium text-sky-100">Deliverability domain</span>
                <input
                  value={dnsDomain}
                  onChange={(event) => setDnsDomain(event.target.value)}
                  placeholder="example.com"
                  className="w-full rounded-xl border border-slate-600 bg-slate-900/90 px-4 py-3 text-sm text-sky-100 shadow-sm placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
              </label>
              <label className="grid gap-1 text-xs text-sky-100/80">
                <span className="font-medium text-sky-100">DKIM selector</span>
                <input
                  value={dkimSelector}
                  onChange={(event) => setDkimSelector(event.target.value)}
                  placeholder="selector"
                  className="w-full rounded-xl border border-slate-600 bg-slate-900/90 px-4 py-3 text-sm text-sky-100 shadow-sm placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                className={neutralButtonClass}
                onClick={saveDnsSettings}
              >
                Save DNS settings
              </Button>
              {dnsSaveMessage ? <span className="text-xs text-sky-100/80">{dnsSaveMessage}</span> : null}
            </div>
          </div>
          <div className="grid gap-4 text-xs text-sky-100/80 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-sky-300">SMTP</p>
              <p className="mt-2 text-sm text-sky-100">
                {configStatus?.smtpConfigured ? 'Configured' : 'Missing'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-sky-300">PUBLIC_URL</p>
              <p className="mt-2 text-sm text-sky-100 break-words">
                {configStatus?.publicUrl || 'Not set'}
              </p>
              <p className={`mt-1 text-xs ${configStatus?.publicUrlIsHttps ? 'text-emerald-200' : 'text-amber-200'}`}>
                {configStatus?.publicUrlIsHttps ? 'HTTPS enabled' : 'Not HTTPS'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4 text-xs text-sky-100/80">
            <span>
              Update DNS here to refresh checks, or adjust environment flags if you manage deploy settings directly.
            </span>
            <Button
              size="sm"
              variant="outline"
              className={actionButtonClass}
              onClick={openChecklist}
            >
              Open DNS Checklist
            </Button>
          </div>
        </Card>

        <Card className="p-6 border border-slate-800 bg-slate-950/90 shadow-md">
          <h3 className="text-lg font-semibold text-slate-100">List Hygiene</h3>
          <p className="mt-2 text-sm text-sky-100">
            Suppress invalid email addresses automatically after repeated failures.
          </p>
          <Button
            className={`mt-4 ${actionButtonClass}`}
            variant="outline"
            onClick={openSuppressed}
          >
            Review Suppressed Emails
          </Button>
        </Card>

        <Card className="p-6 border border-slate-800 bg-slate-950/90 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">SMTP diagnostics</h3>
              <p className="mt-2 text-sm text-sky-100">
                Send a test email and review recent delivery failures.
              </p>
            </div>
            <Button
              className={actionButtonClass}
              variant="outline"
              onClick={openDiagnostics}
            >
              Open diagnostics
            </Button>
          </div>
        </Card>
      </div>

      <AdminModal
        title="SMTP diagnostics"
        open={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
        hideFooter
        tone="dark"
      >
        <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
          {diagnosticMessage ? (
            <Card className="p-3 text-sm text-sky-100">{diagnosticMessage}</Card>
          ) : null}
          <div className="grid gap-3 text-sm text-sky-100">
            <div className="grid gap-2 rounded-xl border border-slate-700 bg-slate-900/90 p-3 text-xs text-sky-100">
              <p className="text-xs uppercase tracking-[0.3em] text-sky-300">SMTP status</p>
              <div className="flex items-center justify-between">
                <span>Configured</span>
                <span className={configStatus?.smtpConfigured ? 'text-emerald-200' : 'text-rose-200'}>
                  {configStatus?.smtpConfigured ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Last known good</span>
                <span className={smtpLastKnownGood ? 'text-emerald-200' : 'text-amber-200'}>
                  {smtpLastKnownGood ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Backup snapshot</span>
                <span className={smtpHasBackup ? 'text-emerald-200' : 'text-amber-200'}>
                  {smtpHasBackup ? 'Available' : 'None'}
                </span>
              </div>
            </div>
            <label className="grid gap-1 text-xs text-sky-100/80">
              Test email address
              <div className="flex flex-wrap gap-2">
                <input
                  value={testEmail}
                  onChange={(event) => setTestEmail(event.target.value)}
                  placeholder="name@example.com"
                  className="flex-1 rounded-lg border border-slate-600 bg-slate-900/90 px-3 py-2 text-sm text-sky-100 placeholder:text-slate-400"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className={neutralButtonClass}
                  disabled={diagnosticLoading}
                  onClick={sendTestEmail}
                >
                  {diagnosticLoading ? 'Sending...' : 'Send test'}
                </Button>
              </div>
            </label>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Recent failures</p>
              <div className="mt-3 grid gap-2">
                {errors.length ? errors.map((error) => (
                  <div
                    key={error.id}
                    className="rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-3 text-xs text-sky-100"
                  >
                    <p className="font-semibold">{error.message}</p>
                    <p className="mt-1 text-sky-100/70">
                      {error.createdAt ? new Date(error.createdAt).toLocaleString() : 'Unknown time'}
                    </p>
                  </div>
                )) : (
                  <Card className="p-3 text-xs text-slate-900 bg-white border border-slate-200">
                    No recent failures.
                  </Card>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-sky-300">SMTP log</p>
              <div className="mt-3 grid gap-2">
                {smtpLogs.length ? smtpLogs.map((entry, index) => (
                  <div
                    key={`${entry.createdAt}-${index}`}
                    className="rounded-xl border border-slate-700 bg-slate-900/95 px-3 py-3 text-xs text-sky-100"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={entry.type === 'error' ? 'text-rose-200' : 'text-emerald-200'}>
                        {entry.type === 'error' ? 'Error' : 'Info'}
                      </span>
                      <span className="text-sky-100/70">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Unknown time'}
                      </span>
                    </div>
                    <p className="mt-1 text-sky-100/80">{entry.message}</p>
                  </div>
                )) : (
                  <Card className="p-3 text-xs text-sky-100/80">No SMTP logs yet.</Card>
                )}
              </div>
            </div>
          </div>
        </div>
      </AdminModal>

      <AdminModal
        title="Deliverability checklist"
        open={checklistOpen}
        onClose={() => setChecklistOpen(false)}
        hideFooter
        tone="dark"
      >
        <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
          {modalError ? (
            <Card className="p-3 text-sm text-rose-200">{modalError}</Card>
          ) : null}
          {copyMessage ? (
            <Card className="p-3 text-sm text-emerald-200">{copyMessage}</Card>
          ) : null}
          <div className="space-y-4 text-sm text-sky-100">
            <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Checklist status</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {checklist?.recommendations?.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-600 bg-slate-900/95 px-4 py-3"
                >
                  <div>
                    <p>{item.label}</p>
                    {checklist?.acknowledgements?.[item.id]?.acknowledgedAt ? (
                      <p className="text-xs text-sky-200/80">
                        Noted {new Date(checklist.acknowledgements[item.id].acknowledgedAt).toLocaleDateString()}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`${item.ok ? 'text-emerald-200' : 'text-rose-200'} whitespace-nowrap`}>
                      {item.ok ? 'Done' : 'Pending'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className={`min-w-[120px] ${neutralButtonClass}`}
                      onClick={() => acknowledgeChecklist(item.id)}
                    >
                      Acknowledge
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-600 bg-slate-900/95 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.3em] text-sky-300">DNS record copies</p>
                <span className="text-xs text-sky-100/70">
                  Provider: {checklist?.provider?.name || 'Unknown'}
                </span>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className={neutralButtonClass}
                  onClick={copyAllRecords}
                >
                  Copy all
                </Button>
              </div>
              <div className="mt-3 grid gap-3">
                {dnsRecords.map((record) => (
                    <div
                      key={record.id}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-3 text-xs text-sky-100"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sky-200">{record.label}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className={neutralButtonClass}
                          onClick={() => copyRecord(record.value)}
                        >
                          Copy
                        </Button>
                    </div>
                    <div className="mt-2 break-words text-sky-100/90">{record.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-600 bg-slate-900/95 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-sky-300">Config snapshot</p>
              <div className="mt-3 grid gap-3 text-xs text-sky-100/90 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
                  <span>SMTP configured</span>
                  <span className={checklist?.config?.smtpConfigured ? 'text-emerald-200' : 'text-rose-200'}>
                    {checklist?.config?.smtpConfigured ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
                  <span>HTTPS</span>
                  <span className={checklist?.config?.publicUrlIsHttps ? 'text-emerald-200' : 'text-rose-200'}>
                    {checklist?.config?.publicUrlIsHttps ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 sm:col-span-2">
                  <span>PUBLIC_URL</span>
                  <span className="text-sky-200">{checklist?.config?.publicUrl || 'Not set'}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
                  <span>Send rate/min</span>
                  <span className="text-sky-200">{checklist?.config?.sendRatePerMinute ?? '-'}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
                  <span>Send rate/hour</span>
                  <span className="text-sky-200">{checklist?.config?.sendRatePerHour ?? '-'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AdminModal>

      <AdminModal
        title="Suppressed emails"
        open={suppressedOpen}
        onClose={() => setSuppressedOpen(false)}
        hideFooter
        tone="dark"
      >
        <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
          {modalError ? (
            <Card className="p-3 text-sm text-rose-200">{modalError}</Card>
          ) : null}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-sky-100/90">
              <span className="text-xs uppercase tracking-[0.3em] text-sky-300">Filters</span>
              <Button
                size="sm"
                variant="outline"
                className={neutralButtonClass}
                disabled={exportingSuppressed}
                onClick={exportSuppressed}
              >
                {exportingSuppressed ? 'Exporting...' : 'Export CSV'}
              </Button>
            </div>
            <div className="grid gap-4 text-xs text-sky-100/90 sm:grid-cols-2">
              <label className="grid min-w-0 gap-1">
                Search email/name
                <input
                  value={suppressedSearch}
                  onChange={(event) => {
                    setSuppressedPage(1);
                    setSuppressedSearch(event.target.value);
                  }}
                  placeholder="Search..."
                  className="w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900/90 px-3 py-2 text-sm text-sky-100 placeholder:text-slate-400"
                />
              </label>
              <label className="grid min-w-0 gap-1">
                Reason
                <select
                  value={suppressedReason}
                  onChange={(event) => {
                    setSuppressedPage(1);
                    setSuppressedReason(event.target.value as typeof suppressedReason);
                  }}
                  className="w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900/90 px-3 py-2 text-sm text-sky-100"
                >
                  <option value="all">All</option>
                  <option value="unsubscribed">Unsubscribed</option>
                  <option value="email_invalid">Invalid email</option>
                </select>
              </label>
              <label className="grid min-w-0 gap-1">
                Source
                <input
                  value={suppressedSource}
                  onChange={(event) => {
                    setSuppressedPage(1);
                    setSuppressedSource(event.target.value);
                  }}
                  placeholder="Source"
                  className="w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900/90 px-3 py-2 text-sm text-sky-100 placeholder:text-slate-400"
                />
              </label>
              <label className="grid min-w-0 gap-1">
                Country
                <input
                  value={suppressedCountry}
                  onChange={(event) => {
                    setSuppressedPage(1);
                    setSuppressedCountry(event.target.value);
                  }}
                  placeholder="Country"
                  className="w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900/90 px-3 py-2 text-sm text-sky-100 placeholder:text-slate-400"
                />
              </label>
              <label className="grid min-w-0 gap-1">
                Start date
                <input
                  type="date"
                  value={suppressedStart}
                  onChange={(event) => {
                    setSuppressedPage(1);
                    setSuppressedStart(event.target.value);
                  }}
                  className="w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900/90 px-3 py-2 text-sm text-sky-100"
                />
              </label>
              <label className="grid min-w-0 gap-1">
                End date
                <input
                  type="date"
                  value={suppressedEnd}
                  onChange={(event) => {
                    setSuppressedPage(1);
                    setSuppressedEnd(event.target.value);
                  }}
                  className="w-full min-w-0 rounded-lg border border-slate-600 bg-slate-900/90 px-3 py-2 text-sm text-sky-100"
                />
              </label>
            </div>
            {suppressed?.items?.length ? suppressed.items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-600 bg-slate-900/95 px-4 py-3 text-sm text-sky-100 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{item.email}</p>
                    <p className="text-xs text-sky-100/90">
                      {item.name || 'Unknown'} · {item.country || 'Unknown'} · {item.source || 'Unknown'}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-600 bg-slate-950 px-3 py-1 text-xs text-sky-100">
                    {item.reason === 'email_invalid' ? 'Invalid email' : 'Unsubscribed'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.reason === 'unsubscribed' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className={neutralButtonClass}
                      disabled={suppressedAction === item.id}
                      onClick={() => reinstateLead(item.id)}
                    >
                      {suppressedAction === item.id ? 'Working...' : 'Reinstate'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className={neutralButtonClass}
                      disabled={suppressedAction === item.id}
                      onClick={() => clearInvalidLead(item.id)}
                    >
                      {suppressedAction === item.id ? 'Working...' : 'Clear invalid'}
                    </Button>
                  )}
                </div>
              </div>
            )) : (
              <Card className="p-4 text-sm text-sky-100 bg-slate-900/90 border border-slate-600">
                {suppressed ? (
                  <div className="space-y-2 text-xs text-sky-100/80">
                    <p className="text-sm text-sky-100">No suppressed emails yet.</p>
                    <p>
                      Suppressed emails appear after unsubscribes or repeated send failures (3+ hard bounces).
                    </p>
                    <p>Try sending a test campaign to generate deliverability data.</p>
                  </div>
                ) : 'Loading suppressed emails...'}
              </Card>
            )}
            {suppressed ? (
              <div className="flex items-center justify-between text-xs text-sky-100/90">
                <span>
                  Page {suppressed.page} of {suppressed.totalPages} · {suppressed.total.toLocaleString()} total
                </span>
                <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className={`${neutralButtonClass} active:bg-slate-800`}
                  disabled={suppressed.page <= 1}
                  onClick={() => setSuppressedPage((current) => Math.max(1, current - 1))}
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={`${neutralButtonClass} active:bg-slate-800`}
                  disabled={suppressed.page >= suppressed.totalPages}
                  onClick={() => setSuppressedPage((current) => Math.min(suppressed.totalPages, current + 1))}
                >
                  Next
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </AdminModal>
    </AdminShell>
  );
}

