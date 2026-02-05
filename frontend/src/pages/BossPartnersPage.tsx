import React, { useEffect, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ImagePicker from '../components/ui/ImagePicker';
import Input from '../components/ui/Input';
import MediaPickerModal from '../components/admin/MediaPickerModal';
import { adminApi } from '../services/adminApi';

type PartnerItem = {
  name: string;
  logo: string;
  active: boolean;
  linkUrl?: string;
};

const seedPartners: PartnerItem[] = [
  { name: 'YouTube', logo: '', active: true },
  { name: 'GetResponse', logo: '', active: true }
];

export default function BossPartnersPage() {
  const [items, setItems] = useState<PartnerItem[]>(seedPartners);
  const [modalOpen, setModalOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [form, setForm] = useState<PartnerItem>({ name: '', logo: '', active: true });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const res = await adminApi.getSiteContent<Array<{ name: string; logoUrl: string; linkUrl?: string; active?: boolean }>>('partners');
        if (!active) return;
        if (Array.isArray(res.value) && res.value.length) {
          setItems(
            res.value.map((item) => ({
              name: item.name,
              logo: item.logoUrl,
              linkUrl: item.linkUrl,
              active: item.active ?? true
            }))
          );
        } else {
          setItems(seedPartners);
        }
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load partners.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const persist = async (nextItems: PartnerItem[]) => {
    setLoading(true);
    setErrorMessage('');
    try {
      await adminApi.updateSiteContent(
        'partners',
        nextItems.map((item) => ({
          name: item.name,
          logoUrl: item.logo,
          linkUrl: item.linkUrl || '',
          active: item.active
        }))
      );
      setItems(nextItems);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save partners.');
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditIndex(null);
    setForm({ name: '', logo: '', active: true });
    setModalOpen(true);
  };

  const openEdit = (index: number) => {
    setEditIndex(index);
    setForm(items[index]);
    setModalOpen(true);
  };

  const onSave = () => {
    if (!form.name.trim()) return;
    const nextItems = editIndex === null
      ? [...items, { ...form, name: form.name.trim() }]
      : items.map((item, idx) => (idx === editIndex ? form : item));
    void persist(nextItems);
    setModalOpen(false);
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Partners</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Manage partner logos shown in the carousel.
            </p>
          </div>
          <Button onClick={openAdd}>Add Partner</Button>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <Card className="p-5 text-sm text-slate-600 dark:text-slate-300">Loading partners...</Card>
          ) : null}
          {errorMessage ? (
            <Card className="p-5 text-sm text-red-600">{errorMessage}</Card>
          ) : null}
          {!loading && !items.length ? (
            <Card className="p-5 text-sm text-slate-600 dark:text-slate-300">No partners yet.</Card>
          ) : null}
          {items.map((item, index) => (
            <Card key={`${item.name}-${index}`} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{item.name}</h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.active ? 'Active' : 'Hidden'}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Logo: {item.logo}</p>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEdit(index)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void persist(items.filter((_, idx) => idx !== index))}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <AdminModal
        title={editIndex === null ? 'Add Partner' : 'Edit Partner'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
      >
        <Input
          label="Name"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <ImagePicker
          label="Logo"
          initialUrl={form.logo}
          helpText="Upload or paste a logo image."
          onChange={(value) => setForm({ ...form, logo: value })}
        />
        <Input
          label="Link URL (optional)"
          value={form.linkUrl || ''}
          onChange={(event) => setForm({ ...form, linkUrl: event.target.value })}
        />
        <Button size="sm" variant="outline" onClick={() => setMediaOpen(true)}>
          Pick from Library
        </Button>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600 sm:text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => setForm({ ...form, active: event.target.checked })}
            className="h-4 w-4"
          />
          Active
        </label>
      </AdminModal>
      <MediaPickerModal
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onPick={(asset) => setForm((prev) => ({ ...prev, logo: asset.path }))}
        filter="Images"
      />
    </AdminShell>
  );
}
