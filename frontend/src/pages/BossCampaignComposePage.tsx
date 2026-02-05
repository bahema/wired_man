import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import MediaPickerModal from '../components/admin/MediaPickerModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import {
  adminApi,
  AdminCampaign,
  AdminEmailTemplate,
  CampaignAnalytics,
  CampaignFilterPayload,
  DeliverabilityStatus,
  AdminSettings,
  SystemHealthStatus
} from '../services/adminApi';
import { resolveMediaUrl } from '../data/mediaLibrary';

const parseFilterJson = (value?: string | null): CampaignFilterPayload => {
  if (!value) return { topics: [], tags: [], location: '', continents: [], sources: [] };
  try {
    const parsed = JSON.parse(value);
    return {
      topics: Array.isArray(parsed?.topics) ? parsed.topics : [],
      tags: Array.isArray(parsed?.tags) ? parsed.tags : [],
      location: typeof parsed?.location === 'string' ? parsed.location : '',
      continents: Array.isArray(parsed?.continents) ? parsed.continents : [],
      sources: Array.isArray(parsed?.sources) ? parsed.sources : []
    };
  } catch {
    return { topics: [], tags: [], location: '', continents: [], sources: [] };
  }
};

const toDateTimeLocal = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
};

const serializeList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item);

const CONTINENTS = [
  'Africa',
  'Asia',
  'Europe',
  'North America',
  'South America',
  'Oceania',
  'Antarctica'
];

export default function BossCampaignComposePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const locationState = useLocation();
  const isNew = !id;

  const [templates, setTemplates] = useState<AdminEmailTemplate[]>([]);
  const [campaign, setCampaign] = useState<AdminCampaign | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [deliverabilityStatus, setDeliverabilityStatus] = useState<DeliverabilityStatus | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthStatus | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);

  const [newName, setNewName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [presetFilter, setPresetFilter] = useState<CampaignFilterPayload | null>(null);

  const [formName, setFormName] = useState('');
  const [subject, setSubject] = useState('');
  const [abEnabled, setAbEnabled] = useState(false);
  const [subjectA, setSubjectA] = useState('');
  const [subjectB, setSubjectB] = useState('');
  const [templateIdA, setTemplateIdA] = useState('');
  const [templateIdB, setTemplateIdB] = useState('');
  const [splitRatio, setSplitRatio] = useState(50);
  const [topics, setTopics] = useState('');
  const [tags, setTags] = useState('');
  const [location, setLocation] = useState('');
  const [sources, setSources] = useState('');
  const [continents, setContinents] = useState<string[]>([]);
  const [useAdvancedFilters, setUseAdvancedFilters] = useState(false);
  const [continentCounts, setContinentCounts] = useState<Record<string, number>>({});
  const [continentTotal, setContinentTotal] = useState<number | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [progress, setProgress] = useState<{
    totalCount: number;
    queuedCount: number;
    processingCount: number;
    sentCount: number;
    failedCount: number;
    skippedCount: number;
  } | null>(null);
  const [abAnalytics, setAbAnalytics] = useState<CampaignAnalytics | null>(null);
  const [sendWarnings, setSendWarnings] = useState<Array<{ code: string; message: string }>>([]);
  const [warningToast, setWarningToast] = useState<string | null>(null);
  const [emailTab, setEmailTab] = useState<'template' | 'edit' | 'preview' | 'images'>('template');
  const [emailHtml, setEmailHtml] = useState('');
  const [emailHtmlTouched, setEmailHtmlTouched] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const completionRef = React.useRef<{ id: string; status: 'sent' | 'failed' } | null>(null);
  const [completionNotice, setCompletionNotice] = useState<{ id: string; status: 'sent' | 'failed' } | null>(null);

  const loadTemplates = async () => {
    const response = await adminApi.getEmailTemplates({ page: 1, limit: 50, sort: 'name_asc' });
    setTemplates(response.items);
    if (!selectedTemplateId && response.items.length) {
      setSelectedTemplateId(response.items[0].id);
    }
  };

  const queryDefaults = useMemo(() => {
    const params = new URLSearchParams(locationState.search);
    const parseList = (key: string) => {
      const value = params.get(key);
      if (!value) return [];
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    };
    const continents = [...parseList('continent'), ...parseList('continents')];
    const topics = [...parseList('topic'), ...parseList('topics')];
    const tags = [...parseList('tag'), ...parseList('tags')];
    const sources = [...parseList('source'), ...parseList('sources')];
    return {
      topics,
      tags,
      location: '',
      continents,
      sources
    };
  }, [locationState.search]);

  const loadCampaign = async (campaignId: string) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await adminApi.getCampaign(campaignId);
      setCampaign(data);
      setFormName(data.name);
      setSubject(data.subject || '');
      setAbEnabled(Boolean(data.abEnabled));
      setSubjectA(data.subjectA || data.subject || '');
      setSubjectB(data.subjectB || '');
      setTemplateIdA(data.templateIdA || data.templateId || '');
      setTemplateIdB(data.templateIdB || '');
      setSplitRatio(typeof data.splitRatio === 'number' ? data.splitRatio : 50);
      const filter = parseFilterJson(data.filterJson);
      setTopics(filter.topics?.join(', ') || '');
      setTags(filter.tags?.join(', ') || '');
      setLocation('');
      setSources(filter.sources?.join(', ') || '');
      setContinents(filter.continents || []);
      setScheduledAt(toDateTimeLocal(data.scheduledAt));
      try {
        const analytics = await adminApi.getCampaignAnalytics(campaignId);
        setAbAnalytics(analytics);
      } catch {
        setAbAnalytics(null);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load campaign.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
    const loadDeliverability = async () => {
      try {
        const payload = await adminApi.getDeliverabilityStatus();
        setDeliverabilityStatus(payload);
      } catch {
        // Ignore deliverability fetch errors; warnings will be skipped.
      }
    };
    void loadDeliverability();
    const loadSettings = async () => {
      try {
        const payload = await adminApi.getSettings();
        setSettings(payload);
      } catch {
        // Ignore settings fetch errors; sender details will show as unavailable.
      }
    };
    void loadSettings();
    const loadSystemHealth = async () => {
      try {
        const payload = await adminApi.getSystemHealth();
        setSystemHealth(payload);
      } catch {
        // Ignore system health errors; warnings will be skipped.
      }
    };
    void loadSystemHealth();
  }, []);

  useEffect(() => {
    if (!isNew) return;
    if (!locationState.search) return;
    setPresetFilter((prev) => prev || queryDefaults);
  }, [isNew, locationState.search, queryDefaults]);

  useEffect(() => {
    if (!isNew) return;
    if (!presetFilter) return;
    if (!sources && presetFilter.sources?.length) {
      setSources(presetFilter.sources.join(', '));
    }
  }, [isNew, presetFilter, sources]);

  useEffect(() => {
    if (!id) return;
    void loadCampaign(id);
  }, [id]);

  useEffect(() => {
    if (!campaign || (campaign.status !== 'sending' && campaign.status !== 'scheduled')) return;
    const timer = setInterval(() => {
      void loadCampaign(campaign.id);
    }, 5000);
    return () => clearInterval(timer);
  }, [campaign]);

  const loadProgress = async (campaignId: string) => {
    try {
      const data = await adminApi.getCampaignProgress(campaignId);
      setProgress(data);
    } catch {
      // ignore progress errors for now
    }
  };

  useEffect(() => {
    if (!campaign || (campaign.status !== 'sending' && campaign.status !== 'scheduled')) return;
    void loadProgress(campaign.id);
    const timer = setInterval(() => {
      void loadProgress(campaign.id);
    }, 3000);
    return () => clearInterval(timer);
  }, [campaign?.id, campaign?.status]);

  useEffect(() => {
    if (!campaign || !progress) return;
    if (progress.totalCount <= 0) return;
    if (progress.queuedCount !== 0 || progress.processingCount !== 0) return;
    const status = progress.failedCount > 0 ? 'failed' : 'sent';
    if (completionNotice && completionNotice.id === campaign.id && completionNotice.status === status) {
      return;
    }
    if (
      completionRef.current &&
      completionRef.current.id === campaign.id &&
      completionRef.current.status === status
    ) {
      return;
    }
    completionRef.current = { id: campaign.id, status };
    setCompletionNotice({ id: campaign.id, status });
    setStatusMessage(status === 'sent' ? 'Campaign sent.' : 'Campaign finished with failures.');
  }, [campaign, progress, completionNotice]);

  const templateLabel = useMemo(() => {
    if (!campaign?.templateId) return '';
    return templates.find((item) => item.id === campaign.templateId)?.name || campaign.templateId;
  }, [campaign, templates]);

  const templateForEditor = useMemo(() => {
    const templateId = abEnabled
      ? (templateIdA || campaign?.templateId || '')
      : (campaign?.templateId || '');
    return templates.find((item) => item.id === templateId) || null;
  }, [abEnabled, campaign?.templateId, templateIdA, templates]);

  useEffect(() => {
    if (!templateForEditor?.html) return;
    if (emailHtmlTouched || emailHtml) return;
    if (campaign?.htmlOverride) {
      setEmailHtml(campaign.htmlOverride);
      return;
    }
    setEmailHtml(templateForEditor.html);
  }, [templateForEditor?.html, campaign?.htmlOverride, emailHtmlTouched, emailHtml]);

  const insertSnippet = (snippet: string) => {
    setEmailHtml((prev) => `${prev}\n${snippet}`);
    setEmailHtmlTouched(true);
    setEmailTab('edit');
  };

  const previewDoc = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const rawContent = emailHtml || '<div style="padding:16px;font-family:Arial;">No HTML to preview yet.</div>';
    const content = origin
      ? rawContent.replace(/src=(["'])\/uploads\//gi, `src=$1${origin}/uploads/`)
      : rawContent;
    return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${origin ? `<base href="${origin}/" />` : ''}
    <style>
      body { margin: 0; padding: 12px; box-sizing: border-box; }
      img { max-width: 100% !important; height: auto; display: block; }
      table { max-width: 100% !important; width: 100% !important; }
      td, th { max-width: 100%; }
      * { box-sizing: border-box; }
    </style>
  </head>
  <body>
    <div style="max-width:100%;">
      ${content}
    </div>
  </body>
</html>`;
  }, [emailHtml]);

  const toAbsoluteUrl = (value: string) => {
    if (!value) return value;
    if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:')) return value;
    if (value.startsWith('/')) {
      return typeof window !== 'undefined' ? `${window.location.origin}${value}` : value;
    }
    return value;
  };
  const createCampaign = async () => {
    if (!newName.trim() || !selectedTemplateId) {
      setErrorMessage('Campaign name and template are required.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const mergedFilter = presetFilter ? { ...presetFilter } : undefined;
      const sourceList = serializeList(sources);
      const filterJson = mergedFilter
        ? {
            ...mergedFilter,
            topics: useAdvancedFilters ? mergedFilter.topics || [] : [],
            tags: useAdvancedFilters ? mergedFilter.tags || [] : [],
            location: useAdvancedFilters ? mergedFilter.location || '' : '',
            sources: useAdvancedFilters ? sourceList : []
          }
        : (useAdvancedFilters && sourceList.length ? { sources: sourceList } : undefined);
      const created = await adminApi.createCampaign({
        name: newName.trim(),
        templateId: selectedTemplateId,
        filterJson
      });
      navigate(`/boss/campaigns/${created.id}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create campaign.');
    } finally {
      setLoading(false);
    }
  };

  const buildFilterJson = (): CampaignFilterPayload => ({
    topics: useAdvancedFilters ? serializeList(topics) : [],
    tags: useAdvancedFilters ? serializeList(tags) : [],
    location: useAdvancedFilters ? location.trim() : '',
    continents,
    sources: useAdvancedFilters ? serializeList(sources) : []
  });

  const saveCampaign = async () => {
    if (!campaign) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const filterJson = buildFilterJson();
      const updated = await adminApi.updateCampaign(campaign.id, {
        name: formName.trim(),
        subject: subject.trim(),
        abEnabled,
        subjectA: abEnabled ? subjectA.trim() : subject.trim(),
        subjectB: abEnabled ? subjectB.trim() : null,
        htmlOverride: emailHtml,
        templateIdA: abEnabled ? (templateIdA || campaign.templateId) : null,
        templateIdB: abEnabled ? (templateIdB || null) : null,
        splitRatio,
        filterJson,
        scheduledAt: scheduledAt || null
      });
      setCampaign(updated);
      setStatusMessage('Campaign saved.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save campaign.');
    } finally {
      setLoading(false);
    }
  };

  const previewAudience = async (silent = false) => {
    if (!campaign) return;
    if (!silent) {
      setLoading(true);
      setErrorMessage('');
    }
    try {
      const filterJson = buildFilterJson();
      const result = await adminApi.previewCampaignAudience(campaign.id, filterJson);
      setAudienceCount(result.count);
    } catch (error) {
      if (!silent) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to preview audience.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!campaign) return;
    const handle = window.setTimeout(() => {
      void previewAudience(true);
    }, 500);
    return () => {
      window.clearTimeout(handle);
    };
  }, [campaign?.id, useAdvancedFilters, topics, tags, sources, location, continents]);

  const loadContinentCounts = async () => {
    if (!campaign) return;
    try {
      const result = await adminApi.getSubscriberContinents();
      setContinentCounts(result.counts || {});
      setContinentTotal(result.total);
    } catch {
      setContinentCounts({});
      setContinentTotal(null);
    }
  };

  useEffect(() => {
    if (!campaign) return;
    void loadContinentCounts();
  }, [campaign?.id]);

  const toggleContinent = (value: string) => {
    setContinents((prev) => {
      if (prev.includes(value)) {
        return prev.filter((item) => item !== value);
      }
      return [...prev, value];
    });
  };

  const formatAudienceError = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Failed to send campaign.';
    if (message.includes('No recipients matched this audience')) {
      return 'No confirmed subscribers match this audience. Use Analytics → Resender to send confirmation emails, then try again.';
    }
    return message;
  };

  const sendNow = async () => {
    if (!campaign) return;
    if (systemHealth?.deliverabilityWarningsEnabled && deliverabilityStatus &&
      (!deliverabilityStatus.spfConfigured || !deliverabilityStatus.dkimConfigured || !deliverabilityStatus.dmarcConfigured)) {
      const ok = window.confirm('Deliverability checks are incomplete. Send anyway?');
      if (!ok) return;
    }
    setLoading(true);
    setErrorMessage('');
    setCompletionNotice(null);
    try {
      const result = await adminApi.sendCampaignNow(campaign.id);
      const warnings = result.warnings || [];
      if (warnings.length) {
        setTimeout(() => {
          setSendWarnings(warnings);
          setWarningToast(warnings.map((item) => item.message).join(' '));
          setTimeout(() => setWarningToast(null), 4000);
        }, 1500);
      } else {
        setSendWarnings([]);
      }
      await loadCampaign(campaign.id);
      await loadProgress(campaign.id);
      setStatusMessage('Campaign queued for sending.');
    } catch (error) {
      setErrorMessage(formatAudienceError(error));
    } finally {
      setLoading(false);
    }
  };

  const sendSandbox = async () => {
    if (!campaign) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await adminApi.sendCampaignSandbox(campaign.id);
      setStatusMessage(`Sandbox queued for ${result.queued} recipients.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send sandbox campaign.');
    } finally {
      setLoading(false);
    }
  };

  const scheduleCampaign = async () => {
    if (!campaign) return;
    if (!scheduledAt) {
      setErrorMessage('Pick a schedule time.');
      return;
    }
    if (systemHealth?.deliverabilityWarningsEnabled && deliverabilityStatus &&
      (!deliverabilityStatus.spfConfigured || !deliverabilityStatus.dkimConfigured || !deliverabilityStatus.dmarcConfigured)) {
      const ok = window.confirm('Deliverability checks are incomplete. Schedule anyway?');
      if (!ok) return;
    }
    setLoading(true);
    setErrorMessage('');
    setCompletionNotice(null);
    try {
      const updated = await adminApi.scheduleCampaign(campaign.id, scheduledAt);
      const warnings = updated.warnings || [];
      if (warnings.length) {
        setTimeout(() => {
          setSendWarnings(warnings);
          setWarningToast(warnings.map((item) => item.message).join(' '));
          setTimeout(() => setWarningToast(null), 4000);
        }, 1500);
      } else {
        setSendWarnings([]);
      }
      setCampaign(updated);
      await loadProgress(campaign.id);
      setStatusMessage('Campaign scheduled.');
    } catch (error) {
      setErrorMessage(formatAudienceError(error));
    } finally {
      setLoading(false);
    }
  };

  if (isNew) {
    return (
      <AdminShell>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              New Campaign
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Choose a template and create a draft campaign.
            </p>
          </div>

          {errorMessage ? <Card className="p-4 text-sm text-red-600">{errorMessage}</Card> : null}
          {presetFilter &&
          (presetFilter.topics?.length ||
            presetFilter.tags?.length ||
            presetFilter.continents?.length ||
            presetFilter.sources?.length) ? (
            <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
              <div className="font-semibold text-slate-900 dark:text-slate-100">Audience preset</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {presetFilter.continents?.map((item) => (
                  <span key={`continent-${item}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    Continent: {item}
                  </span>
                ))}
                {presetFilter.topics?.map((item) => (
                  <span key={`topic-${item}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    Topic: {item}
                  </span>
                ))}
                {presetFilter.tags?.map((item) => (
                  <span key={`tag-${item}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    Tag: {item}
                  </span>
                ))}
                {presetFilter.sources?.map((item) => (
                  <span key={`source-${item}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    Source: {item}
                  </span>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="p-5 space-y-4">
            <Input
              label="Campaign name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Weekly digest - July"
            />
            <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
              <span className="font-medium text-text">Template</span>
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Sources (comma separated)"
              value={sources}
              onChange={(event) => setSources(event.target.value)}
              placeholder="Landing pages, webinars"
            />
            <Button onClick={createCampaign} disabled={loading}>
              {loading ? 'Creating...' : 'Create Campaign'}
            </Button>
          </Card>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Campaign Editor
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Template: {templateLabel || 'Loading...'}
          </p>
          {campaign ? (
            <span className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
              campaign.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
            }`}>
              {campaign.status === 'sent' ? 'Sent' : 'Not sent (Draft)'}
            </span>
          ) : null}
        </div>

        {loading ? <Card className="p-4 text-sm text-slate-500">Loading...</Card> : null}
        <div className="space-y-2 min-h-[120px]">
          {errorMessage ? <Card className="p-4 text-sm text-red-600">{errorMessage}</Card> : null}
          {statusMessage ? <Card className="p-4 text-sm text-emerald-700">{statusMessage}</Card> : null}
          {warningToast ? (
            <Card className="p-4 text-sm text-amber-700">{warningToast}</Card>
          ) : null}
          {sendWarnings.length ? (
            <Card className="p-4 text-sm text-amber-700">
              <div className="font-semibold">Warnings</div>
              <ul className="mt-2 list-disc pl-4">
                {sendWarnings.map((warning) => (
                  <li key={warning.code}>{warning.message}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
        {systemHealth?.deliverabilityWarningsEnabled && deliverabilityStatus &&
        (!deliverabilityStatus.spfConfigured ||
          !deliverabilityStatus.dkimConfigured ||
          !deliverabilityStatus.dmarcConfigured) ? (
          <Card className="p-4 text-sm text-amber-700">
            Deliverability warning: SPF/DKIM/DMARC checks are incomplete. Configure them on the Deliverability page
            before sending large campaigns.
          </Card>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <Card className="p-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Audience</h2>
              <p className="mt-1 text-xs text-slate-500">Choose who receives this campaign.</p>
            </div>
            <div className="rounded-xl border border-border-subtle bg-panel-elevated p-4 text-xs text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/80">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Sender</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input
                  label="Sender name"
                  value={settings?.senderName || 'Not set'}
                  readOnly
                  className="cursor-not-allowed opacity-80"
                />
                <Input
                  label="Sender email"
                  value={settings?.senderEmail || 'Not set'}
                  readOnly
                  className="cursor-not-allowed opacity-80"
                />
                <Input
                  label="Reply-to"
                  value={settings?.replyToEmail || 'Not set'}
                  readOnly
                  className="cursor-not-allowed opacity-80"
                />
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Update sender details in Settings.
              </div>
            </div>
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
              <Input
                label="Sources (comma separated)"
                value={sources}
                onChange={(event) => setSources(event.target.value)}
                placeholder="Landing pages, webinars"
              />
            </div>
            <div className="rounded-xl border border-border-subtle bg-panel-elevated p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-900">Continents (confirmed subscribers)</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  Confirmed only
                </span>
                <span>{continentTotal !== null ? `${continentTotal} subscribers` : 'Loading...'}</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {CONTINENTS.map((continent) => (
                  <label key={continent} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={continents.includes(continent)}
                        onChange={() => toggleContinent(continent)}
                      />
                      {continent}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {continentCounts[continent] || 0}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Select multiple continents to target specific regions.
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Audience counts include confirmed subscribers only.
              </div>
              <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-panel px-3 py-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-900">Apply topics, tags, sources, location</span>
                <input
                  type="checkbox"
                  checked={useAdvancedFilters}
                  onChange={(event) => setUseAdvancedFilters(event.target.checked)}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void previewAudience()}>
                Preview Audience
              </Button>
              {audienceCount !== null ? (
                <span className="text-xs text-slate-500">Confirmed audience: {audienceCount}</span>
              ) : null}
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Email Content</h2>
              <p className="mt-1 text-xs text-slate-500">Pick a template and craft the email.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {(['template', 'edit', 'preview', 'images'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setEmailTab(tab)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    emailTab === tab ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab === 'template' ? 'Template' : tab === 'edit' ? 'Edit' : tab === 'preview' ? 'Preview' : 'Images'}
                </button>
              ))}
            </div>
            {emailTab === 'template' ? (
              <div className="space-y-4">
                <Input
                  label="Campaign name"
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  placeholder="Campaign name"
                />
                {!abEnabled ? (
                  <Input
                    label="Subject"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="Subject line (supports {{firstName}})"
                  />
                ) : null}
                <div className="rounded-xl border border-border-subtle bg-panel-elevated p-4 text-sm text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/80">
                  <label className="flex items-center gap-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <input
                      type="checkbox"
                      checked={abEnabled}
                      onChange={(event) => setAbEnabled(event.target.checked)}
                    />
                    Enable A/B testing
                  </label>
                  <p className="mt-2 text-xs text-slate-500">
                    Split subscribers across subject and template variants.
                  </p>
                  {abEnabled ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Input
                        label="Subject A"
                        value={subjectA}
                        onChange={(event) => setSubjectA(event.target.value)}
                        placeholder="Subject A"
                      />
                      <Input
                        label="Subject B"
                        value={subjectB}
                        onChange={(event) => setSubjectB(event.target.value)}
                        placeholder="Subject B"
                      />
                      <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
                        <span className="font-medium text-text">Template A</span>
                        <select
                          value={templateIdA || campaign?.templateId || ''}
                          onChange={(event) => setTemplateIdA(event.target.value)}
                          className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
                        >
                          {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
                        <span className="font-medium text-text">Template B (optional)</span>
                        <select
                          value={templateIdB || ''}
                          onChange={(event) => setTemplateIdB(event.target.value)}
                          className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
                        >
                          <option value="">Use Template A</option>
                          {templates.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Input
                        label="Split Ratio (% A)"
                        type="number"
                        value={splitRatio}
                        onChange={(event) => setSplitRatio(Number(event.target.value))}
                      />
                    </div>
                  ) : (
                    <label className="mt-4 grid gap-2 text-xs text-text-muted sm:text-sm">
                      <span className="font-medium text-text">Template</span>
                      <select
                        value={templateIdA || campaign?.templateId || ''}
                        onChange={(event) => setTemplateIdA(event.target.value)}
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
              </div>
            ) : null}
            {emailTab === 'edit' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => insertSnippet('<a href="https://example.com" style="background:#111827;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;">Button</a>')}
                  >
                    Insert Button
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => insertSnippet('<a href="https://example.com" style="color:#2563eb;">Link</a>')}
                  >
                    Insert Link
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setImagePickerOpen(true)}>
                    Insert Image
                  </Button>
                  <Button size="sm" variant="secondary" onClick={saveCampaign}>
                    Save Campaign
                  </Button>
                </div>
                <textarea
                  rows={12}
                  value={emailHtml}
                  onChange={(event) => {
                    setEmailHtml(event.target.value);
                    setEmailHtmlTouched(true);
                  }}
                  className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-text shadow-sm"
                  placeholder="Edit email HTML here (draft)."
                />
                <div className="text-xs text-slate-500">
                  Images must be selected from the Uploads library.
                </div>
              </div>
            ) : null}
            {emailTab === 'preview' ? (
              <div className="w-full overflow-hidden rounded-xl border border-border-subtle bg-panel-elevated p-3">
                <iframe
                  title="Email preview"
                  sandbox="allow-same-origin"
                  className="h-80 w-full rounded-lg border border-border-subtle bg-white"
                  srcDoc={previewDoc}
                />
              </div>
            ) : null}
            {emailTab === 'images' ? (
              <div className="space-y-3 text-sm text-slate-600">
                <p>Pick images from the Uploads library to use in your email.</p>
                <Button size="sm" variant="outline" onClick={() => setImagePickerOpen(true)}>
                  Open Uploads Library
                </Button>
              </div>
            ) : null}
          </Card>
        </div>

        <Card className="p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Schedule & Send</h2>
            <p className="mt-1 text-xs text-slate-500">Finalize delivery once content is ready.</p>
          </div>
          <Input
            label="Schedule (optional)"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
            type="datetime-local"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={saveCampaign}>
              Save Changes
            </Button>
            <Button size="sm" variant="outline" onClick={sendSandbox}>
              Send Sandbox
            </Button>
            <Button size="sm" variant="secondary" onClick={sendNow}>
              Send Now
            </Button>
            <Button size="sm" variant="outline" onClick={scheduleCampaign}>
              Schedule
            </Button>
          </div>
        </Card>

        {campaign ? (
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Sending Status
                </h3>
                <p className="mt-1 text-xs text-slate-500">Status: {campaign.status}</p>
              </div>
              <div className="text-xs text-slate-500">
                Updated {new Date(campaign.updatedAt).toLocaleString()}
              </div>
            </div>
            {progress ? (
              <div className="mt-4 space-y-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: progress.totalCount
                        ? `${Math.min(100, ((progress.sentCount + progress.failedCount) / Math.max(1, progress.totalCount - progress.skippedCount)) * 100)}%`
                        : '0%'
                    }}
                  />
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                  <div>Queued: {progress.queuedCount}</div>
                  <div>Processing: {progress.processingCount}</div>
                  <div>Sent: {progress.sentCount}</div>
                  <div>Failed: {progress.failedCount}</div>
                  <div>Skipped: {progress.skippedCount}</div>
                  <div>Total: {progress.totalCount}</div>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                <div>Sent: {campaign.sentCount || 0}</div>
                <div>Failed: {campaign.failedCount || 0}</div>
                <div>Queued: {campaign.queuedCount || 0}</div>
                <div>Skipped: 0</div>
                <div>Total: {campaign.totalCount || 0}</div>
              </div>
            )}
          </Card>
        ) : null}

        {campaign ? (
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                A/B Performance
              </h3>
              <span className="text-xs text-slate-500">
                Split: {abAnalytics?.splitRatio ?? splitRatio}% A
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-xs text-slate-500">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.2em] text-slate-400">
                    <th className="py-2 pr-4">Variant</th>
                    <th className="py-2 pr-4">Sent</th>
                    <th className="py-2 pr-4">Unique Opens</th>
                    <th className="py-2 pr-4">Unique Clickers</th>
                    <th className="py-2 pr-4">Clicks</th>
                    <th className="py-2 pr-4">Click Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(['A', 'B'] as const).map((variant) => {
                    const stats = abAnalytics?.variants?.[variant];
                    const isWinner = abAnalytics?.winner?.variant === variant;
                    return (
                      <tr key={variant} className={isWinner ? 'text-emerald-600' : ''}>
                        <td className="py-2 pr-4 font-semibold">{variant}</td>
                        <td className="py-2 pr-4">{stats?.sent ?? 0}</td>
                        <td className="py-2 pr-4">{stats?.uniqueOpens ?? 0}</td>
                        <td className="py-2 pr-4">{stats?.uniqueClickers ?? 0}</td>
                        <td className="py-2 pr-4">{stats?.totalClicks ?? 0}</td>
                        <td className="py-2 pr-4">{stats?.clickRate ?? 0}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {abAnalytics?.winner ? (
              <p className="mt-3 text-xs text-slate-500">
                Winner: Variant {abAnalytics.winner.variant} ({abAnalytics.winner.clickRate}% click rate)
              </p>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No winner yet.</p>
            )}
          </Card>
        ) : null}

        {abAnalytics?.recentErrors?.length ? (
          <Card className="p-5">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Recent Send Errors
            </h3>
            <div className="mt-4 space-y-3 text-xs text-slate-500">
              {abAnalytics.recentErrors.map((item) => (
                <div
                  key={item.jobId}
                  className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-3 dark:border-slate-700/70 dark:bg-slate-900/80"
                >
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {item.message || 'Send failed'}
                  </div>
                  <div className="mt-1">
                    Subscriber: {item.subscriberId || 'Unknown'} · At:{' '}
                    {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown'}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
      <MediaPickerModal
        open={imagePickerOpen}
        onClose={() => setImagePickerOpen(false)}
        filter="Images"
        onPick={(asset) => {
          const url = toAbsoluteUrl(resolveMediaUrl(asset.path));
          insertSnippet(
            `<img src="${url}" alt="${asset.name}" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" />`
          );
        }}
      />
    </AdminShell>
  );
}
