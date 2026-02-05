import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, AdminActivity, AdminExportFormat, AdminExportSchedule, AdminSourceDetail } from '../services/adminApi';
import AdminModal from '../components/admin/AdminModal';

const PAGE_LIMIT = 25;

export default function BossSourceDetailPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState<AdminSourceDetail | null>(null);
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activityFilter, setActivityFilter] = useState<'sources' | 'all'>('sources');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<AdminExportFormat>('csv');
  const [schedules, setSchedules] = useState<AdminExportSchedule[]>([]);
  const [scheduleFormat, setScheduleFormat] = useState<AdminExportFormat>('csv');
  const [scheduleFrequency, setScheduleFrequency] = useState<'daily' | 'weekly'>('weekly');
  const [scheduleRecipients, setScheduleRecipients] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [topicFilter, setTopicFilter] = useState('');

  const source = searchParams.get('source') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!source) {
        setErrorMessage('Missing source parameter.');
        return;
      }
      setLoading(true);
      setErrorMessage('');
      try {
        const startIso = startDate ? `${startDate}T00:00:00.000Z` : '';
        const endIso = endDate ? `${endDate}T23:59:59.999Z` : '';
        const [response, activityLog, schedulesResponse] = await Promise.all([
          adminApi.getSourceDetail({
            source,
            page,
            limit: PAGE_LIMIT,
            start: startIso,
            end: endIso,
            country: countryFilter || undefined,
            topic: topicFilter || undefined
          }),
          adminApi.getAdminActivity({
            limit: 15,
            actionPrefix: activityFilter === 'sources' ? 'sources' : undefined
          }),
          adminApi.getSourceExportSchedules(source)
        ]);
        if (active) {
          setData(response);
          setActivity(activityLog);
          setSchedules(schedulesResponse);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load source.');
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
  }, [source, page, activityFilter, startDate, endDate, countryFilter, topicFilter]);

  const totals = useMemo(() => {
    const total = data?.totals?.total ?? 0;
    const last7d = data?.totals?.last7d ?? 0;
    const prev7d = data?.totals?.prev7d ?? 0;
    const growth = prev7d > 0 ? Math.round(((last7d - prev7d) / prev7d) * 100) : (last7d > 0 ? 100 : 0);
    return { total, last7d, prev7d, growth };
  }, [data]);

  const renderSparkline = (counts: number[]) => {
    if (!counts.length) return null;
    const max = Math.max(...counts, 1);
    const points = counts.map((value, index) => {
      const x = (index / (counts.length - 1 || 1)) * 100;
      const y = 40 - (value / max) * 40;
      return `${x},${y}`;
    }).join(' ');
    return (
      <svg viewBox="0 0 100 40" className="h-10 w-full">
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={points}
        />
      </svg>
    );
  };

  const setPage = useCallback((nextPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(nextPage));
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setPage(1);
  }, [startDate, endDate, countryFilter, topicFilter, setPage]);

  const runExport = async () => {
    if (!source) return;
    try {
      const startIso = startDate ? `${startDate}T00:00:00.000Z` : '';
      const endIso = endDate ? `${endDate}T23:59:59.999Z` : '';
      await adminApi.createSourceExport({
        source,
        format: exportFormat,
        start: startIso || undefined,
        end: endIso || undefined,
        country: countryFilter || undefined,
        topic: topicFilter || undefined
      });
      setExportDialogOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start export.');
    }
  };

  const createAutomation = async () => {
    if (!source) return;
    const name = window.prompt('Automation name', `Source: ${source}`);
    if (!name) return;
    try {
      const created = await adminApi.createAutomation({
        name,
        triggerType: 'signup',
        triggerJson: { source },
        filterJson: { sources: [source] }
      });
      navigate(`/boss/automations/${created.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create automation.');
    }
  };

  const createSchedule = async () => {
    if (!source) return;
    try {
      const schedule = await adminApi.createSourceExportSchedule({
        source,
        format: scheduleFormat,
        frequency: scheduleFrequency,
        recipients: scheduleRecipients
      });
      setSchedules((current) => [schedule, ...current]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to schedule export.');
    }
  };

  const deleteSchedule = async (id: string) => {
    try {
      await adminApi.deleteSourceExportSchedule(id);
      setSchedules((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete schedule.');
    }
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Sources</p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {source || 'Source'} signups
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Subscribers attributed to this signup source.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/boss/sources">
              <Button variant="outline">Back to Sources</Button>
            </Link>
            <Link to={`/boss/campaigns/new?source=${encodeURIComponent(source)}`}>
              <Button>Create Campaign</Button>
            </Link>
            <Button variant="outline" onClick={createAutomation}>Create Automation</Button>
            <Button variant="outline" onClick={() => setExportDialogOpen(true)}>Download</Button>
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
                {totals.total.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-panel-elevated p-4 text-center dark:border-slate-700/70 dark:bg-slate-900/80">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Last 7d</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {totals.last7d.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-panel-elevated p-4 text-center dark:border-slate-700/70 dark:bg-slate-900/80">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Prev 7d</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {totals.prev7d.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-panel-elevated p-4 text-center dark:border-slate-700/70 dark:bg-slate-900/80">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Growth</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {totals.growth >= 0 ? '+' : ''}{totals.growth}%
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
            <span>Performance trends</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              { label: 'Last 7 days', data: data?.trends?.last7d?.counts || [] },
              { label: 'Last 30 days', data: data?.trends?.last30d?.counts || [] },
              { label: 'Last 90 days', data: data?.trends?.last90d?.counts || [] }
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-300">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                <div className="mt-3 text-slate-700 dark:text-slate-200">
                  {renderSparkline(item.data)}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
            <span>Subscribers</span>
            <span>{data ? `${data.total.toLocaleString()} total` : '—'}</span>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-2">
            <label className="grid gap-2 text-xs text-slate-500">
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <label className="grid gap-2 text-xs text-slate-500">
              End date
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-2">
            <label className="grid gap-2 text-xs text-slate-500">
              Country
              <select
                value={countryFilter}
                onChange={(event) => setCountryFilter(event.target.value)}
                className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">All countries</option>
                {data?.facets?.countries?.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} ({item.count})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs text-slate-500">
              Topic
              <select
                value={topicFilter}
                onChange={(event) => setTopicFilter(event.target.value)}
                className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">All topics</option>
                {data?.facets?.topics?.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} ({item.count})
                  </option>
                ))}
              </select>
            </label>
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
                  {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '—'}
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-border-subtle p-4 text-center text-sm text-slate-500">
                {loading ? 'Loading subscribers...' : 'No subscribers found for this source.'}
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
                variant={activityFilter === 'sources' ? 'outline' : 'ghost'}
                onClick={() => setActivityFilter('sources')}
              >
                Sources only
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
                  {item.meta?.source ? String(item.meta.source) : ''}
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-border-subtle p-4 text-center text-sm text-slate-500">
                No recent activity.
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
            <span>Scheduled exports</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="grid gap-2 text-xs text-slate-500">
              Format
              <select
                value={scheduleFormat}
                onChange={(event) => setScheduleFormat(event.target.value as AdminExportFormat)}
                className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
                <option value="pdf">PDF</option>
                <option value="docx">DOCX</option>
              </select>
            </label>
            <label className="grid gap-2 text-xs text-slate-500">
              Frequency
              <select
                value={scheduleFrequency}
                onChange={(event) => setScheduleFrequency(event.target.value as 'daily' | 'weekly')}
                className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label className="grid gap-2 text-xs text-slate-500">
              Recipients
              <input
                value={scheduleRecipients}
                onChange={(event) => setScheduleRecipients(event.target.value)}
                placeholder="comma@domain.com, team@domain.com"
                className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-200/70 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <div className="flex items-end">
              <Button variant="outline" onClick={createSchedule}>Schedule export</Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300">
            {schedules.length ? schedules.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 dark:border-slate-700/70 dark:bg-slate-900/80"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {String(item.params?.format || 'csv').toUpperCase()} · {item.frequency}
                  </p>
                  <p className="text-xs text-slate-500">
                    Next run: {new Date(item.nextRunAt).toLocaleString()}
                  </p>
                  {item.params?.recipients ? (
                    <p className="text-xs text-slate-500">
                      Recipients: {String(item.params.recipients)}
                    </p>
                  ) : null}
                </div>
                <Button size="sm" variant="outline" onClick={() => deleteSchedule(item.id)}>
                  Delete
                </Button>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-border-subtle p-4 text-center text-sm text-slate-500">
                No schedules yet.
              </div>
            )}
          </div>
        </Card>
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
        <div className="mt-3 text-xs text-slate-500">
          Export will appear in the Sources list history shortly.
        </div>
      </AdminModal>
    </AdminShell>
  );
}
