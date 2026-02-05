import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { adminApi, AdminPage, AdminSection } from '../services/adminApi';

const SECTION_TYPES = [
  'hero',
  'feature-grid',
  'offer-cards',
  'stats',
  'testimonial-slider',
  'cta-band',
  'faq',
  'video',
  'newsletter-form',
  'gallery',
  'rich-text',
  'buttons',
  'slider'
];

const itemTemplates: Record<string, { keys: string[]; placeholder: string }> = {
  'feature-grid': { keys: ['title', 'text'], placeholder: 'Title | Description' },
  'offer-cards': { keys: ['title', 'text', 'cta'], placeholder: 'Title | Detail | CTA' },
  stats: { keys: ['label', 'value'], placeholder: 'Label | Value' },
  'testimonial-slider': { keys: ['quote', 'author'], placeholder: 'Quote | Author' },
  faq: { keys: ['q', 'a'], placeholder: 'Question | Answer' },
  gallery: { keys: ['src'], placeholder: 'Image URL' },
  buttons: { keys: ['label', 'variant'], placeholder: 'Label | Variant' },
  slider: { keys: ['title', 'text'], placeholder: 'Title | Description' }
};

const parseItems = (text: string, keys: string[]) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim());
      return keys.reduce<Record<string, string>>((acc, key, index) => {
        acc[key] = parts[index] || '';
        return acc;
      }, {});
    });

const formatItems = (items: Record<string, string>[], keys: string[]) =>
  items.map((item) => keys.map((key) => item[key] || '').join(' | ')).join('\n');

export default function BossPageBuilderPage() {
  const { id } = useParams();
  const [page, setPage] = useState<AdminPage | null>(null);
  const [sections, setSections] = useState<AdminSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editSectionId, setEditSectionId] = useState<string | null>(null);
  const [type, setType] = useState(SECTION_TYPES[0]);
  const [form, setForm] = useState<Record<string, string>>({
    heading: '',
    subheading: '',
    body: '',
    primaryCta: '',
    secondaryCta: '',
    ctaLabel: '',
    cardTitle: '',
    cardBody: '',
    src: '',
    poster: '',
    itemsText: ''
  });

  const itemMeta = itemTemplates[type];

  const loadData = async () => {
    if (!id) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const [pages, sectionsData] = await Promise.all([
        adminApi.getPages(),
        adminApi.getSections(id)
      ]);
      const target = pages.find((item) => item.id === id) || null;
      setPage(target);
      setSections(sectionsData);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load page.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [id]);

  const openAdd = () => {
    setEditSectionId(null);
    setType(SECTION_TYPES[0]);
    setForm({
      heading: '',
      subheading: '',
      body: '',
      primaryCta: '',
      secondaryCta: '',
      ctaLabel: '',
      cardTitle: '',
      cardBody: '',
      src: '',
      poster: '',
      itemsText: ''
    });
    setModalOpen(true);
  };

  const openEdit = (section: AdminSection) => {
    setEditSectionId(section.id);
    setType(section.type);
    const data = section.data || {};
    const items = Array.isArray(data.items) ? data.items : [];
    const keys = itemTemplates[section.type]?.keys || [];
    setForm({
      heading: String(data.heading || ''),
      subheading: String(data.subheading || ''),
      body: String(data.body || ''),
      primaryCta: String(data.primaryCta || ''),
      secondaryCta: String(data.secondaryCta || ''),
      ctaLabel: String(data.ctaLabel || ''),
      cardTitle: String(data.cardTitle || ''),
      cardBody: String(data.cardBody || ''),
      src: String(data.src || ''),
      poster: String(data.poster || ''),
      itemsText: keys.length ? formatItems(items as Record<string, string>[], keys) : ''
    });
    setModalOpen(true);
  };

  const saveSection = async () => {
    if (!id) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const items = itemMeta ? parseItems(form.itemsText, itemMeta.keys) : [];
      const data = {
        heading: form.heading || undefined,
        subheading: form.subheading || undefined,
        body: form.body || undefined,
        primaryCta: form.primaryCta || undefined,
        secondaryCta: form.secondaryCta || undefined,
        ctaLabel: form.ctaLabel || undefined,
        cardTitle: form.cardTitle || undefined,
        cardBody: form.cardBody || undefined,
        src: form.src || undefined,
        poster: form.poster || undefined,
        items: items.length ? items : undefined
      };

      if (editSectionId) {
        const updated = await adminApi.updateSection(editSectionId, {
          type,
          data
        });
        setSections((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await adminApi.createSection(id, {
          type,
          sortOrder: sections.length,
          data
        });
        setSections((prev) => [...prev, created]);
      }
      setModalOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save section.');
    } finally {
      setLoading(false);
    }
  };

  const deleteSection = async (sectionId: string) => {
    setLoading(true);
    setErrorMessage('');
    try {
      await adminApi.deleteSection(sectionId);
      setSections((prev) => prev.filter((item) => item.id !== sectionId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete section.');
    } finally {
      setLoading(false);
    }
  };

  const orderedSections = useMemo(
    () => [...sections].sort((a, b) => a.sortOrder - b.sortOrder),
    [sections]
  );

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Page Builder
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {page ? page.title : 'Loading page...'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={openAdd}>
              Add Section
            </Button>
            <Link to="/boss/navigation">
              <Button variant="outline">Back to Pages</Button>
            </Link>
          </div>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading...</Card>
        ) : null}

        <div className="grid gap-4">
          {orderedSections.map((section) => (
            <Card key={section.id} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {section.type}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Order {section.sortOrder}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(section)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void deleteSection(section.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {!orderedSections.length ? (
            <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
              No sections yet. Add your first section.
            </Card>
          ) : null}
        </div>
      </div>

      <AdminModal
        title={editSectionId ? 'Edit Section' : 'Add Section'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={saveSection}
      >
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Section type</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          >
            {SECTION_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Heading"
          value={form.heading}
          onChange={(event) => setForm((prev) => ({ ...prev, heading: event.target.value }))}
        />
        <Input
          label="Subheading"
          value={form.subheading}
          onChange={(event) => setForm((prev) => ({ ...prev, subheading: event.target.value }))}
        />
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Body</span>
          <textarea
            rows={3}
            value={form.body}
            onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </label>
        <Input
          label="Primary CTA"
          value={form.primaryCta}
          onChange={(event) => setForm((prev) => ({ ...prev, primaryCta: event.target.value }))}
        />
        <Input
          label="Secondary CTA"
          value={form.secondaryCta}
          onChange={(event) => setForm((prev) => ({ ...prev, secondaryCta: event.target.value }))}
        />
        <Input
          label="CTA label"
          value={form.ctaLabel}
          onChange={(event) => setForm((prev) => ({ ...prev, ctaLabel: event.target.value }))}
        />
        <Input
          label="Card title"
          value={form.cardTitle}
          onChange={(event) => setForm((prev) => ({ ...prev, cardTitle: event.target.value }))}
        />
        <Input
          label="Card body"
          value={form.cardBody}
          onChange={(event) => setForm((prev) => ({ ...prev, cardBody: event.target.value }))}
        />
        <Input
          label="Video URL"
          value={form.src}
          onChange={(event) => setForm((prev) => ({ ...prev, src: event.target.value }))}
        />
        <Input
          label="Video poster"
          value={form.poster}
          onChange={(event) => setForm((prev) => ({ ...prev, poster: event.target.value }))}
        />
        {itemMeta ? (
          <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-700">
              Items (one per line, format: {itemMeta.placeholder})
            </span>
            <textarea
              rows={5}
              value={form.itemsText}
              onChange={(event) => setForm((prev) => ({ ...prev, itemsText: event.target.value }))}
              className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
            />
          </label>
        ) : null}
      </AdminModal>
    </AdminShell>
  );
}
