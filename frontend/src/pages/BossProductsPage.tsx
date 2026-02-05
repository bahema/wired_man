import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ImagePicker from '../components/ui/ImagePicker';
import Input from '../components/ui/Input';
import MediaPickerModal from '../components/admin/MediaPickerModal';
import { adminApi, AdminProduct } from '../services/adminApi';

type ProductFormState = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  placement: AdminProduct['placement'];
  imageUrl: string;
  galleryText: string;
  affiliateLink: string;
  ctaLabel: string;
  priceText: string;
  rating: string;
  isFeatured: boolean;
  isNew: boolean;
  status: AdminProduct['status'];
  sortOrder: string;
};

const emptyForm: ProductFormState = {
  slug: '',
  name: '',
  tagline: '',
  description: '',
  placement: 'home',
  imageUrl: '',
  galleryText: '',
  affiliateLink: '',
  ctaLabel: 'Get Access',
  priceText: '',
  rating: '',
  isFeatured: false,
  isNew: false,
  status: 'published',
  sortOrder: '0'
};

const placements: AdminProduct['placement'][] = ['home', 'items', 'forex'];

const statuses: AdminProduct['status'][] = ['draft', 'published', 'archived'];
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

export default function BossProductsPage() {
  const [items, setItems] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [formError, setFormError] = useState('');

  const [showTopOnly, setShowTopOnly] = useState(false);

  const sortedItems = useMemo(() => {
    const base = showTopOnly ? items.filter((item) => item.isFeatured) : items;
    return [...base].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [items, showTopOnly]);

  const loadProducts = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await adminApi.getProducts();
      setItems(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (product: AdminProduct) => {
    setEditId(product.id);
    setForm({
      slug: product.slug,
      name: product.name,
      tagline: product.tagline || '',
      description: product.description,
      placement: product.placement,
      imageUrl: product.imageUrl || '',
      galleryText: (product.galleryUrls || []).join(', '),
      affiliateLink: product.affiliateLink || '',
      ctaLabel: product.ctaLabel || 'Get Access',
      priceText: product.priceText || '',
      rating: product.rating ? String(product.rating) : '',
      isFeatured: Boolean(product.isFeatured),
      isNew: Boolean(product.isNew),
      status: product.status,
      sortOrder: String(product.sortOrder ?? 0)
    });
    setFormError('');
    setModalOpen(true);
  };

  const parseGallery = (text: string) =>
    text
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const onSave = async () => {
    setFormError('');
    if (!form.slug.trim() || !form.name.trim() || !form.description.trim()) {
      setFormError('Slug, name, and description are required.');
      return;
    }
    const normalizedSlug = form.slug.trim().toLowerCase();
    const slugConflict = items.find(
      (item) => item.slug.toLowerCase() === normalizedSlug && item.id !== editId
    );
    if (slugConflict) {
      setFormError('Slug must be unique. Another product already uses this slug.');
      return;
    }
    if (form.imageUrl.trim() && !isValidMediaUrl(form.imageUrl.trim())) {
      setFormError('Product image must be a valid URL or an upload path.');
      return;
    }
    const galleryUrls = parseGallery(form.galleryText);
    if (galleryUrls.some((url) => !isValidMediaUrl(url))) {
      setFormError('Gallery URLs must be valid URLs or upload paths.');
      return;
    }
    const payload = {
      slug: normalizedSlug,
      name: form.name.trim(),
      tagline: form.tagline.trim() || null,
      description: form.description.trim(),
      placement: form.placement,
      imageUrl: form.imageUrl.trim() || null,
      galleryUrls,
      affiliateLink: form.affiliateLink.trim() || null,
      ctaLabel: form.ctaLabel.trim() || 'Get Access',
      priceText: form.priceText.trim() || null,
      rating: form.rating ? Number(form.rating) : null,
      isFeatured: form.isFeatured,
      isNew: form.isNew,
      status: form.status,
      sortOrder: Number(form.sortOrder) || 0
    };

    try {
      if (editId) {
        const updated = await adminApi.updateProduct(editId, payload);
        setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await adminApi.createProduct(payload);
        setItems((prev) => [created, ...prev]);
      }
      setModalOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Save failed.');
    }
  };

  const onDelete = async (id: string) => {
    try {
      await adminApi.deleteProduct(id);
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
              Products & Offers
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Add, edit, or remove products shown on the client site.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 sm:text-sm">
              <input
                type="checkbox"
                checked={showTopOnly}
                onChange={(event) => setShowTopOnly(event.target.checked)}
                className="h-4 w-4"
              />
              Show Top Products only
            </label>
            <Button onClick={openAdd}>Add New Product</Button>
          </div>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading products...</Card>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {sortedItems.map((item) => (
            <Card key={item.id} className="relative p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {item.name}
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
              {item.isNew ? (
                <span className="absolute bottom-4 right-4 z-10 inline-flex rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                  NEW
                </span>
              ) : null}
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Slug: {item.slug}
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Placement: {item.placement}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                {item.priceText ? <span>{item.priceText}</span> : null}
                {item.isFeatured ? <span className="font-semibold">Featured</span> : null}
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
        title={editId ? 'Edit Product' : 'Add Product'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
      >
        <Input
          label="Slug"
          value={form.slug}
          onChange={(event) => setForm({ ...form, slug: event.target.value })}
          placeholder="unique-slug"
        />
        <Input
          label="Name"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <Input
          label="Tagline"
          value={form.tagline}
          onChange={(event) => setForm({ ...form, tagline: event.target.value })}
          placeholder="Optional short tagline"
        />
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Description</span>
          <textarea
            rows={4}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-700">Placement</span>
            <select
              value={form.placement}
              onChange={(event) =>
                setForm({ ...form, placement: event.target.value as AdminProduct['placement'] })
              }
              className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
            >
              {placements.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Sort order"
            type="number"
            value={form.sortOrder}
            onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
          />
        </div>
        <Input
          label="Affiliate link"
          type="url"
          value={form.affiliateLink}
          onChange={(event) => setForm({ ...form, affiliateLink: event.target.value })}
          placeholder="Optional affiliate URL"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="CTA label"
            value={form.ctaLabel}
            onChange={(event) => setForm({ ...form, ctaLabel: event.target.value })}
          />
          <Input
            label="Price text"
            value={form.priceText}
            onChange={(event) => setForm({ ...form, priceText: event.target.value })}
            placeholder="$49 on partner site"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Rating (0-5)"
            type="number"
            value={form.rating}
            onChange={(event) => setForm({ ...form, rating: event.target.value })}
          />
          <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-700">Status</span>
            <select
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value as AdminProduct['status'] })
              }
              className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
            >
              {statuses.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ImagePicker
          label="Product image"
          initialUrl={form.imageUrl}
          helpText="Upload or paste an image for this product card."
          onChange={(value) => setForm({ ...form, imageUrl: value })}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setMediaOpen(true)}>
            Pick main image
          </Button>
          <Button size="sm" variant="outline" onClick={() => setGalleryOpen(true)}>
            Add to gallery
          </Button>
        </div>
        <Input
          label="Gallery URLs (comma separated)"
          value={form.galleryText}
          onChange={(event) => setForm({ ...form, galleryText: event.target.value })}
          placeholder="https://... , https://..."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 sm:text-sm">
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={(event) => setForm({ ...form, isFeatured: event.target.checked })}
              className="h-4 w-4"
            />
            Featured
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 sm:text-sm">
            <input
              type="checkbox"
              checked={form.isNew}
              onChange={(event) => setForm({ ...form, isNew: event.target.checked })}
              className="h-4 w-4"
            />
            Mark as new
          </label>
        </div>
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
      <MediaPickerModal
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onPick={(asset) => {
          setForm((prev) => ({
            ...prev,
            galleryText: prev.galleryText
              ? `${prev.galleryText}, ${asset.path}`
              : asset.path
          }));
          setGalleryOpen(false);
        }}
        filter="Images"
      />
    </AdminShell>
  );
}
