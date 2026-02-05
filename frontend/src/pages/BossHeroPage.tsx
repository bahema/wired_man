import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import MediaPickerModal from '../components/admin/MediaPickerModal';
import { appendMediaVersion, toMediaUrl } from '../data/mediaLibrary';
import {
  DEFAULT_HERO_PRESENTER_CONFIG,
  HeroPresenterConfig,
  loadHeroPresenterConfig
} from '../data/heroPresenterConfig';
import { adminApi } from '../services/adminApi';

type ImageSlide = HeroPresenterConfig['imageSlides'][number];
type ContentSlide = HeroPresenterConfig['contentSlides'][number];

const isValidCtaHref = (value: string) => {
  if (!value.trim()) return true;
  if (value.startsWith('/')) return true;
  return /^https?:\/\//i.test(value);
};

const reorderList = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const normalizeSortOrder = <T extends { sortOrder: number }>(list: T[]) =>
  list.map((item, index) => ({ ...item, sortOrder: index }));

const buildDefaultImageSlide = (index: number): ImageSlide => ({
  id: `img-${Date.now()}-${index}`,
  imageUrl: '',
  caption: '',
  ctaLabel: 'Check out',
  ctaHref: '',
  isActive: true,
  sortOrder: index
});

const buildDefaultContentSlide = (index: number): ContentSlide => ({
  id: `content-${Date.now()}-${index}`,
  title: '',
  body: '',
  isActive: true,
  sortOrder: index
});

const ensureLength = <T,>(
  list: T[],
  length: number,
  builder: (index: number) => T
) => {
  const next = [...list];
  for (let i = next.length; i < length; i += 1) {
    next.push(builder(i));
  }
  return next;
};

export default function BossHeroPage() {
  const [config, setConfig] = useState<HeroPresenterConfig>(DEFAULT_HERO_PRESENTER_CONFIG);
  const [toast, setToast] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [previewStamp, setPreviewStamp] = useState(() => Date.now());
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const res = await adminApi.getSiteContent<HeroPresenterConfig>('hero_presenter');
        if (!active) return;
        if (res.value && typeof res.value === 'object') {
          setConfig(res.value as HeroPresenterConfig);
        } else {
          setConfig(loadHeroPresenterConfig());
        }
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load hero config.');
        setConfig(loadHeroPresenterConfig());
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const invalidLinks = useMemo(
    () =>
      config.imageSlides.reduce<Record<string, boolean>>((acc, slide) => {
        acc[slide.id] = !isValidCtaHref(slide.ctaHref);
        return acc;
      }, {}),
    [config.imageSlides]
  );

  const hasInvalidLinks = useMemo(
    () => Object.values(invalidLinks).some(Boolean),
    [invalidLinks]
  );

  const updateConfig = (updater: (prev: HeroPresenterConfig) => HeroPresenterConfig) => {
    setConfig((prev) => updater(prev));
    setPreviewStamp(Date.now());
  };

  const handleSave = async () => {
    if (hasInvalidLinks) return;
    const next = { ...config, updatedAt: new Date().toISOString() };
    try {
      const res = await adminApi.updateSiteContent('hero_presenter', next);
      const saved = res.value && typeof res.value === 'object' ? (res.value as HeroPresenterConfig) : next;
      setConfig(saved);
      setToast('Saved');
      window.setTimeout(() => setToast(''), 1500);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Save failed.');
    }
  };

  const handleReset = async () => {
    try {
      const res = await adminApi.updateSiteContent('hero_presenter', DEFAULT_HERO_PRESENTER_CONFIG);
      const saved = res.value && typeof res.value === 'object'
        ? (res.value as HeroPresenterConfig)
        : DEFAULT_HERO_PRESENTER_CONFIG;
      setConfig(saved);
      setToast('Reset to defaults');
      setPreviewStamp(Date.now());
      window.setTimeout(() => setToast(''), 1500);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Reset failed.');
    }
  };

  const updatePresenter = (key: keyof HeroPresenterConfig['presenter'], value: string) => {
    updateConfig((prev) => ({
      ...prev,
      presenter: { ...prev.presenter, [key]: value }
    }));
  };

  const updateService = (index: number, value: string) => {
    updateConfig((prev) => {
      const services = [...prev.presenter.services];
      services[index] = value;
      return { ...prev, presenter: { ...prev.presenter, services } };
    });
  };

  const addService = () => {
    updateConfig((prev) => ({
      ...prev,
      presenter: { ...prev.presenter, services: [...prev.presenter.services, ''] }
    }));
  };

  const removeService = (index: number) => {
    updateConfig((prev) => ({
      ...prev,
      presenter: {
        ...prev.presenter,
        services: prev.presenter.services.filter((_, idx) => idx !== index)
      }
    }));
  };

  const addPairedSlide = () => {
    updateConfig((prev) => ({
      ...prev,
      imageSlides: normalizeSortOrder([
        ...prev.imageSlides,
        buildDefaultImageSlide(prev.imageSlides.length)
      ]),
      contentSlides: normalizeSortOrder([
        ...prev.contentSlides,
        buildDefaultContentSlide(prev.contentSlides.length)
      ])
    }));
  };

  const moveImageSlide = (index: number, direction: -1 | 1) => {
    updateConfig((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.imageSlides.length) return prev;
      const reordered = reorderList(prev.imageSlides, index, nextIndex);
      return { ...prev, imageSlides: normalizeSortOrder(reordered) };
    });
  };

  const moveContentSlide = (index: number, direction: -1 | 1) => {
    updateConfig((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.contentSlides.length) return prev;
      const reordered = reorderList(prev.contentSlides, index, nextIndex);
      return { ...prev, contentSlides: normalizeSortOrder(reordered) };
    });
  };

  const openImagePicker = (index: number) => {
    setPickerIndex(index);
    setPickerOpen(true);
  };

  const updatePairedImage = (index: number, patch: Partial<ImageSlide>) => {
    updateConfig((prev) => {
      const next = [...prev.imageSlides];
      if (!next[index]) {
        next[index] = buildDefaultImageSlide(index);
      }
      next[index] = { ...next[index], ...patch };
      return { ...prev, imageSlides: normalizeSortOrder(next) };
    });
  };

  const updatePairedContent = (index: number, patch: Partial<ContentSlide>) => {
    updateConfig((prev) => {
      const next = [...prev.contentSlides];
      if (!next[index]) {
        next[index] = buildDefaultContentSlide(index);
      }
      next[index] = { ...next[index], ...patch };
      return { ...prev, contentSlides: normalizeSortOrder(next) };
    });
  };

  const movePairedSlide = (index: number, direction: -1 | 1) => {
    updateConfig((prev) => {
      const nextIndex = index + direction;
      const maxLen = Math.max(prev.imageSlides.length, prev.contentSlides.length);
      if (nextIndex < 0 || nextIndex >= maxLen) return prev;
      const imagesPrepared = ensureLength(prev.imageSlides, maxLen, buildDefaultImageSlide);
      const contentsPrepared = ensureLength(prev.contentSlides, maxLen, buildDefaultContentSlide);
      const images = reorderList(imagesPrepared, index, nextIndex);
      const contents = reorderList(contentsPrepared, index, nextIndex);
      return {
        ...prev,
        imageSlides: normalizeSortOrder(images),
        contentSlides: normalizeSortOrder(contents)
      };
    });
  };

  const deletePairedSlide = (index: number) => {
    updateConfig((prev) => ({
      ...prev,
      imageSlides: normalizeSortOrder(prev.imageSlides.filter((_, idx) => idx !== index)),
      contentSlides: normalizeSortOrder(prev.contentSlides.filter((_, idx) => idx !== index))
    }));
  };

  const pairedCount = Math.max(config.imageSlides.length, config.contentSlides.length);

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">Bottom Hero</p>
          <h1 className="text-2xl font-semibold text-text">Bottom Hero</h1>
          <p className="mt-1 text-sm text-text-muted">
            Configure the hero presenter panel and sliders.
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Last saved: {config.updatedAt ? new Date(config.updatedAt).toLocaleString() : 'Never'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleReset}>
            Reset
          </Button>
          <Button onClick={handleSave} disabled={hasInvalidLinks || loading}>
            Save
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {toast ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {toast}
        </div>
      ) : null}

      {hasInvalidLinks ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          One or more CTA links are invalid. Use https:// or a relative path like /items.
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 rounded-xl border border-border-subtle bg-panel px-4 py-2 text-sm text-text-muted">
          Loading hero configuration...
        </div>
      ) : null}

      <div className="mt-6 grid gap-6">
        <Card className="p-5">
          <h2 className="text-base font-semibold text-text">Presenter</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Input
              label="Title"
              value={config.presenter.title}
              onChange={(event) => updatePresenter('title', event.target.value)}
            />
            <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
              <span className="font-medium text-text">Description</span>
              <textarea
                rows={3}
                value={config.presenter.description}
                onChange={(event) => updatePresenter('description', event.target.value)}
                className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-text shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </label>
            <Input
              label="Subscribe label"
              value={config.presenter.subscribeLabel}
              onChange={(event) => updatePresenter('subscribeLabel', event.target.value)}
            />
          </div>
          <div className="mt-4 grid gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Services</h3>
              <Button size="sm" variant="outline" onClick={addService}>
                Add service
              </Button>
            </div>
            {config.presenter.services.map((service, index) => (
              <div key={`service-${index}`} className="flex items-center gap-2">
                <Input
                  value={service}
                  onChange={(event) => updateService(index, event.target.value)}
                />
                <Button size="sm" variant="outline" onClick={() => removeService(index)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-text">Hero sliders</h2>
              <p className="mt-1 text-xs text-text-muted">
                Each image slide pairs with a content slide at the same index.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={addPairedSlide}>
              Add paired slide
            </Button>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-text">Images</h3>
              <div className="mt-3 grid gap-4">
                {Array.from({ length: pairedCount }).map((_, index) => {
                  const slide = config.imageSlides[index];
                  const resolved = appendMediaVersion(toMediaUrl(slide?.imageUrl || ''), previewStamp);
                  return (
                    <div key={`paired-image-${index}`} className="rounded-xl border border-border-subtle bg-panel p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-text">Pair {index + 1}</span>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => movePairedSlide(index, -1)}>
                            Move up
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => movePairedSlide(index, 1)}>
                            Move down
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => deletePairedSlide(index)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3">
                        <Input
                          label="Caption"
                          value={slide?.caption || ''}
                          onChange={(event) => updatePairedImage(index, { caption: event.target.value })}
                        />
                        <Input
                          label="CTA label"
                          value={slide?.ctaLabel || 'Check out'}
                          onChange={(event) => updatePairedImage(index, { ctaLabel: event.target.value })}
                        />
                        <div className="grid gap-2">
                          <Input
                            label="CTA link"
                            value={slide?.ctaHref || ''}
                            onChange={(event) => updatePairedImage(index, { ctaHref: event.target.value })}
                          />
                          {invalidLinks[slide?.id || ''] ? (
                            <span className="text-xs text-red-600">
                              Use https:// or a relative path like /items.
                            </span>
                          ) : null}
                        </div>
                        <Input
                          label="Image URL"
                          value={slide?.imageUrl || ''}
                          onChange={(event) => updatePairedImage(index, { imageUrl: event.target.value })}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <Button size="sm" variant="outline" onClick={() => openImagePicker(index)}>
                          Choose image
                        </Button>
                        <label className="inline-flex items-center gap-2 text-xs text-text-muted">
                          <input
                            type="checkbox"
                            checked={slide?.isActive ?? true}
                            onChange={(event) => updatePairedImage(index, { isActive: event.target.checked })}
                          />
                          Active
                        </label>
                        <Input
                          label="Sort order"
                          value={String(slide?.sortOrder ?? index)}
                          onChange={(event) =>
                            updatePairedImage(index, { sortOrder: Number(event.target.value) || 0 })
                          }
                        />
                      </div>
                      <div className="mt-3 h-32 w-full overflow-hidden rounded-xl border border-border-subtle bg-panel-elevated">
                        {slide?.imageUrl && !brokenImages[slide.id] ? (
                          <img
                            src={resolved}
                            alt={slide.caption || 'Slide preview'}
                            className="h-full w-full object-cover"
                            onError={() => setBrokenImages((prev) => ({ ...prev, [slide.id]: true }))}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-400">
                            No image
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="text-sm font-semibold text-text">Content</h3>
              <div className="mt-3 grid gap-4">
                {Array.from({ length: pairedCount }).map((_, index) => {
                  const slide = config.contentSlides[index];
                  return (
                    <div key={`paired-content-${index}`} className="rounded-xl border border-border-subtle bg-panel p-3">
                      <div className="text-xs font-semibold text-text">Pair {index + 1}</div>
                      <div className="mt-3 grid gap-3">
                        <Input
                          label="Title"
                          value={slide?.title || ''}
                          onChange={(event) => updatePairedContent(index, { title: event.target.value })}
                        />
                        <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
                          <span className="font-medium text-text">Body</span>
                          <textarea
                            rows={3}
                            value={slide?.body || ''}
                            onChange={(event) => updatePairedContent(index, { body: event.target.value })}
                            className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-text shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
                          />
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs text-text-muted">
                          <input
                            type="checkbox"
                            checked={slide?.isActive ?? true}
                            onChange={(event) => updatePairedContent(index, { isActive: event.target.checked })}
                          />
                          Active
                        </label>
                        <Input
                          label="Sort order"
                          value={String(slide?.sortOrder ?? index)}
                          onChange={(event) =>
                            updatePairedContent(index, { sortOrder: Number(event.target.value) || 0 })
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </Card>
      </div>

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(asset) => {
          if (pickerIndex === null) return;
          updatePairedImage(pickerIndex, { imageUrl: asset.path });
        }}
        filter="Images"
      />
    </AdminShell>
  );
}
