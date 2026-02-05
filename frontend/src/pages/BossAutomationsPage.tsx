import React, { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, AdminAutomation } from '../services/adminApi';

const STATUSES = ['active', 'paused', 'draft'] as const;
const TRIGGERS = ['signup', 'tag', 'topic', 'date'] as const;

const triggerLabel = (value: AdminAutomation['triggerType']) => {
  switch (value) {
    case 'signup':
      return 'Signup';
    case 'tag':
      return 'Tag Added';
    case 'topic':
      return 'Topic Selected';
    case 'date':
      return 'Date Based';
    default:
      return value;
  }
};

const statusLabel = (value: AdminAutomation['status']) => {
  switch (value) {
    case 'active':
      return 'Active';
    case 'paused':
      return 'Paused';
    case 'draft':
      return 'Draft';
    default:
      return value;
  }
};

export default function BossAutomationsPage() {
  const [automations, setAutomations] = useState<AdminAutomation[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | AdminAutomation['status']>('all');
  const [triggerFilter, setTriggerFilter] = useState<'all' | AdminAutomation['triggerType']>('all');
  const [errorMessage, setErrorMessage] = useState('');

  const filteredFlows = useMemo(() => {
    return automations.filter((flow) => {
      if (statusFilter !== 'all' && flow.status !== statusFilter) return false;
      if (triggerFilter !== 'all' && flow.triggerType !== triggerFilter) return false;
      return true;
    });
  }, [automations, statusFilter, triggerFilter]);

  const loadAutomations = async () => {
    try {
      const data = await adminApi.getAutomations();
      setAutomations(data);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load automations.');
    }
  };

  useEffect(() => {
    void loadAutomations();
  }, []);

  const toggleStatus = async (automation: AdminAutomation) => {
    try {
      if (automation.status === 'active') {
        await adminApi.pauseAutomation(automation.id);
      } else {
        await adminApi.activateAutomation(automation.id);
      }
      await loadAutomations();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update automation.');
    }
  };

  const duplicateFlow = async (automation: AdminAutomation) => {
    try {
      await adminApi.createAutomation({
        name: `${automation.name} (Copy)`,
        triggerType: automation.triggerType,
        triggerJson: automation.triggerJson || {},
        filterJson: automation.filterJson as any
      });
      await loadAutomations();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to duplicate automation.');
    }
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Automations</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Control your email sequences and drip flows.
            </p>
          </div>
          <Link to="/boss/automations/new">
            <Button>Create Automation</Button>
          </Link>
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3 text-xs">
            <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
              <span className="font-medium text-text">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
              >
                <option value="all">All</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
              <span className="font-medium text-text">Trigger</span>
              <select
                value={triggerFilter}
                onChange={(event) => setTriggerFilter(event.target.value as typeof triggerFilter)}
                className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
              >
                <option value="all">All</option>
                {TRIGGERS.map((trigger) => (
                  <option key={trigger} value={trigger}>
                    {triggerLabel(trigger)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Card>

        {errorMessage ? (
          <Card className="p-3 text-sm text-red-600">{errorMessage}</Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredFlows.map((flow) => (
            <Card key={flow.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{flow.name}</h3>
                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  flow.status === 'active'
                    ? 'bg-emerald-100 text-emerald-700'
                    : flow.status === 'paused'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-700'
                }`}>
                  {statusLabel(flow.status)}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Trigger: {triggerLabel(flow.triggerType)} · {flow.stepsCount ?? 0} steps
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                <div>Enrolled: 0</div>
                <div>Sent: 0</div>
                <div>Updated: {new Date(flow.updatedAt).toLocaleDateString()}</div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={`/boss/automations/${flow.id}`}>
                  <Button size="sm" variant="secondary">Open</Button>
                </Link>
                <Button size="sm" variant="outline" onClick={() => toggleStatus(flow)}>
                  {flow.status === 'active' ? 'Pause' : 'Resume'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => duplicateFlow(flow)}>
                  Duplicate
                </Button>
              </div>
            </Card>
          ))}
          {filteredFlows.length === 0 ? (
            <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
              No automations match your filters.
            </Card>
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}

