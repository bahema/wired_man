import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, AdminCampaign } from '../services/adminApi';

const statusLabels: Record<AdminCampaign['status'], string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed'
};

export default function BossCampaignsPage() {
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AdminCampaign['status']>('all');
  const [badgeFilter, setBadgeFilter] = useState<'all' | 'sent' | 'not_sent'>('all');
  const [statusMessage, setStatusMessage] = useState('');
  const statusTimerRef = React.useRef<number | null>(null);
  const errorTimerRef = React.useRef<number | null>(null);
  const hasShownErrorRef = React.useRef(false);

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const pollCampaignCompletion = async (campaignId: string) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const progress = await adminApi.getCampaignProgress(campaignId);
      if (
        progress.totalCount > 0 &&
        progress.queuedCount === 0 &&
        progress.processingCount === 0
      ) {
        return progress.failedCount > 0 ? 'failed' : 'sent';
      }
      await wait(3000);
    }
    return null;
  };

  const loadCampaigns = async (active?: { current: boolean }, options?: { withLoading?: boolean }) => {
    const withLoading = options?.withLoading !== false;
    if (withLoading) {
      setListLoading(true);
    }
    setErrorMessage('');
    try {
      const fetchStatus = badgeFilter === 'not_sent' ? undefined : (statusFilter === 'all' ? undefined : statusFilter);
      const data = await adminApi.getCampaigns(fetchStatus);
      if (!active || active.current) {
        setCampaigns(data);
      }
    } catch (error) {
      if (!active || active.current) {
        if (!hasShownErrorRef.current) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load campaigns.');
          hasShownErrorRef.current = true;
        }
      }
    } finally {
      if ((!active || active.current) && withLoading) {
        setListLoading(false);
      }
    }
  };

  const deleteCampaign = async (campaign: AdminCampaign) => {
    if (!['draft', 'sent', 'failed', 'sending'].includes(campaign.status)) {
      setErrorMessage('Only draft, sent, sending, or failed campaigns can be deleted.');
      return;
    }
    if (!window.confirm(`Delete "${campaign.name}"? This cannot be undone.`)) return;
    setActionLoading(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      await adminApi.deleteCampaign(campaign.id);
      setStatusMessage('Draft deleted.');
      await loadCampaigns(undefined, { withLoading: false });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete campaign.');
    } finally {
      setActionLoading(false);
    }
  };

  const sendNow = async (campaign: AdminCampaign) => {
    if (campaign.status !== 'draft') {
      setErrorMessage('Only draft campaigns can be sent immediately.');
      return;
    }
    if (!window.confirm(`Send "${campaign.name}" now?`)) return;
    setActionLoading(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      await adminApi.sendCampaignNow(campaign.id);
      setStatusMessage('Campaign queued for sending.');
      await loadCampaigns(undefined, { withLoading: false });
      const completion = await pollCampaignCompletion(campaign.id);
      if (completion === 'sent') {
        setStatusMessage('Campaign sent.');
        await loadCampaigns(undefined, { withLoading: false });
      } else if (completion === 'failed') {
        setStatusMessage('Campaign finished with failures.');
        await loadCampaigns(undefined, { withLoading: false });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send campaign.');
    } finally {
      setActionLoading(false);
    }
  };

  const applyStatusFilter = (value: typeof statusFilter) => {
    setStatusFilter(value);
    setBadgeFilter('all');
  };

  const applyBadgeFilter = (value: 'sent' | 'not_sent') => {
    setBadgeFilter(value);
    if (value === 'sent') {
      setStatusFilter('sent');
    } else {
      setStatusFilter('all');
    }
  };

  const visibleCampaigns = badgeFilter === 'not_sent'
    ? campaigns.filter((campaign) => campaign.status !== 'sent')
    : badgeFilter === 'sent'
      ? campaigns.filter((campaign) => campaign.status === 'sent')
      : campaigns;

  useEffect(() => {
    const active = { current: true };
    void loadCampaigns(active);
    return () => {
      active.current = false;
    };
  }, [statusFilter, badgeFilter]);

  useEffect(() => {
    if (!statusMessage) return;
    if (statusTimerRef.current) {
      window.clearTimeout(statusTimerRef.current);
    }
    statusTimerRef.current = window.setTimeout(() => {
      setStatusMessage('');
      statusTimerRef.current = null;
    }, 4000);
    return () => {
      if (statusTimerRef.current) {
        window.clearTimeout(statusTimerRef.current);
      }
    };
  }, [statusMessage]);

  useEffect(() => {
    if (!errorMessage) return;
    if (errorTimerRef.current) {
      window.clearTimeout(errorTimerRef.current);
    }
    errorTimerRef.current = window.setTimeout(() => {
      setErrorMessage('');
      errorTimerRef.current = null;
    }, 4000);
    return () => {
      if (errorTimerRef.current) {
        window.clearTimeout(errorTimerRef.current);
      }
    };
  }, [errorMessage]);

  return (
    <AdminShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Campaigns</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Launch and monitor template-based campaigns.
            </p>
          </div>
          <Link to="/boss/campaigns/new">
            <Button>Create Campaign</Button>
          </Link>
        </div>

        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
              <span className="font-medium text-text">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => applyStatusFilter(event.target.value as typeof statusFilter)}
                className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
              >
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="sending">Sending</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <div className="flex flex-wrap items-end gap-2 text-xs">
              {(['all', 'sent', 'not_sent'] as const).map((value) => {
                const active = badgeFilter === value;
                const label = value === 'all' ? 'All' : value === 'sent' ? 'Sent' : 'Not sent';
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => (value === 'all' ? applyStatusFilter('all') : applyBadgeFilter(value))}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        <div className="min-h-[24px] space-y-2">
          {errorMessage ? (
            <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
          ) : null}
          {statusMessage ? (
            <Card className="p-4 text-sm text-emerald-700">{statusMessage}</Card>
          ) : null}
        </div>

        <div className="grid gap-2">
          {visibleCampaigns.map((campaign) => (
            <Card key={campaign.id} className="p-3" hover={false}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {campaign.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Created {new Date(campaign.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => applyStatusFilter(campaign.status)}
                    className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-300"
                  >
                    {statusLabels[campaign.status]}
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBadgeFilter(campaign.status === 'sent' ? 'sent' : 'not_sent')}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      campaign.status === 'sent'
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {campaign.status === 'sent' ? 'Sent' : 'Not sent'}
                  </button>
                </div>
              </div>
              <Link to={`/boss/campaigns/${campaign.id}`} className="mt-3 block text-xs text-slate-500">
                <div className="flex flex-wrap gap-4 transition hover:text-slate-700">
                  <div>Sent: {campaign.sentCount || 0}</div>
                  <div>Failed: {campaign.failedCount || 0}</div>
                  <div>Queued: {campaign.queuedCount || 0}</div>
                  <div>Total: {campaign.totalCount || 0}</div>
                  <div>Confirmed: {campaign.confirmedAudienceCount ?? 0}</div>
                </div>
              </Link>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={`/boss/campaigns/${campaign.id}`}>
                  <Button size="sm" variant="secondary">Open</Button>
                </Link>
                {campaign.status === 'draft' ? (
                  <Button size="sm" variant="outline" onClick={() => sendNow(campaign)} disabled={actionLoading}>
                    Send Now
                  </Button>
                ) : null}
                {['draft', 'sent', 'failed', 'sending'].includes(campaign.status) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-600 bg-red-600 text-white hover:border-red-700 hover:bg-red-700"
                    onClick={() => deleteCampaign(campaign)}
                    disabled={actionLoading}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
          {!listLoading && visibleCampaigns.length === 0 ? (
            <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
              No campaigns yet. Create one from a template.
            </Card>
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}
