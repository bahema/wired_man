import React, { useEffect, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi } from '../services/adminApi';

export default function BossCtaManagerPage() {
  const [items, setItems] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const response = await adminApi.getCtaLabels();
        if (active) setItems(response.items);
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load CTA labels.');
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
    setModalOpen(true);
  };

  const openEdit = (index: number) => {
    setEditIndex(index);
    setLabel(items[index]);
    setModalOpen(true);
  };

  const onSave = async () => {
    if (!label.trim()) return;
    setLoading(true);
    setErrorMessage('');
    const nextItems =
      editIndex === null
        ? [...items, label.trim()]
        : items.map((item, idx) => (idx === editIndex ? label.trim() : item));
    try {
      const response = await adminApi.updateCtaLabels(nextItems);
      setItems(response.items);
      setModalOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save CTA labels.');
    } finally {
      setLoading(false);
    }
  };

  const onDelete = async (index: number) => {
    const target = items[index];
    if (!target) return;
    if (!window.confirm(`Delete "${target}"?`)) return;
    setLoading(true);
    setErrorMessage('');
    const nextItems = items.filter((_, idx) => idx !== index);
    try {
      const response = await adminApi.updateCtaLabels(nextItems);
      setItems(response.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete CTA label.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">CTA Labels</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Manage all call-to-action labels used on the client site.
            </p>
          </div>
          <Button onClick={openAdd}>Add CTA</Button>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading CTA labels...</Card>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((text, index) => (
            <Card key={`${text}-${index}`} className="p-5">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{text}</h3>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEdit(index)}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => void onDelete(index)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <AdminModal
        title={editIndex === null ? 'Add CTA' : 'Edit CTA'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
      >
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">CTA label</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
            placeholder="CTA label"
          />
        </label>
      </AdminModal>
    </AdminShell>
  );
}
