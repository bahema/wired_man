import React, { useEffect, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ImagePicker from '../components/ui/ImagePicker';
import Input from '../components/ui/Input';
import MediaPickerModal from '../components/admin/MediaPickerModal';
import { adminApi, AdminTestimonial } from '../services/adminApi';

type TestimonialFormState = {
  authorName: string;
  authorRole: string;
  authorLocation: string;
  quote: string;
  avatarUrl: string;
  rating: string;
  isFeatured: boolean;
  status: AdminTestimonial['status'];
};

const emptyForm: TestimonialFormState = {
  authorName: '',
  authorRole: '',
  authorLocation: '',
  quote: '',
  avatarUrl: '',
  rating: '',
  isFeatured: false,
  status: 'draft'
};

const statuses: AdminTestimonial['status'][] = ['draft', 'published', 'archived'];

export default function BossTestimonialsPage() {
  const [items, setItems] = useState<AdminTestimonial[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TestimonialFormState>(emptyForm);
  const [formError, setFormError] = useState('');

  const loadTestimonials = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await adminApi.getTestimonials();
      setItems(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load testimonials.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTestimonials();
  }, []);

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (item: AdminTestimonial) => {
    setEditId(item.id);
    setForm({
      authorName: item.authorName,
      authorRole: item.authorRole || '',
      authorLocation: item.authorLocation || '',
      quote: item.quote,
      avatarUrl: item.avatarUrl || '',
      rating: item.rating ? String(item.rating) : '',
      isFeatured: Boolean(item.isFeatured),
      status: item.status
    });
    setFormError('');
    setModalOpen(true);
  };

  const onSave = async () => {
    setFormError('');
    if (!form.authorName.trim() || !form.quote.trim()) {
      setFormError('Name and quote are required.');
      return;
    }
    const payload = {
      authorName: form.authorName.trim(),
      authorRole: form.authorRole.trim() || null,
      authorLocation: form.authorLocation.trim() || null,
      quote: form.quote.trim(),
      avatarUrl: form.avatarUrl.trim() || null,
      rating: form.rating ? Number(form.rating) : null,
      isFeatured: form.isFeatured,
      status: form.status
    };

    try {
      if (editId) {
        const updated = await adminApi.updateTestimonial(editId, payload);
        setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await adminApi.createTestimonial(payload);
        setItems((prev) => [created, ...prev]);
      }
      setModalOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Save failed.');
    }
  };

  const onDelete = async (id: string) => {
    try {
      await adminApi.deleteTestimonial(id);
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
              Testimonials
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Add, edit, or hide testimonials displayed on the client homepage.
            </p>
          </div>
          <Button onClick={openAdd}>Add Testimonial</Button>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">
            Loading testimonials...
          </Card>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {item.authorName}
                </h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.status === 'published'
                      ? 'bg-emerald-100 text-emerald-700'
                      : item.status === 'archived'
                      ? 'bg-slate-200 text-slate-600'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.quote}</p>
              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                {item.authorRole || 'Role not set'}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
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
        title={editId ? 'Edit Testimonial' : 'Add Testimonial'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
      >
        <Input
          label="Name"
          value={form.authorName}
          onChange={(event) => setForm({ ...form, authorName: event.target.value })}
        />
        <Input
          label="Role"
          value={form.authorRole}
          onChange={(event) => setForm({ ...form, authorRole: event.target.value })}
          placeholder="Optional role"
        />
        <Input
          label="Location"
          value={form.authorLocation}
          onChange={(event) => setForm({ ...form, authorLocation: event.target.value })}
          placeholder="Optional location"
        />
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Quote</span>
          <textarea
            rows={3}
            value={form.quote}
            onChange={(event) => setForm({ ...form, quote: event.target.value })}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </label>
        <ImagePicker
          label="Avatar URL"
          initialUrl={form.avatarUrl}
          helpText="Upload or paste an avatar image."
          onChange={(value) => setForm({ ...form, avatarUrl: value })}
        />
        <Button size="sm" variant="outline" onClick={() => setMediaOpen(true)}>
          Pick from Library
        </Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Rating (1-5)"
            type="number"
            value={form.rating}
            onChange={(event) => setForm({ ...form, rating: event.target.value })}
          />
          <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-700">Status</span>
            <select
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as AdminTestimonial['status'] })
              }
              className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600 sm:text-sm">
          <input
            type="checkbox"
            checked={form.isFeatured}
            onChange={(event) => setForm({ ...form, isFeatured: event.target.checked })}
            className="h-4 w-4"
          />
          Featured
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
          setForm((prev) => ({ ...prev, avatarUrl: asset.path }));
          setMediaOpen(false);
        }}
        filter="Images"
      />
    </AdminShell>
  );
}
