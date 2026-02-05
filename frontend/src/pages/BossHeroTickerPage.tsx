import React, { useEffect, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ImagePicker from '../components/ui/ImagePicker';
import Input from '../components/ui/Input';
import MediaPickerModal from '../components/admin/MediaPickerModal';
import { adminApi } from '../services/adminApi';

type HeroState = {
  headline: string;
  subtitle: string;
  primaryCta: string;
  primaryCtaLink: string;
  secondaryCta: string;
  secondaryCtaLink: string;
  featuredTitle: string;
  featuredDescription: string;
  featuredPrice: string;
  featuredImage: string;
};

export default function BossHeroTickerPage() {
  const [hero, setHero] = useState<HeroState>({
    headline: 'Automate your growth with trusted tools.',
    subtitle: 'Premium automation resources and courses to help you scale faster.',
    primaryCta: 'Subscribe for updates',
    primaryCtaLink: 'https://example.com/subscribe',
    secondaryCta: 'Get featured offers',
    secondaryCtaLink: 'https://example.com/offers',
    featuredTitle: 'Premium Automation Stack',
    featuredDescription: 'Everything you need to automate content and grow consistently.',
    featuredPrice: '$17 course',
    featuredImage: ''
  });
  const [tickerItems, setTickerItems] = useState(['Aline - Kigali', 'Eric - Musanze', 'Diane - Huye']);
  const [heroModalOpen, setHeroModalOpen] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [tickerModalOpen, setTickerModalOpen] = useState(false);
  const [tickerEditIndex, setTickerEditIndex] = useState<number | null>(null);
  const [tickerValue, setTickerValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const res = await adminApi.getSiteContent<Array<{ text: string; linkUrl?: string; isActive?: boolean; sortOrder?: number }>>('hero_ticker');
        if (!active) return;
        if (Array.isArray(res.value) && res.value.length) {
          const next = res.value
            .filter((item) => item.isActive ?? true)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((item) => item.text)
            .filter(Boolean);
          setTickerItems(next.length ? next : []);
        } else {
          setTickerItems([]);
        }
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load ticker items.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const persistTicker = async (nextItems: string[]) => {
    setLoading(true);
    setErrorMessage('');
    try {
      await adminApi.updateSiteContent(
        'hero_ticker',
        nextItems.map((text, idx) => ({
          text,
          linkUrl: '',
          isActive: true,
          sortOrder: idx
        }))
      );
      setTickerItems(nextItems);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save ticker items.');
    } finally {
      setLoading(false);
    }
  };

  const onSaveHero = () => {
    setHero((prev) => ({ ...prev }));
    setHeroModalOpen(false);
  };

  const openTickerAdd = () => {
    setTickerEditIndex(null);
    setTickerValue('');
    setTickerModalOpen(true);
  };

  const openTickerEdit = (index: number) => {
    setTickerEditIndex(index);
    setTickerValue(tickerItems[index]);
    setTickerModalOpen(true);
  };

  const onSaveTicker = () => {
    if (!tickerValue.trim()) return;
    const nextItems = tickerEditIndex === null
      ? [...tickerItems, tickerValue.trim()]
      : tickerItems.map((item, idx) => (idx === tickerEditIndex ? tickerValue.trim() : item));
    void persistTicker(nextItems);
    setTickerModalOpen(false);
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Hero & Ticker</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Manage hero messaging, featured card, and ticker items.
            </p>
          </div>
          <Button onClick={() => setHeroModalOpen(true)}>Edit Hero</Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Hero Content</h2>
            <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
              <div>Headline: {hero.headline}</div>
              <div>Subtitle: {hero.subtitle}</div>
              <div>Primary CTA: {hero.primaryCta}</div>
              <div className="text-xs text-slate-500">Primary link: {hero.primaryCtaLink}</div>
              <div>Secondary CTA: {hero.secondaryCta}</div>
              <div className="text-xs text-slate-500">Secondary link: {hero.secondaryCtaLink}</div>
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Featured Card</h2>
            <div className="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
              <div>Title: {hero.featuredTitle}</div>
              <div>Description: {hero.featuredDescription}</div>
              <div>Price: {hero.featuredPrice}</div>
              <div>Image: {hero.featuredImage}</div>
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Ticker Items</h2>
            <Button size="sm" onClick={openTickerAdd}>Add Item</Button>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
            {loading ? (
              <div className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 dark:border-slate-700/70 dark:bg-slate-900/80">
                Loading ticker items...
              </div>
            ) : null}
            {errorMessage ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                {errorMessage}
              </div>
            ) : null}
            {!loading && !tickerItems.length ? (
              <div className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 dark:border-slate-700/70 dark:bg-slate-900/80">
                No ticker items yet.
              </div>
            ) : null}
            {tickerItems.map((item, index) => (
              <div
                key={`${item}-${index}`}
                className="flex items-center justify-between rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 dark:border-slate-700/70 dark:bg-slate-900/80"
              >
                <span>{item}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openTickerEdit(index)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void persistTicker(tickerItems.filter((_, idx) => idx !== index))}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <AdminModal
        title="Edit Hero"
        open={heroModalOpen}
        onClose={() => setHeroModalOpen(false)}
        onSave={onSaveHero}
      >
        <Input
          label="Headline"
          value={hero.headline}
          onChange={(event) => setHero({ ...hero, headline: event.target.value })}
        />
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Subtitle</span>
          <textarea
            rows={3}
            value={hero.subtitle}
            onChange={(event) => setHero({ ...hero, subtitle: event.target.value })}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Primary CTA"
            value={hero.primaryCta}
            onChange={(event) => setHero({ ...hero, primaryCta: event.target.value })}
          />
          <Input
            label="Primary CTA link"
            value={hero.primaryCtaLink}
            onChange={(event) => setHero({ ...hero, primaryCtaLink: event.target.value })}
            type="url"
            placeholder="https://example.com/subscribe"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Secondary CTA"
            value={hero.secondaryCta}
            onChange={(event) => setHero({ ...hero, secondaryCta: event.target.value })}
          />
          <Input
            label="Secondary CTA link"
            value={hero.secondaryCtaLink}
            onChange={(event) => setHero({ ...hero, secondaryCtaLink: event.target.value })}
            type="url"
            placeholder="https://example.com/offers"
          />
        </div>
        <Input
          label="Featured title"
          value={hero.featuredTitle}
          onChange={(event) => setHero({ ...hero, featuredTitle: event.target.value })}
        />
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Featured description</span>
          <textarea
            rows={3}
            value={hero.featuredDescription}
            onChange={(event) => setHero({ ...hero, featuredDescription: event.target.value })}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </label>
        <Input
          label="Featured price"
          value={hero.featuredPrice}
          onChange={(event) => setHero({ ...hero, featuredPrice: event.target.value })}
        />
        <ImagePicker
          label="Featured image"
          initialUrl={hero.featuredImage}
          helpText="Upload or paste a URL for the featured card image."
          onChange={(value) => setHero({ ...hero, featuredImage: value })}
        />
        <Button size="sm" variant="outline" onClick={() => setImagePickerOpen(true)}>
          Pick from Library
        </Button>
      </AdminModal>

      <AdminModal
        title={tickerEditIndex === null ? 'Add Ticker Item' : 'Edit Ticker Item'}
        open={tickerModalOpen}
        onClose={() => setTickerModalOpen(false)}
        onSave={onSaveTicker}
      >
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Ticker text</span>
          <input
            value={tickerValue}
            onChange={(event) => setTickerValue(event.target.value)}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </label>
      </AdminModal>

      <MediaPickerModal
        open={imagePickerOpen}
        onClose={() => setImagePickerOpen(false)}
        onPick={(asset) => setHero({ ...hero, featuredImage: asset.path })}
        filter="Images"
      />
    </AdminShell>
  );
}
