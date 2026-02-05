import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ImagePicker from '../components/ui/ImagePicker';
import Input from '../components/ui/Input';
import MediaPickerModal from '../components/admin/MediaPickerModal';
import { adminApi, AdminVideoAd } from '../services/adminApi';

type VideoFormState = {
  title: string;
  description: string;
  src: string;
  poster: string;
  isActive: boolean;
  sortOrder: string;
  isNew: boolean;
};

const emptyForm: VideoFormState = {
  title: '',
  description: '',
  src: '',
  poster: '',
  isActive: true,
  sortOrder: '0',
  isNew: false
};

const isValidUrl = (value: string) => {
  if (!value) return false;
  if (value.startsWith('/')) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

export default function BossVideoAdsPage() {
  const [items, setItems] = useState<AdminVideoAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [posterPickerOpen, setPosterPickerOpen] = useState(false);
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<VideoFormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  const sortedItems = useMemo(() => {
    const list = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
    if (filterActive === 'active') {
      return list.filter((item) => item.isActive !== 0);
    }
    if (filterActive === 'inactive') {
      return list.filter((item) => item.isActive === 0);
    }
    return list;
  }, [items, filterActive]);

  const loadVideos = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await adminApi.getVideos();
      setItems(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load videos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadVideos();
  }, []);

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (item: AdminVideoAd) => {
    setEditId(item.id);
    setForm({
      title: item.title,
      description: item.description || '',
      src: item.src,
      poster: item.poster || '',
      isActive: item.isActive !== 0,
      sortOrder: String(item.sortOrder ?? 0),
      isNew: item.isNew !== 0
    });
    setFormError('');
    setModalOpen(true);
  };

  const onSave = async () => {
    setFormError('');
    if (form.title.trim().length < 3 || form.title.trim().length > 80) {
      setFormError('Title must be 3-80 characters.');
      return;
    }
    if (!isValidUrl(form.src.trim())) {
      setFormError('Valid video URL is required.');
      return;
    }
    if (form.poster.trim() && !isValidUrl(form.poster.trim())) {
      setFormError('Poster must be a valid URL.');
      return;
    }
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      src: form.src.trim(),
      poster: form.poster.trim() || null,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder) || 0,
      isNew: form.isNew
    };

    try {
      if (editId) {
        const updated = await adminApi.updateVideo(editId, payload);
        setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await adminApi.createVideo(payload);
        setItems((prev) => [created, ...prev]);
      }
      setModalOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Save failed.');
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('Delete this video ad?')) return;
    try {
      await adminApi.deleteVideo(id);
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
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Video Ads</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Control the video ad grid shown on the client homepage.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-border-subtle bg-panel-elevated p-1 text-xs font-semibold">
              <button
                type="button"
                className={`rounded-full px-3 py-1 ${
                  filterActive === 'all' ? 'bg-blue-50 text-blue-700' : 'text-slate-600'
                }`}
                onClick={() => setFilterActive('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 ${
                  filterActive === 'active' ? 'bg-blue-50 text-blue-700' : 'text-slate-600'
                }`}
                onClick={() => setFilterActive('active')}
              >
                Active
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 ${
                  filterActive === 'inactive' ? 'bg-blue-50 text-blue-700' : 'text-slate-600'
                }`}
                onClick={() => setFilterActive('inactive')}
              >
                Hidden
              </button>
            </div>
            <Button onClick={openAdd}>Add Video</Button>
          </div>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading videos...</Card>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sortedItems.map((item) => (
            <Card key={item.id} className="relative p-5">
              {item.isNew !== 0 ? (
                <span className="absolute bottom-4 right-4 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                  NEW
                </span>
              ) : null}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{item.title}</h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.isActive !== 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.isActive !== 0 ? 'Active' : 'Hidden'}
                </span>
              </div>
              {item.description ? (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
              ) : null}
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Sort order: {item.sortOrder}
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
        title={editId ? 'Edit Video Ad' : 'Add Video Ad'}
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
          label="Video URL"
          value={form.src}
          onChange={(event) => setForm({ ...form, src: event.target.value })}
          type="url"
        />
        <Button size="sm" variant="outline" onClick={() => setVideoPickerOpen(true)}>
          Pick video from Library
        </Button>
        <ImagePicker
          label="Poster image"
          initialUrl={form.poster}
          helpText="Upload or paste a poster image for the video."
          onChange={(value) => setForm({ ...form, poster: value })}
        />
        <Button size="sm" variant="outline" onClick={() => setPosterPickerOpen(true)}>
          Pick poster from Library
        </Button>
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Description</span>
          <textarea
            rows={3}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </label>
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
            Active
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
        open={videoPickerOpen}
        onClose={() => setVideoPickerOpen(false)}
        onPick={(asset) => setForm((prev) => ({ ...prev, src: asset.path }))}
        filter="Videos"
      />
      <MediaPickerModal
        open={posterPickerOpen}
        onClose={() => setPosterPickerOpen(false)}
        onPick={(asset) => setForm((prev) => ({ ...prev, poster: asset.path }))}
        filter="Images"
      />
    </AdminShell>
  );
}
