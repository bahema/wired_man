import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, AdminPage, AdminTemplate } from '../services/adminApi';

export default function BossNavigationPage() {
  const [items, setItems] = useState<AdminPage[]>([]);
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [templateId, setTemplateId] = useState<string>('none');

  const templateOptions = useMemo(
    () => [{ id: 'none', name: 'Blank page' }, ...templates.map((t) => ({ id: t.id, name: t.name }))],
    [templates]
  );

  const loadData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [pages, templatesData] = await Promise.all([
        adminApi.getPages(),
        adminApi.getTemplates()
      ]);
      setItems(pages);
      setTemplates(templatesData);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load pages.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openAdd = () => {
    setTitle('');
    setSlug('');
    setTemplateId('none');
    setModalOpen(true);
  };

  const onSave = async () => {
    if (!title.trim() || !slug.trim()) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const created = await adminApi.createPage({
        title: title.trim(),
        slug: slug.trim().toLowerCase(),
        templateId: templateId === 'none' ? null : templateId
      });
      setItems((prev) => [created, ...prev]);
      setModalOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create page.');
    } finally {
      setLoading(false);
    }
  };

  const togglePublish = async (page: AdminPage) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const updated = await adminApi.updatePage(page.id, {
        status: page.status === 'published' ? 'draft' : 'published'
      });
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update status.');
    } finally {
      setLoading(false);
    }
  };

  const deletePage = async (id: string) => {
    setLoading(true);
    setErrorMessage('');
    try {
      await adminApi.deletePage(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete page.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Ready-made templates
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Pick a prebuilt layout, then open the editor to add or remove sections, cards, headers, and buttons.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/boss/templates">
                  <Button size="sm" variant="secondary">
                    Pick template
                  </Button>
                </Link>
                <Link to="/boss/uploads">
                  <Button size="sm" variant="outline">
                    Open uploads
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Start from scratch
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Build a new page with your editor system: sections, gallery, headers, and more.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={openAdd}>
                  Create blank page
                </Button>
                <Link to="/boss/uploads">
                  <Button size="sm" variant="outline">
                    Upload media
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Client navigation
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Edit the top navigation pages. Product cards stay controlled in Products.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="p-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Home</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">/</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/boss/navigation/client/home">
                  <Button size="sm" variant="secondary">
                    Edit sections
                  </Button>
                </Link>
                <Link to="/">
                  <Button size="sm" variant="outline">
                    View page
                  </Button>
                </Link>
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Your First 2000$
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">/items</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/boss/navigation/client/items">
                  <Button size="sm" variant="secondary">
                    Edit sections
                  </Button>
                </Link>
                <Link to="/items">
                  <Button size="sm" variant="outline">
                    View page
                  </Button>
                </Link>
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Forex Trade & Betting
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">/forex</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/boss/navigation/client/forex">
                  <Button size="sm" variant="secondary">
                    Edit sections
                  </Button>
                </Link>
                <Link to="/forex">
                  <Button size="sm" variant="outline">
                    View page
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Navigation Links
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Create and publish client pages. Draft pages stay hidden.
            </p>
          </div>
          <Button onClick={openAdd}>Add Link</Button>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading...</Card>
        ) : null}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((page) => (
              <Card key={page.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {page.title}
                  </h3>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      page.status === 'published'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {page.status}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">/{page.slug}</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={`/boss/navigation/${page.id}`}>
                    <Button size="sm" variant="secondary">
                      Edit
                    </Button>
                  </Link>
                  <Button size="sm" variant="secondary" onClick={() => void togglePublish(page)}>
                    {page.status === 'published' ? 'Unpublish' : 'Publish'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void deletePage(page.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <Card className="h-fit self-start p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Editor workspace
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  Build pages with drag-and-drop elements and reusable sections.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
              <div className="rounded-lg border border-border-subtle bg-panel px-3 py-2">
                Sections
              </div>
              <div className="rounded-lg border border-border-subtle bg-panel px-3 py-2">
                Gallery
              </div>
              <div className="rounded-lg border border-border-subtle bg-panel px-3 py-2">
                Headers
              </div>
              <div className="rounded-lg border border-border-subtle bg-panel px-3 py-2">
                Paragraphs
              </div>
              <div className="rounded-lg border border-border-subtle bg-panel px-3 py-2">
                Cards
              </div>
              <div className="rounded-lg border border-border-subtle bg-panel px-3 py-2">
                Buttons
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <Button size="sm" variant="secondary" disabled>
                Open editor
              </Button>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Select a page to edit or create a new one to enable the editor.
              </div>
            </div>
          </Card>
        </div>
      </div>
      <AdminModal title="Add Link" open={modalOpen} onClose={() => setModalOpen(false)} onSave={onSave}>
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Link label</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
            placeholder="Page title"
          />
        </label>
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Slug</span>
          <input
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
            placeholder="page-slug"
          />
        </label>
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Template</span>
          <select
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          >
            {templateOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      </AdminModal>
    </AdminShell>
  );
}
