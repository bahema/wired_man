import React, { useEffect, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, type AdminFooterKeyword } from '../services/adminApi';

export default function BossFooterKeywordsPage() {
  const [items, setItems] = useState<AdminFooterKeyword[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const data = await adminApi.getFooterKeywords();
        if (active) {
          setItems(data.items || []);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load footer keywords.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const openAdd = () => {
    setEditIndex(null);
    setLabel('');
    setUrl('');
    setModalOpen(true);
  };

  const openEdit = (index: number) => {
    setEditIndex(index);
    setLabel(items[index]?.label ?? '');
    setUrl(items[index]?.url ?? '');
    setModalOpen(true);
  };

  const onSave = async () => {
    if (!label.trim()) return;
    const nextItem = {
      label: label.trim(),
      url: url.trim() ? url.trim() : null
    };
    const nextItems = editIndex === null
      ? [...items, nextItem]
      : items.map((item, idx) => (idx === editIndex ? nextItem : item));
    setLoading(true);
    setErrorMessage('');
    try {
      const updated = await adminApi.updateFooterKeywords(nextItems);
      setItems(updated.items);
      setModalOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save keywords.');
    } finally {
      setLoading(false);
    }
  };

  const deleteKeyword = async (index: number) => {
    if (!window.confirm('Delete this keyword?')) return;
    const nextItems = items.filter((_, idx) => idx !== index);
    setLoading(true);
    setErrorMessage('');
    try {
      const updated = await adminApi.updateFooterKeywords(nextItems);
      setItems(updated.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete keyword.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Footer Keywords</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Update the keyword chips displayed in the client footer.
            </p>
          </div>
          <Button onClick={openAdd}>Add Keyword</Button>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading...</Card>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <Card key={`${item.label}-${index}`} className="p-5">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{item.label}</h3>
              {item.url ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.url}</p>
              ) : null}
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEdit(index)}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => void deleteKeyword(index)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
          {!items.length && !loading ? (
            <Card className="p-5 text-sm text-slate-600 dark:text-slate-300">
              No keywords yet. Add your first keyword.
            </Card>
          ) : null}
        </div>
      </div>
      <AdminModal
        title={editIndex === null ? 'Add Keyword' : 'Edit Keyword'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
      >
        <div className="grid gap-4">
          <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-700">Keyword</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
              placeholder="Keyword"
            />
          </label>
          <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-700">Link (optional)</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
              placeholder="https://example.com"
            />
          </label>
        </div>
      </AdminModal>
    </AdminShell>
  );
}
