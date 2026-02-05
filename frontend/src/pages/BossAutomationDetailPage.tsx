import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { adminApi, AdminAutomation, AdminEmailTemplate } from '../services/adminApi';

const TABS = ['Trigger', 'Audience', 'Sequence', 'Preview', 'Status'] as const;
const CONTINENTS = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
  'Antarctica'
];

type Step = {
  id: string;
  stepType: 'email' | 'delay';
  stepOrder: number;
  templateId?: string | null;
  subjectOverride?: string | null;
  htmlOverride?: string | null;
  delayMinutes?: number | null;
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

export default function BossAutomationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>('Trigger');
  const [automation, setAutomation] = useState<AdminAutomation | null>(null);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<AdminAutomation['status']>('draft');
  const [triggerType, setTriggerType] = useState<AdminAutomation['triggerType']>('signup');
  const [triggerDate, setTriggerDate] = useState('');
  const [topics, setTopics] = useState('');
  const [tags, setTags] = useState('');
  const [continents, setContinents] = useState<string[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [templates, setTemplates] = useState<AdminEmailTemplate[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [toastTone, setToastTone] = useState<'success' | 'info'>('success');
  const [saving, setSaving] = useState(false);
  const [newStepType, setNewStepType] = useState<'email' | 'delay'>('email');
  const [newStepTemplateId, setNewStepTemplateId] = useState('');
  const [newStepSubject, setNewStepSubject] = useState('');
  const [newStepDelayMinutes, setNewStepDelayMinutes] = useState(1440);
  const toLocalInput = (iso: string) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  };
  const toIsoFromLocal = (value: string) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
  };

  const showToast = (message: string, tone: 'success' | 'info' = 'success') => {
    setToastMessage(message);
    setToastTone(tone);
    window.setTimeout(() => setToastMessage(''), 3000);
  };

  const toggleContinent = (value: string) => {
    setContinents((prev) => (prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]));
  };

  const sequenceSteps = useMemo(() => steps, [steps]);

  const loadTemplates = async () => {
    const response = await adminApi.getEmailTemplates({ page: 1, limit: 50, sort: 'name_asc' });
    setTemplates(response.items);
    if (!newStepTemplateId && response.items.length) {
      setNewStepTemplateId(response.items[0].id);
    }
  };

  const loadAutomation = async (automationId: string) => {
    try {
      const data = await adminApi.getAutomation(automationId);
      setAutomation(data);
      setName(data.name);
      setStatus(data.status);
      setTriggerType(data.triggerType);
      const trigger = data.triggerJson || {};
      setTriggerDate(typeof (trigger as any).date === 'string' ? toLocalInput((trigger as any).date) : '');
      const filter = data.filterJson || {};
      setTopics(Array.isArray((filter as any).topics) ? (filter as any).topics.join(', ') : '');
      setTags(Array.isArray((filter as any).tags) ? (filter as any).tags.join(', ') : '');
      setContinents(Array.isArray((filter as any).continents) ? (filter as any).continents : []);
      const mappedSteps = data.steps.map((step) => ({
        id: step.id,
        stepType: step.stepType,
        stepOrder: step.stepOrder,
        templateId: step.templateId ?? null,
        subjectOverride: step.subjectOverride ?? null,
        htmlOverride: step.htmlOverride ?? null,
        delayMinutes: step.delayMinutes ?? null
      }));
      setSteps(mappedSteps);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load automation.');
    }
  };

  useEffect(() => {
    void loadTemplates();
    if (id) {
      void loadAutomation(id);
    }
  }, [id]);

  const saveAutomation = async () => {
    setSaving(true);
    setErrorMessage('');
    const filterJson = {
      topics: topics.split(',').map((item) => item.trim()).filter(Boolean),
      tags: tags.split(',').map((item) => item.trim()).filter(Boolean),
      continents
    };
    try {
      if (automation) {
        const updated = await adminApi.updateAutomation(automation.id, {
          name: name.trim() || automation.name,
          status,
          triggerType,
          triggerJson: triggerType === 'date' && triggerDate ? { date: toIsoFromLocal(triggerDate) } : {},
          filterJson
        });
        setAutomation(updated);
        showToast('Automation saved.');
      } else {
        const created = await adminApi.createAutomation({
          name: name.trim() || 'New automation',
          triggerType,
          triggerJson: triggerType === 'date' && triggerDate ? { date: toIsoFromLocal(triggerDate) } : {},
          filterJson
        });
        showToast('Automation created.');
        navigate(`/boss/automations/${created.id}`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save automation.');
    } finally {
      setSaving(false);
    }
  };

  const addStep = async () => {
    if (!automation) return;
    setSaving(true);
    setErrorMessage('');
    try {
      if (newStepType === 'email' && !newStepTemplateId) {
        setErrorMessage('Select a template for the email step.');
        setSaving(false);
        return;
      }
      const payload =
        newStepType === 'delay'
          ? {
            stepOrder: steps.length,
            stepType: 'delay' as const,
            delayMinutes: newStepDelayMinutes
          }
          : {
            stepOrder: steps.length,
            stepType: 'email' as const,
            templateId: newStepTemplateId,
            subjectOverride: newStepSubject || null
          };
      await adminApi.addAutomationStep(automation.id, payload);
      await loadAutomation(automation.id);
      showToast('Step added.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to add step.');
    } finally {
      setSaving(false);
    }
  };

  const deleteStep = async (stepId: string) => {
    if (!automation) return;
    setSaving(true);
    setErrorMessage('');
    try {
      await adminApi.deleteAutomationStep(stepId);
      await loadAutomation(automation.id);
      showToast('Step deleted.', 'info');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete step.');
    } finally {
      setSaving(false);
    }
  };

  const activateAutomation = async () => {
    if (!automation) return;
    setSaving(true);
    try {
      const updated = await adminApi.activateAutomation(automation.id);
      setAutomation(updated);
      setStatus(updated.status);
      showToast('Automation activated.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to activate automation.');
    } finally {
      setSaving(false);
    }
  };

  const pauseAutomation = async () => {
    if (!automation) return;
    setSaving(true);
    try {
      const updated = await adminApi.pauseAutomation(automation.id);
      setAutomation(updated);
      setStatus(updated.status);
      showToast('Automation paused.', 'info');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to pause automation.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500">
              <Link to="/boss/automations" className="hover:text-slate-700">Automations</Link> / {id || 'New'}
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Automation Builder</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Configure triggers, audience, and email steps.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
            <Button variant="secondary" onClick={saveAutomation} disabled={saving}>
              {saving ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button onClick={status === 'active' ? pauseAutomation : activateAutomation} disabled={saving}>
              {status === 'active' ? 'Pause' : 'Activate'}
            </Button>
          </div>
        </div>

        {errorMessage ? (
          <Card className="p-3 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {toastMessage ? (
          <Card
            className={`p-3 text-sm ${toastTone === 'success' ? 'text-emerald-700' : 'text-slate-600'}`}
          >
            {toastMessage}
          </Card>
        ) : null}

        <Card className="p-3">
          <div className="flex flex-wrap gap-2 text-xs">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  activeTab === tab ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </Card>

        {activeTab === 'Trigger' ? (
          <Card className="p-4 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Trigger</div>
            <Input
              label="Automation name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Welcome series"
            />
            <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
              <span className="font-medium text-text">Trigger type</span>
              <select
                value={triggerType}
                onChange={(event) => setTriggerType(event.target.value as AdminAutomation['triggerType'])}
                className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
              >
                <option value="signup">Signup</option>
                <option value="tag">Tag Added</option>
                <option value="topic">Topic Selected</option>
                <option value="date">Date Based</option>
              </select>
            </label>
            {triggerType === 'date' ? (
              <Input
                label="Trigger date"
                type="datetime-local"
                value={triggerDate}
                onChange={(event) => setTriggerDate(event.target.value)}
              />
            ) : null}
            <Input label="Trigger note" value="Trigger runs when the condition is met." readOnly />
          </Card>
        ) : null}

        {activeTab === 'Audience' ? (
          <Card className="p-4 space-y-4">
            <div className="text-sm font-semibold text-slate-900">Audience filters</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Topics (comma separated)"
                value={topics}
                onChange={(event) => setTopics(event.target.value)}
                placeholder="newsletter, promo"
              />
              <Input
                label="Tags (comma separated)"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="vip, affiliate"
              />
            </div>
            <div className="rounded-xl border border-border-subtle bg-panel-elevated p-3">
              <div className="text-xs font-semibold text-slate-900">Continents</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {CONTINENTS.map((continent) => (
                  <label key={continent} className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={continents.includes(continent)}
                      onChange={() => toggleContinent(continent)}
                    />
                    {continent}
                  </label>
                ))}
              </div>
            </div>
          </Card>
        ) : null}

        {activeTab === 'Sequence' ? (
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Sequence steps</div>
              <Button size="sm" variant="outline" onClick={addStep} disabled={saving || !automation}>
                Add step
              </Button>
            </div>
            <div className="space-y-3">
              {sequenceSteps.map((step, index) => (
                <div
                  key={step.id}
                  className="flex items-center justify-between rounded-xl border border-border-subtle bg-white px-3 py-3 text-xs text-slate-600"
                >
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                      Step {index + 1} · {step.stepType === 'email' ? 'Email' : 'Delay'}
                    </div>
                    <div className="mt-1 font-semibold text-slate-900">
                      {step.stepType === 'email'
                        ? `Template: ${templates.find((tpl) => tpl.id === step.templateId)?.name || 'Unassigned'}`
                        : `Delay: ${step.delayMinutes || 0} minutes`}
                    </div>
                    {step.subjectOverride ? (
                      <div className="mt-1 text-[11px] text-slate-500">Subject: {step.subjectOverride}</div>
                    ) : null}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => deleteStep(step.id)} disabled={saving}>
                    Delete
                  </Button>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border-subtle bg-panel-elevated p-3">
              <div className="text-xs font-semibold text-slate-900">New step</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
                  <span className="font-medium text-text">Step type</span>
                  <select
                    value={newStepType}
                    onChange={(event) => setNewStepType(event.target.value as 'email' | 'delay')}
                    className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
                  >
                    <option value="email">Email</option>
                    <option value="delay">Delay</option>
                  </select>
                </label>
                {newStepType === 'delay' ? (
                  <Input
                    label="Delay minutes"
                    type="number"
                    min={1}
                    value={newStepDelayMinutes}
                    onChange={(event) => setNewStepDelayMinutes(Number(event.target.value) || 1)}
                  />
                ) : (
                  <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
                    <span className="font-medium text-text">Template</span>
                    <select
                      value={newStepTemplateId}
                      onChange={(event) => setNewStepTemplateId(event.target.value)}
                      className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
                    >
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {newStepType === 'email' ? (
                <Input
                  label="Subject override (optional)"
                  value={newStepSubject}
                  onChange={(event) => setNewStepSubject(event.target.value)}
                  placeholder="Subject line"
                />
              ) : null}
            </div>
          </Card>
        ) : null}

        {activeTab === 'Preview' ? (
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-900">Preview</div>
            <div className="rounded-xl border border-border-subtle bg-panel-elevated p-4 text-xs text-slate-500">
              Select a step to preview its email content.
            </div>
          </Card>
        ) : null}

        {activeTab === 'Status' ? (
          <Card className="p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-900">Status & health</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Status" value={statusLabel(status) as string} readOnly />
              <Input label="Last run" value="Not started" readOnly />
              <Input label="Active subscribers" value="0" readOnly />
              <Input label="Emails sent" value="0" readOnly />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline">Run test</Button>
              <Button size="sm" variant="secondary" onClick={status === 'active' ? pauseAutomation : activateAutomation} disabled={saving}>
                {status === 'active' ? 'Pause' : 'Activate'}
              </Button>
            </div>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  );
}
