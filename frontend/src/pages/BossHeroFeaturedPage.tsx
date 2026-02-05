import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ImagePicker from '../components/ui/ImagePicker';
import Input from '../components/ui/Input';
import MediaPickerModal from '../components/admin/MediaPickerModal';
import { adminApi, AdminFeaturedSlot, AdminHeroPayload, AdminProduct } from '../services/adminApi';

type HeroFormState = {
  id?: string;
  isActive: boolean;
  theme: AdminHeroPayload['theme'];
  title: string;
  subtitle: string;
  highlightText: string;
  backgroundImageUrl: string;
  heroBadge: string;
  primaryCtaLabel: string;
  primaryCtaAction: AdminHeroPayload['primaryCtaAction'];
  primaryCtaLink: string;
  secondaryCtaLabel: string;
  secondaryCtaLink: string;
};

type SlotFormState = {
  id?: string;
  label: string;
  productId: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  priceText: string;
  ctaLabel: string;
  ctaAction: AdminFeaturedSlot['ctaAction'];
  ctaLink: string;
  sortOrder: string;
  isActive: boolean;
};

const heroDefaults: HeroFormState = {
  isActive: true,
  theme: 'general',
  title: '',
  subtitle: '',
  highlightText: '',
  backgroundImageUrl: '',
  heroBadge: '',
  primaryCtaLabel: '',
  primaryCtaAction: 'open_subscribe_modal',
  primaryCtaLink: '',
  secondaryCtaLabel: '',
  secondaryCtaLink: ''
};

const slotDefaults: SlotFormState = {
  label: '',
  productId: '',
  title: '',
  subtitle: '',
  imageUrl: '',
  priceText: '',
  ctaLabel: '',
  ctaAction: 'open_subscribe_modal',
  ctaLink: '',
  sortOrder: '0',
  isActive: true
};

const heroThemes: AdminHeroPayload['theme'][] = [
  'tech',
  'ai',
  'automation',
  'health',
  'money',
  'general'
];

const ctaActions: AdminHeroPayload['primaryCtaAction'][] = [
  'open_subscribe_modal',
  'go_to_featured_product',
  'external_link'
];

const slotActions: AdminFeaturedSlot['ctaAction'][] = [
  'open_subscribe_modal',
  'open_affiliate_link',
  'go_to_product'
];
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

export default function BossHeroFeaturedPage() {
  const [hero, setHero] = useState<AdminHeroPayload | null>(null);
  const [featuredSlots, setFeaturedSlots] = useState<AdminFeaturedSlot[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [heroModalOpen, setHeroModalOpen] = useState(false);
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [heroForm, setHeroForm] = useState<HeroFormState>(heroDefaults);
  const [slotForm, setSlotForm] = useState<SlotFormState>(slotDefaults);
  const [slotEditId, setSlotEditId] = useState<string | null>(null);
  const [heroFormError, setHeroFormError] = useState('');
  const [slotFormError, setSlotFormError] = useState('');
  const [heroImageOpen, setHeroImageOpen] = useState(false);
  const [slotImageOpen, setSlotImageOpen] = useState(false);

  const sortedSlots = useMemo(
    () => [...featuredSlots].sort((a, b) => a.sortOrder - b.sortOrder),
    [featuredSlots]
  );
  const primarySlot = sortedSlots[0] ?? null;

  const loadData = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [heroData, slotsData, productData] = await Promise.all([
        adminApi.getHero(),
        adminApi.getFeaturedSlots(),
        adminApi.getProducts()
      ]);
      setHero(heroData);
      setFeaturedSlots(slotsData);
      setProducts(productData);
      if (heroData) {
        setHeroForm({
          id: heroData.id,
          isActive: heroData.isActive !== 0,
          theme: heroData.theme,
          title: heroData.title,
          subtitle: heroData.subtitle,
          highlightText: heroData.highlightText || '',
          backgroundImageUrl: heroData.backgroundImageUrl || '',
          heroBadge: heroData.heroBadge || '',
          primaryCtaLabel: heroData.primaryCtaLabel,
          primaryCtaAction: heroData.primaryCtaAction,
          primaryCtaLink: heroData.primaryCtaLink || '',
          secondaryCtaLabel: heroData.secondaryCtaLabel || '',
          secondaryCtaLink: heroData.secondaryCtaLink || ''
        });
      } else {
        setHeroForm(heroDefaults);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load hero data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openHeroEditor = () => {
    setHeroFormError('');
    setHeroModalOpen(true);
  };

  const openAddSlot = () => {
    setSlotEditId(null);
    setSlotForm(slotDefaults);
    setSlotFormError('');
    setSlotModalOpen(true);
  };

  const openEditSlot = (slot: AdminFeaturedSlot) => {
    setSlotEditId(slot.id);
    setSlotForm({
      id: slot.id,
      label: slot.label,
      productId: slot.productId || '',
      title: slot.title || '',
      subtitle: slot.subtitle || '',
      imageUrl: slot.imageUrl || '',
      priceText: slot.priceText || '',
      ctaLabel: slot.ctaLabel,
      ctaAction: slot.ctaAction,
      ctaLink: slot.ctaLink || '',
      sortOrder: String(slot.sortOrder ?? 0),
      isActive: slot.isActive !== 0
    });
    setSlotFormError('');
    setSlotModalOpen(true);
  };

  const onSaveHero = async () => {
    setHeroFormError('');
    if (!heroForm.title.trim() || !heroForm.subtitle.trim() || !heroForm.primaryCtaLabel.trim()) {
      setHeroFormError('Title, subtitle, and primary CTA label are required.');
      return;
    }
    if (heroForm.backgroundImageUrl.trim() && !isValidMediaUrl(heroForm.backgroundImageUrl.trim())) {
      setHeroFormError('Background image must be a valid URL or an upload path.');
      return;
    }
    const payload = {
      id: heroForm.id,
      isActive: heroForm.isActive,
      theme: heroForm.theme,
      title: heroForm.title.trim(),
      subtitle: heroForm.subtitle.trim(),
      highlightText: heroForm.highlightText.trim() || null,
      backgroundImageUrl: heroForm.backgroundImageUrl.trim() || null,
      heroBadge: heroForm.heroBadge.trim() || null,
      primaryCtaLabel: heroForm.primaryCtaLabel.trim(),
      primaryCtaAction: heroForm.primaryCtaAction,
      primaryCtaLink: heroForm.primaryCtaLink.trim() || null,
      secondaryCtaLabel: heroForm.secondaryCtaLabel.trim() || null,
      secondaryCtaLink: heroForm.secondaryCtaLink.trim() || null
    };

    try {
      const updated = await adminApi.updateHero(payload);
      setHero(updated);
      setHeroModalOpen(false);
    } catch (error) {
      setHeroFormError(error instanceof Error ? error.message : 'Save failed.');
    }
  };

  const onSaveSlot = async () => {
    setSlotFormError('');
    if (!slotForm.label.trim() || !slotForm.ctaLabel.trim()) {
      setSlotFormError('Label and CTA label are required.');
      return;
    }
    if (slotForm.ctaAction === 'open_affiliate_link' && !slotForm.ctaLink.trim()) {
      setSlotFormError('CTA link is required for affiliate link actions.');
      return;
    }
    if (slotForm.imageUrl.trim() && !isValidMediaUrl(slotForm.imageUrl.trim())) {
      setSlotFormError('Image must be a valid URL or an upload path.');
      return;
    }
    const payload = {
      label: slotForm.label.trim(),
      productId: slotForm.productId || null,
      title: slotForm.title.trim() || null,
      subtitle: slotForm.subtitle.trim() || null,
      imageUrl: slotForm.imageUrl.trim() || null,
      priceText: slotForm.priceText.trim() || null,
      ctaLabel: slotForm.ctaLabel.trim(),
      ctaAction: slotForm.ctaAction,
      ctaLink: slotForm.ctaLink.trim() || null,
      sortOrder: Number(slotForm.sortOrder) || 0,
      isActive: slotForm.isActive
    };

    try {
      if (slotEditId) {
        const updated = await adminApi.updateFeaturedSlot(slotEditId, payload);
        setFeaturedSlots((prev) => prev.map((slot) => (slot.id === updated.id ? updated : slot)));
      } else {
        const created = await adminApi.createFeaturedSlot(payload);
        setFeaturedSlots((prev) => [...prev, created]);
      }
      setSlotModalOpen(false);
    } catch (error) {
      setSlotFormError(error instanceof Error ? error.message : 'Save failed.');
    }
  };

  const onDeleteSlot = async (id: string) => {
    try {
      await adminApi.deleteFeaturedSlot(id);
      setFeaturedSlots((prev) => prev.filter((slot) => slot.id !== id));
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
              Hero & Featured Slots
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Configure the homepage hero and the featured slots below it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={openHeroEditor}>Edit Hero</Button>
            <Button
              variant="secondary"
              onClick={openAddSlot}
              disabled={featuredSlots.length >= 3}
            >
              Add Featured Slot
            </Button>
          </div>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading data...</Card>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Top Hero Content
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Controls the left hero content on the client.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={openHeroEditor}>
                Edit
              </Button>
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
              <div>Title: {hero?.title || 'Not set'}</div>
              <div>Subtitle: {hero?.subtitle || 'Not set'}</div>
              <div>Primary CTA: {hero?.primaryCtaLabel || 'Not set'}</div>
              <div>Theme: {hero?.theme || 'general'}</div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Featured Card (Right)
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Controls the right hero featured card.
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => (primarySlot ? openEditSlot(primarySlot) : openAddSlot())}
              >
                Edit
              </Button>
            </div>
            {primarySlot ? (
              <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                <div>Label: {primarySlot.label || 'Not set'}</div>
                <div>Title: {primarySlot.title || 'Not set'}</div>
                <div>Subtitle: {primarySlot.subtitle || 'Not set'}</div>
                <div>
                  CTA: {primarySlot.ctaLabel} ({primarySlot.ctaAction})
                </div>
                <div>Sort: {primarySlot.sortOrder}</div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                No featured slot yet.
              </div>
            )}
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Hero Preview
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {hero?.isActive === 0 ? 'Inactive' : 'Active'}
              </span>
            </div>
            <Button size="sm" variant="secondary" onClick={openHeroEditor}>
              Edit
            </Button>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
            <div>Title: {hero?.title || 'Not set'}</div>
            <div>Subtitle: {hero?.subtitle || 'Not set'}</div>
            <div>Primary CTA: {hero?.primaryCtaLabel || 'Not set'}</div>
            <div>Theme: {hero?.theme || 'general'}</div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sortedSlots.map((slot) => (
            <Card key={slot.id} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {slot.label}
                </h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    slot.isActive === 0
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {slot.isActive === 0 ? 'Hidden' : 'Active'}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {slot.title || 'No title set'}
              </p>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                CTA: {slot.ctaLabel} ({slot.ctaAction})
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Sort: {slot.sortOrder}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEditSlot(slot)}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => void onDeleteSlot(slot.id)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <AdminModal
        title="Edit Hero"
        open={heroModalOpen}
        onClose={() => setHeroModalOpen(false)}
        onSave={onSaveHero}
      >
        <Input
          label="Title"
          value={heroForm.title}
          onChange={(event) => setHeroForm({ ...heroForm, title: event.target.value })}
        />
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Subtitle</span>
          <textarea
            rows={3}
            value={heroForm.subtitle}
            onChange={(event) => setHeroForm({ ...heroForm, subtitle: event.target.value })}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </label>
        <Input
          label="Highlight text"
          value={heroForm.highlightText}
          onChange={(event) => setHeroForm({ ...heroForm, highlightText: event.target.value })}
        />
        <Input
          label="Hero badge"
          value={heroForm.heroBadge}
          onChange={(event) => setHeroForm({ ...heroForm, heroBadge: event.target.value })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-700">Theme</span>
            <select
              value={heroForm.theme}
              onChange={(event) =>
                setHeroForm({ ...heroForm, theme: event.target.value as AdminHeroPayload['theme'] })
              }
              className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
            >
              {heroThemes.map((theme) => (
                <option key={theme} value={theme}>
                  {theme}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 sm:text-sm">
            <input
              type="checkbox"
              checked={heroForm.isActive}
              onChange={(event) => setHeroForm({ ...heroForm, isActive: event.target.checked })}
              className="h-4 w-4"
            />
            Active
          </label>
        </div>
        <ImagePicker
          label="Background image"
          initialUrl={heroForm.backgroundImageUrl}
          helpText="Upload or paste a background image for the hero."
          onChange={(value) => setHeroForm({ ...heroForm, backgroundImageUrl: value })}
        />
        <Button size="sm" variant="outline" onClick={() => setHeroImageOpen(true)}>
          Pick from Library
        </Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Primary CTA label"
            value={heroForm.primaryCtaLabel}
            onChange={(event) => setHeroForm({ ...heroForm, primaryCtaLabel: event.target.value })}
          />
          <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-700">Primary CTA action</span>
            <select
              value={heroForm.primaryCtaAction}
              onChange={(event) =>
                setHeroForm({
                  ...heroForm,
                  primaryCtaAction: event.target.value as AdminHeroPayload['primaryCtaAction']
                })
              }
              className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
            >
              {ctaActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Input
          label="Primary CTA link (external only)"
          value={heroForm.primaryCtaLink}
          onChange={(event) => setHeroForm({ ...heroForm, primaryCtaLink: event.target.value })}
          placeholder="https://..."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Secondary CTA label"
            value={heroForm.secondaryCtaLabel}
            onChange={(event) =>
              setHeroForm({ ...heroForm, secondaryCtaLabel: event.target.value })
            }
          />
          <Input
            label="Secondary CTA link"
            value={heroForm.secondaryCtaLink}
            onChange={(event) =>
              setHeroForm({ ...heroForm, secondaryCtaLink: event.target.value })
            }
            placeholder="Optional affiliate URL"
          />
        </div>
        {heroFormError ? (
          <div className="rounded-2xl border border-border-subtle bg-panel px-4 py-3 text-sm text-red-600">
            {heroFormError}
          </div>
        ) : null}
      </AdminModal>

      <AdminModal
        title={slotEditId ? 'Edit Featured Slot' : 'Add Featured Slot'}
        open={slotModalOpen}
        onClose={() => setSlotModalOpen(false)}
        onSave={onSaveSlot}
      >
        <Input
          label="Label"
          value={slotForm.label}
          onChange={(event) => setSlotForm({ ...slotForm, label: event.target.value })}
        />
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Product (optional)</span>
          <select
            value={slotForm.productId}
            onChange={(event) => setSlotForm({ ...slotForm, productId: event.target.value })}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          >
            <option value="">None</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Title"
          value={slotForm.title}
          onChange={(event) => setSlotForm({ ...slotForm, title: event.target.value })}
        />
        <Input
          label="Subtitle"
          value={slotForm.subtitle}
          onChange={(event) => setSlotForm({ ...slotForm, subtitle: event.target.value })}
        />
        <Input
          label="Price badge text"
          value={slotForm.priceText}
          onChange={(event) => setSlotForm({ ...slotForm, priceText: event.target.value })}
          placeholder="$17 course"
        />
        <ImagePicker
          label="Image"
          initialUrl={slotForm.imageUrl}
          helpText="Upload or paste a featured slot image."
          onChange={(value) => setSlotForm({ ...slotForm, imageUrl: value })}
        />
        <Button size="sm" variant="outline" onClick={() => setSlotImageOpen(true)}>
          Pick from Library
        </Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="CTA label"
            value={slotForm.ctaLabel}
            onChange={(event) => setSlotForm({ ...slotForm, ctaLabel: event.target.value })}
          />
          <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-700">CTA action</span>
            <select
              value={slotForm.ctaAction}
              onChange={(event) =>
                setSlotForm({
                  ...slotForm,
                  ctaAction: event.target.value as AdminFeaturedSlot['ctaAction']
                })
              }
              className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
            >
              {slotActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Input
          label="CTA link"
          value={slotForm.ctaLink}
          onChange={(event) => setSlotForm({ ...slotForm, ctaLink: event.target.value })}
          placeholder="Required for affiliate links"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Sort order"
            type="number"
            value={slotForm.sortOrder}
            onChange={(event) => setSlotForm({ ...slotForm, sortOrder: event.target.value })}
          />
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 sm:text-sm">
            <input
              type="checkbox"
              checked={slotForm.isActive}
              onChange={(event) => setSlotForm({ ...slotForm, isActive: event.target.checked })}
              className="h-4 w-4"
            />
            Active
          </label>
        </div>
        {slotFormError ? (
          <div className="rounded-2xl border border-border-subtle bg-panel px-4 py-3 text-sm text-red-600">
            {slotFormError}
          </div>
        ) : null}
      </AdminModal>

      <MediaPickerModal
        open={heroImageOpen}
        onClose={() => setHeroImageOpen(false)}
        onPick={(asset) => {
          setHeroForm((prev) => ({ ...prev, backgroundImageUrl: asset.path }));
          setHeroImageOpen(false);
        }}
        filter="Images"
      />
      <MediaPickerModal
        open={slotImageOpen}
        onClose={() => setSlotImageOpen(false)}
        onPick={(asset) => {
          setSlotForm((prev) => ({ ...prev, imageUrl: asset.path }));
          setSlotImageOpen(false);
        }}
        filter="Images"
      />
    </AdminShell>
  );
}
