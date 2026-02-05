import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { adminApi, AdminEmailTemplate } from '../services/adminApi';

const defaultHtml = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:32px;font-family:Arial,sans-serif;color:#111827;">
            <h1 style="margin:0 0 12px;font-size:24px;">Hello {{firstName}}</h1>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">
              Replace this copy with your latest update or offer.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 32px;font-family:Arial,sans-serif;">
            <a href="https://workpays.com" style="background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;">
              Primary CTA
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

const parseTags = (value: string) =>
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

type TemplateQuery = {
  search: string;
  category: string;
  tag: string;
  sort: 'updated_desc' | 'name_asc';
  page: number;
  limit: number;
};

export default function BossTemplatesPage() {
  const wrapPreviewHtml = (raw: string) => `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; }
      img { max-width: 100% !important; height: auto !important; display: block; }
      table { width: 100% !important; max-width: 100% !important; }
      td, th { width: auto !important; }
      [width] { width: 100% !important; max-width: 100% !important; }
      [style*="width"] { max-width: 100% !important; }
      * { box-sizing: border-box; }
    </style>
  </head>
  <body>
    ${raw || '<div style="padding:16px;font-family:Arial;">No HTML to preview yet.</div>'}
  </body>
</html>`;
  const [templates, setTemplates] = useState<AdminEmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState<TemplateQuery>({
    search: '',
    category: '',
    tag: '',
    sort: 'updated_desc',
    page: 1,
    limit: 12
  });
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newMode, setNewMode] = useState<'blank' | 'starter'>('blank');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [starterId, setStarterId] = useState('');
  const [newTemplateError, setNewTemplateError] = useState('');

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminEmailTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewWarnings, setPreviewWarnings] = useState<{ code: string; message: string }[]>([]);
  const [previewRewriteLinks, setPreviewRewriteLinks] = useState(true);
  const [previewOpenPixel, setPreviewOpenPixel] = useState(false);
  const [previewForceFooter, setPreviewForceFooter] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testSubject, setTestSubject] = useState('');
  const [testStatus, setTestStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [testAsSent, setTestAsSent] = useState(false);
  const [quickSendName, setQuickSendName] = useState('');
  const [quickSendSubject, setQuickSendSubject] = useState('');
  const [quickSendTopics, setQuickSendTopics] = useState('');
  const [quickSendTags, setQuickSendTags] = useState('');
  const [quickSendContinents, setQuickSendContinents] = useState<string[]>([]);
  const [quickSendCounts, setQuickSendCounts] = useState<Record<string, number>>({});
  const [quickSendTotal, setQuickSendTotal] = useState<number | null>(null);
  const [quickSendStatus, setQuickSendStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [sampleVariables, setSampleVariables] = useState(
    JSON.stringify(
      {
        firstName: 'Ari',
        email: 'ari@example.com',
        topic: 'Weekly digest',
        location: 'New York',
        unsubscribeUrl: 'https://workpays.com/unsubscribe'
      },
      null,
      2
    )
  );
  const [templateForm, setTemplateForm] = useState({
    name: '',
    subjectDefault: '',
    category: '',
    tags: '',
    html: defaultHtml
  });
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewTemplateName, setPreviewTemplateName] = useState('');
  const htmlRef = React.useRef<HTMLTextAreaElement | null>(null);

  const categoryOptions = useMemo(() => {
    const options = new Set<string>();
    templates.forEach((template) => {
      if (template.category) options.add(template.category);
    });
    return ['All categories', ...[...options].sort()];
  }, [templates]);

  const tagOptions = useMemo(() => {
    const options = new Set<string>();
    templates.forEach((template) => {
      (template.tags || []).forEach((tag) => options.add(tag));
    });
    return ['All tags', ...[...options].sort()];
  }, [templates]);

  const fetchTemplates = async (nextQuery: TemplateQuery) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await adminApi.getEmailTemplates({
        search: nextQuery.search || undefined,
        category: nextQuery.category || undefined,
        tag: nextQuery.tag || undefined,
        sort: nextQuery.sort,
        page: nextQuery.page,
        limit: nextQuery.limit
      });
      setTemplates(response.items);
      setTotal(response.total);
      setTotalPages(response.totalPages);
      setQuery(nextQuery);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTemplates(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = () => {
    void fetchTemplates({ ...query, page: 1 });
  };

  const applyCategory = (value: string) => {
    const nextCategory = value === 'All categories' ? '' : value;
    void fetchTemplates({ ...query, category: nextCategory, page: 1 });
  };

  const applyTag = (value: string) => {
    const nextTag = value === 'All tags' ? '' : value;
    void fetchTemplates({ ...query, tag: nextTag, page: 1 });
  };

  const applySort = (value: 'updated_desc' | 'name_asc') => {
    void fetchTemplates({ ...query, sort: value, page: 1 });
  };

  const clearFilters = () => {
    const nextQuery = {
      ...query,
      search: '',
      category: '',
      tag: '',
      page: 1
    };
    void fetchTemplates(nextQuery);
  };

  const openNewTemplate = () => {
    setNewModalOpen(true);
    setNewMode('blank');
    setNewTemplateName('');
    setStarterId(templates[0]?.id || '');
    setNewTemplateError('');
  };

  const createTemplate = async () => {
    setNewTemplateError('');
    if (!newTemplateName.trim()) {
      setNewTemplateError('Template name is required.');
      return;
    }
    setLoading(true);
    try {
      let created: AdminEmailTemplate;
      if (newMode === 'starter') {
        if (!starterId) {
          setNewTemplateError('Select a starter template.');
          setLoading(false);
          return;
        }
        const duplicated = await adminApi.duplicateEmailTemplate(starterId);
        if (newTemplateName.trim() && newTemplateName.trim() !== duplicated.name) {
          created = await adminApi.updateEmailTemplate(duplicated.id, { name: newTemplateName.trim() });
        } else {
          created = duplicated;
        }
      } else {
        created = await adminApi.createEmailTemplate({
          name: newTemplateName.trim(),
          subjectDefault: '',
          category: null,
          tags: null,
          html: defaultHtml
        });
      }
      setNewModalOpen(false);
      setEditing(created);
      setTemplateForm({
        name: created.name,
        subjectDefault: created.subjectDefault || '',
        category: created.category || '',
        tags: (created.tags || []).join(', '),
        html: created.html
      });
      setTemplateModalOpen(true);
      setPreviewHtml('');
      setPreviewError('');
      setTestEmail('');
      setTestSubject(created.subjectDefault || '');
      setTestStatus(null);
      await fetchTemplates({ ...query, page: 1 });
    } catch (error) {
      setNewTemplateError(error instanceof Error ? error.message : 'Failed to create template.');
    } finally {
      setLoading(false);
    }
  };

  const openTemplateEdit = (template: AdminEmailTemplate) => {
    setEditing(template);
    setTemplateForm({
      name: template.name,
      subjectDefault: template.subjectDefault || '',
      category: template.category || '',
      tags: (template.tags || []).join(', '),
      html: template.html
    });
    setPreviewHtml('');
    setPreviewError('');
    setTestEmail('');
    setTestSubject(template.subjectDefault || '');
    setTestStatus(null);
    setQuickSendName('');
    setQuickSendSubject(template.subjectDefault || '');
    setQuickSendTopics('');
    setQuickSendTags('');
    setQuickSendContinents([]);
    setQuickSendCounts({});
    setQuickSendTotal(null);
    setQuickSendStatus(null);
    setTemplateModalOpen(true);
  };

  const openTemplatePreview = async (template: AdminEmailTemplate) => {
    setPreviewModalOpen(true);
    setPreviewTemplateName(template.name);
    setPreviewHtml('');
    setPreviewError('');
    setPreviewWarnings([]);
    let parsed: Record<string, unknown>;
    try {
      const candidate = JSON.parse(sampleVariables);
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new Error('Sample variables must be a JSON object.');
      }
      parsed = candidate as Record<string, unknown>;
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Invalid sample variables JSON.');
      return;
    }
    setLoading(true);
    try {
      const result = await adminApi.renderEmailTemplate(template.id, {
        variables: parsed,
        options: {
          rewriteLinks: previewRewriteLinks,
          injectOpenPixel: previewOpenPixel,
          forceFooter: previewForceFooter
        }
      });
      setPreviewHtml(result.renderedHtml);
      setPreviewWarnings(result.warnings || []);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Failed to render preview.');
    } finally {
      setLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!templateForm.name.trim() || !templateForm.html.trim() || !editing) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const payload = {
        name: templateForm.name.trim(),
        subjectDefault: templateForm.subjectDefault.trim() || null,
        category: templateForm.category.trim() || null,
        tags: templateForm.tags.trim() ? parseTags(templateForm.tags) : null,
        html: templateForm.html
      };
      const updated = await adminApi.updateEmailTemplate(editing.id, payload);
      setEditing(updated);
      setTemplateModalOpen(false);
      await fetchTemplates(query);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save template.');
    } finally {
      setLoading(false);
    }
  };

  const deleteTemplate = async (template: AdminEmailTemplate) => {
    if (!window.confirm(`Delete "${template.name}"?`)) return;
    setLoading(true);
    setErrorMessage('');
    try {
      await adminApi.deleteEmailTemplate(template.id);
      await fetchTemplates({ ...query, page: 1 });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete template.');
    } finally {
      setLoading(false);
    }
  };

  const duplicateTemplate = async (template: AdminEmailTemplate) => {
    setLoading(true);
    setErrorMessage('');
    try {
      await adminApi.duplicateEmailTemplate(template.id);
      await fetchTemplates({ ...query, page: 1 });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to duplicate template.');
    } finally {
      setLoading(false);
    }
  };

  const insertVariable = (token: string) => {
    if (!token) return;
    const input = htmlRef.current;
    if (!input) {
      setTemplateForm((prev) => ({ ...prev, html: `${prev.html}${token}` }));
      return;
    }
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const nextValue = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;
    setTemplateForm((prev) => ({ ...prev, html: nextValue }));
    requestAnimationFrame(() => {
      if (!htmlRef.current) return;
      const cursor = start + token.length;
      htmlRef.current.selectionStart = cursor;
      htmlRef.current.selectionEnd = cursor;
      htmlRef.current.focus();
    });
  };

  const renderPreview = async () => {
    setPreviewError('');
    setPreviewHtml('');
    setPreviewWarnings([]);
    if (!editing) {
      setPreviewError('Save this template before rendering a preview.');
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      const candidate = JSON.parse(sampleVariables);
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new Error('Sample variables must be a JSON object.');
      }
      parsed = candidate as Record<string, unknown>;
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Invalid sample variables JSON.');
      return;
    }
    setLoading(true);
    try {
      const result = await adminApi.renderEmailTemplate(editing.id, {
        variables: parsed,
        html: templateForm.html,
        options: {
          rewriteLinks: previewRewriteLinks,
          injectOpenPixel: previewOpenPixel,
          forceFooter: previewForceFooter
        }
      });
      setPreviewHtml(result.renderedHtml);
      setPreviewWarnings(result.warnings || []);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : 'Failed to render preview.');
    } finally {
      setLoading(false);
    }
  };

  const buildQuickSendFilter = () => ({
    topics: parseTags(quickSendTopics),
    tags: parseTags(quickSendTags),
    continents: quickSendContinents
  });

  const loadQuickSendCounts = async () => {
    if (!editing) return;
    try {
      const result = await adminApi.getSubscriberContinents();
      setQuickSendCounts(result.counts || {});
      setQuickSendTotal(result.total);
    } catch {
      setQuickSendCounts({});
      setQuickSendTotal(null);
    }
  };

  useEffect(() => {
    if (!editing || !templateModalOpen) return;
    const timer = window.setTimeout(() => {
      void loadQuickSendCounts();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [editing?.id, templateModalOpen, quickSendTopics, quickSendTags, quickSendContinents]);

  const toggleQuickSendContinent = (value: string) => {
    setQuickSendContinents((prev) => {
      if (prev.includes(value)) {
        return prev.filter((item) => item !== value);
      }
      return [...prev, value];
    });
  };

  const sendQuickCampaign = async () => {
    if (!editing) return;
    setQuickSendStatus(null);
    if (!quickSendSubject.trim()) {
      setQuickSendStatus({ type: 'error', message: 'Subject is required.' });
      return;
    }
    if (quickSendTotal === null) {
      setQuickSendStatus({ type: 'error', message: 'Audience count is still loading. Try again.' });
      return;
    }
    if (quickSendTotal === 0) {
      setQuickSendStatus({ type: 'error', message: 'No subscribers match the selected audience.' });
      return;
    }
    setLoading(true);
    try {
      await adminApi.sendTemplateCampaign(editing.id, {
        name: quickSendName.trim() || undefined,
        subject: quickSendSubject.trim() || undefined,
        filterJson: buildQuickSendFilter(),
        html: templateForm.html
      });
      setQuickSendStatus({ type: 'success', message: 'Campaign queued for sending.' });
    } catch (error) {
      setQuickSendStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to send campaign.'
      });
    } finally {
      setLoading(false);
    }
  };

  const sendTestEmail = async () => {
    setTestStatus(null);
    if (!editing) {
      setTestStatus({ type: 'error', message: 'Save this template before sending a test email.' });
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      const candidate = JSON.parse(sampleVariables);
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new Error('Sample variables must be a JSON object.');
      }
      parsed = candidate as Record<string, unknown>;
    } catch (error) {
      setTestStatus({ type: 'error', message: error instanceof Error ? error.message : 'Invalid variables JSON.' });
      return;
    }
    if (!testEmail.trim()) {
      setTestStatus({ type: 'error', message: 'Enter a test email address.' });
      return;
    }
    setLoading(true);
    try {
      const subject = testSubject.trim() || templateForm.subjectDefault.trim();
      await adminApi.sendTemplateTestEmail(editing.id, {
        to: testEmail.trim(),
        subject: subject || undefined,
        variables: parsed,
        html: templateForm.html,
        options: {
          asSent: testAsSent,
          rewriteLinks: testAsSent,
          injectOpenPixel: testAsSent,
          forceFooter: testAsSent
        }
      });
      setTestStatus({ type: 'success', message: 'Test email sent.' });
    } catch (error) {
      setTestStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to send test email.' });
    } finally {
      setLoading(false);
    }
  };

  const goToPage = (direction: 'prev' | 'next') => {
    const nextPage = direction === 'prev' ? query.page - 1 : query.page + 1;
    if (nextPage < 1 || nextPage > totalPages) return;
    void fetchTemplates({ ...query, page: nextPage });
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Email Templates Library
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Search, filter, and manage reusable email templates.
            </p>
          </div>
          <Button onClick={openNewTemplate}>New Template</Button>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading...</Card>
        ) : null}

        <Card className="p-5">
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
              <span className="font-medium text-text">Search</span>
              <input
                value={query.search}
                onChange={(event) => setQuery((prev) => ({ ...prev, search: event.target.value }))}
                placeholder="Search templates"
                className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-text shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
                <span className="font-medium text-text">Category</span>
                <select
                  value={query.category || 'All categories'}
                  onChange={(event) => applyCategory(event.target.value)}
                  className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
                >
                  {categoryOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
                <span className="font-medium text-text">Tag</span>
                <select
                  value={query.tag || 'All tags'}
                  onChange={(event) => applyTag(event.target.value)}
                  className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
                >
                  {tagOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
                <span className="font-medium text-text">Sort</span>
                <select
                  value={query.sort}
                  onChange={(event) => applySort(event.target.value as 'updated_desc' | 'name_asc')}
                  className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
                >
                  <option value="updated_desc">Updated (newest)</option>
                  <option value="name_asc">Name (A-Z)</option>
                </select>
              </label>
              <div className="flex items-end">
                <Button size="sm" variant="outline" onClick={runSearch}>
                  Search
                </Button>
              </div>
              <div className="flex items-end">
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {template.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => applyCategory(template.category || 'All categories')}
                    className="mt-1 text-left text-xs text-slate-500 transition hover:text-slate-700"
                  >
                    {template.category || 'Uncategorized'}
                  </button>
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(template.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(template.tags || []).length ? (
                  template.tags?.map((tag) => (
                    <button
                      type="button"
                      onClick={() => applyTag(tag)}
                      key={`${template.id}-${tag}`}
                      className={`rounded-full px-2 py-1 text-xs transition ${
                        query.tag === tag
                          ? 'bg-slate-700 text-white'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                    >
                      {tag}
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    onClick={() => applyTag('All tags')}
                    className="text-xs text-slate-400 transition hover:text-slate-600"
                  >
                    No tags
                  </button>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => openTemplatePreview(template)}>
                  Preview
                </Button>
                <Button size="sm" variant="secondary" onClick={() => openTemplateEdit(template)}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => duplicateTemplate(template)}>
                  Duplicate
                </Button>
                <Button size="sm" variant="outline" onClick={() => deleteTemplate(template)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
          {!loading && templates.length === 0 ? (
            <Card className="p-5 text-sm text-slate-600 dark:text-slate-300">
              No templates match your filters.
            </Card>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Page {query.page} of {totalPages} · {total} templates
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => goToPage('prev')} disabled={query.page <= 1}>
              Previous
            </Button>
            <Button size="sm" variant="outline" onClick={() => goToPage('next')} disabled={query.page >= totalPages}>
              Next
            </Button>
          </div>
        </div>
      </div>

      <AdminModal
        title="New Template"
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onSave={createTemplate}
      >
        <Input
          label="Template name"
          value={newTemplateName}
          onChange={(event) => setNewTemplateName(event.target.value)}
          placeholder="New template name"
        />
        <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
          <span className="font-medium text-text">Start from</span>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="radio"
                checked={newMode === 'blank'}
                onChange={() => setNewMode('blank')}
              />
              Blank template
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="radio"
                checked={newMode === 'starter'}
                onChange={() => setNewMode('starter')}
              />
              Starter template
            </label>
          </div>
        </label>
        {newMode === 'starter' ? (
          <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
            <span className="font-medium text-text">Select starter</span>
            <select
              value={starterId}
              onChange={(event) => setStarterId(event.target.value)}
              className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {newTemplateError ? <div className="text-xs text-red-600">{newTemplateError}</div> : null}
      </AdminModal>

      <AdminModal
        title={editing ? 'Edit Template' : 'Template'}
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSave={saveTemplate}
      >
        <Input
          label="Template name"
          value={templateForm.name}
          onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })}
          placeholder="Automation Weekly Digest"
        />
        <Input
          label="Default subject"
          value={templateForm.subjectDefault}
          onChange={(event) => setTemplateForm({ ...templateForm, subjectDefault: event.target.value })}
          placeholder="Your weekly digest is here"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Category"
            value={templateForm.category}
            onChange={(event) => setTemplateForm({ ...templateForm, category: event.target.value })}
            placeholder="Newsletter"
          />
          <Input
            label="Tags (comma separated)"
            value={templateForm.tags}
            onChange={(event) => setTemplateForm({ ...templateForm, tags: event.target.value })}
            placeholder="newsletter, weekly"
          />
        </div>
        <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
          <span className="font-medium text-text">HTML</span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
              <span className="font-medium text-text">Insert variable</span>
              <select
                className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
                defaultValue=""
                onChange={(event) => {
                  insertVariable(event.target.value);
                  event.currentTarget.value = '';
                }}
              >
                <option value="" disabled>Select token</option>
                {['{{firstName}}', '{{email}}', '{{topic}}', '{{location}}', '{{unsubscribeUrl}}'].map((token) => (
                  <option key={token} value={token}>{token}</option>
                ))}
              </select>
            </label>
          </div>
          <textarea
            rows={10}
            value={templateForm.html}
            onChange={(event) => setTemplateForm({ ...templateForm, html: event.target.value })}
            ref={htmlRef}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-text shadow-sm"
            placeholder="Paste HTML email markup here."
          />
        </label>
        <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
          <span className="font-medium text-text">Sample variables (JSON)</span>
          <textarea
            rows={6}
            value={sampleVariables}
            onChange={(event) => setSampleVariables(event.target.value)}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-text shadow-sm"
            placeholder='{"firstName":"Ari"}'
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Test email address"
            value={testEmail}
            onChange={(event) => setTestEmail(event.target.value)}
            placeholder="you@example.com"
            type="email"
          />
          <Input
            label="Test subject"
            value={testSubject}
            onChange={(event) => setTestSubject(event.target.value)}
            placeholder="Optional subject override"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={testAsSent}
            onChange={(event) => setTestAsSent(event.target.checked)}
          />
          Send test “as sent” (include tracking & footer)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={previewRewriteLinks}
              onChange={(event) => setPreviewRewriteLinks(event.target.checked)}
            />
            Apply click tracking links
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={previewOpenPixel}
              onChange={(event) => setPreviewOpenPixel(event.target.checked)}
            />
            Apply open pixel
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={previewForceFooter}
              onChange={(event) => setPreviewForceFooter(event.target.checked)}
            />
            Force footer/unsubscribe injection
          </label>
          <Button size="sm" variant="outline" onClick={renderPreview}>
            Render Preview
          </Button>
          <Button size="sm" variant="secondary" onClick={sendTestEmail}>
            Send Test Email
          </Button>
          {previewError ? <span className="text-xs text-red-600">{previewError}</span> : null}
          {previewWarnings.length ? (
            <span className="text-xs text-amber-600">
              {previewWarnings.map((warning) => warning.message).join(' ')}
            </span>
          ) : null}
          {testStatus ? (
            <span className={`text-xs ${testStatus.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {testStatus.message}
            </span>
          ) : null}
        </div>
        <div className="mt-4 rounded-xl border border-border-subtle bg-panel-elevated p-3">
          <div className="text-sm font-semibold text-slate-900">Quick send campaign</div>
          <p className="mt-1 text-xs text-slate-500">
            Choose continents and send this template without creating a manual campaign first.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              label="Campaign name (optional)"
              value={quickSendName}
              onChange={(event) => setQuickSendName(event.target.value)}
              placeholder="Quick send - Weekly promo"
            />
            <Input
              label="Subject"
              value={quickSendSubject}
              onChange={(event) => setQuickSendSubject(event.target.value)}
              placeholder="Subject line"
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              label="Topics (comma separated)"
              value={quickSendTopics}
              onChange={(event) => setQuickSendTopics(event.target.value)}
              placeholder="newsletter, promo"
            />
            <Input
              label="Tags (comma separated)"
              value={quickSendTags}
              onChange={(event) => setQuickSendTags(event.target.value)}
              placeholder="vip, affiliate"
            />
          </div>
          <div className="mt-3 rounded-lg border border-border-subtle bg-white/80 p-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="font-semibold text-slate-900">Continents (all subscribers)</span>
              <span>{quickSendTotal !== null ? `${quickSendTotal} subscribers` : 'Loading...'}</span>
            </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {CONTINENTS.map((continent) => (
                  <label key={continent} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={quickSendContinents.includes(continent)}
                        onChange={() => toggleQuickSendContinent(continent)}
                      />
                      {continent}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleQuickSendContinent(continent)}
                      className="text-[11px] text-slate-400 transition hover:text-slate-600"
                    >
                      {quickSendCounts[continent] || 0}
                    </button>
                  </label>
                ))}
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Select multiple continents to target specific regions.
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                <button
                  type="button"
                  onClick={() => setQuickSendContinents([...CONTINENTS])}
                  className="rounded-full bg-slate-100 px-2 py-1 transition hover:bg-slate-200"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={() => setQuickSendContinents([])}
                  className="rounded-full bg-slate-100 px-2 py-1 transition hover:bg-slate-200"
                >
                  Clear all
                </button>
              </div>
            </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={sendQuickCampaign}>
              Send Campaign Now
            </Button>
            {quickSendStatus ? (
              <span className={`text-xs ${quickSendStatus.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                {quickSendStatus.message}
              </span>
            ) : null}
          </div>
        </div>
        {previewHtml ? (
          <div className="w-full overflow-hidden rounded-xl border border-border-subtle bg-panel-elevated p-3">
            <div className="mb-2 text-xs font-medium text-text">Preview</div>
            <iframe
              title="Email template preview"
              sandbox=""
              className="h-64 w-full rounded-lg border border-border-subtle bg-white"
              srcDoc={wrapPreviewHtml(previewHtml)}
            />
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        title={`Preview: ${previewTemplateName}`}
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        onSave={() => setPreviewModalOpen(false)}
      >
        {previewError ? <div className="text-xs text-red-600">{previewError}</div> : null}
        {previewWarnings.length ? (
          <div className="mb-2 text-xs text-amber-600">
            {previewWarnings.map((warning) => warning.message).join(' ')}
          </div>
        ) : null}
        {previewHtml ? (
          <iframe
            title="Template preview"
            sandbox=""
            className="h-80 w-full rounded-lg border border-border-subtle bg-white"
            srcDoc={wrapPreviewHtml(previewHtml)}
          />
        ) : (
          <div className="text-xs text-slate-500">Rendering preview...</div>
        )}
      </AdminModal>
    </AdminShell>
  );
}
