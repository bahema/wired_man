import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ImagePicker from '../components/ui/ImagePicker';
import MediaPickerModal from '../components/admin/MediaPickerModal';
import Input from '../components/ui/Input';
import { adminApi, AdminUpcomingProduct } from '../services/adminApi';

type UpcomingFormState = {
  title: string;
  dateLabel: string;
  details: string;
  imageUrl: string;
  isActive: boolean;
  isNew: boolean;
  sortOrder: string;
};

const emptyForm: UpcomingFormState = {
  title: '',
  dateLabel: '',
  details: '',
  imageUrl: '',
  isActive: true,
  isNew: true,
  sortOrder: '0'
};
const isValidMediaUrl = (value: string) => {
  if (!value) return true;
  if (value.startsWith('/')) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

export default function BossUpcomingPage() {
  const [items, setItems] = useState<AdminUpcomingProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<UpcomingFormState>(emptyForm);
  const [formError, setFormError] = useState('');

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.sortOrder - b.sortOrder),
    [items]
  );

  const loadUpcoming = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await adminApi.getUpcoming();
      setItems(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load upcoming products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUpcoming();
  }, []);

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (item: AdminUpcomingProduct) => {
    setEditId(item.id);
    setForm({
      title: item.title,
      dateLabel: item.dateLabel,
      details: item.details,
      imageUrl: item.imageUrl || '',
      isActive: item.isActive !== 0,
      isNew: item.isNew !== 0,
      sortOrder: String(item.sortOrder ?? 0)
    });
    setFormError('');
    setModalOpen(true);
  };

  const onSave = async () => {
    setFormError('');
    if (!form.title.trim() || !form.dateLabel.trim() || !form.details.trim()) {
      setFormError('Title, date label, and details are required.');
      return;
    }
    if (form.imageUrl.trim() && !isValidMediaUrl(form.imageUrl.trim())) {
      setFormError('Image must be a valid URL or an upload path.');
      return;
    }
    const payload = {
      title: form.title.trim(),
      dateLabel: form.dateLabel.trim(),
      details: form.details.trim(),
      imageUrl: form.imageUrl.trim() || null,
      isActive: form.isActive,
      isNew: form.isNew,
      sortOrder: Number(form.sortOrder) || 0
    };

    try {
      if (editId) {
        const updated = await adminApi.updateUpcoming(editId, payload);
        setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await adminApi.createUpcoming(payload);
        setItems((prev) => [created, ...prev]);
      }
      setModalOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Save failed.');
    }
  };

  const onDelete = async (id: string) => {
    try {
      await adminApi.deleteUpcoming(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Delete failed.');
    }
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Upcoming Products
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Control the upcoming releases section on the client homepage.
            </p>
          </div>
          <Button onClick={openAdd}>Add Release</Button>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
            Loading upcoming releases...
          </Card>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sortedItems.map((item) => (
            <Card key={item.id} className="relative p-5">
              {item.isNew !== 0 ? (
                <span className="absolute bottom-4 right-4 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                  NEW
                </span>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {item.title}
                </h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.isActive === 0
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {item.isActive === 0 ? 'Hidden' : 'Visible'}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.dateLabel}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.details}</p>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEdit(item)}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => void onDelete(item.id)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <AdminModal
        title={editId ? 'Edit Upcoming' : 'Add Upcoming'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
      >
        <Input
          label="Title"
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
        <Input
          label="Date label"
          value={form.dateLabel}
          onChange={(event) => setForm({ ...form, dateLabel: event.target.value })}
          placeholder="Apr 20"
        />
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Details</span>
          <textarea
            rows={3}
            value={form.details}
            onChange={(event) => setForm({ ...form, details: event.target.value })}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </label>
        <ImagePicker
          label="Upcoming image"
          initialUrl={form.imageUrl}
          helpText="Upload or paste an image for the upcoming card."
          onChange={(value) => setForm({ ...form, imageUrl: value })}
        />
        <Button size="sm" variant="outline" onClick={() => setMediaOpen(true)}>
          Pick from Library
        </Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Sort order"
            type="number"
            value={form.sortOrder}
            onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
          />
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 sm:text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
              className="h-4 w-4"
            />
            Visible
          </label>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600 sm:text-sm">
          <input
            type="checkbox"
            checked={form.isNew}
            onChange={(event) => setForm({ ...form, isNew: event.target.checked })}
            className="h-4 w-4"
          />
          Mark as new
        </label>
        {formError ? (
          <div className="rounded-2xl border border-border-subtle bg-panel px-4 py-3 text-sm text-red-600">
            {formError}
          </div>
        ) : null}
      </AdminModal>
      <MediaPickerModal
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onPick={(asset) => {
          setForm((prev) => ({ ...prev, imageUrl: asset.path }));
          setMediaOpen(false);
        }}
        filter="Images"
      />
    </AdminShell>
  );
}
