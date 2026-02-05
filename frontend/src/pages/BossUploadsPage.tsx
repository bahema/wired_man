import React, { useEffect, useMemo, useRef, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { appendMediaVersion, buildApiUrl, getAssetType, resolveMediaUrl } from '../data/mediaLibrary';
const SESSION_KEY = 'boss-admin-session';

const buildAdminHeaders = () => {
  const headers: Record<string, string> = {};
  const sessionToken =
    sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || '';
  if (sessionToken) {
    headers['x-admin-session'] = sessionToken;
  }
  return headers;
};

const tabs = ['Images', 'Videos', 'Documents', 'Icons'] as const;
type Asset = {
  id: string;
  name: string;
  type: typeof tabs[number];
  size: string;
  dimensions?: string;
  usedIn: string[];
  path?: string;
};

const seedAssets: Asset[] = [];

const acceptByTab: Record<(typeof tabs)[number], string> = {
  Images: 'image/*',
  Videos: 'video/*',
  Documents: '.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx',
  Icons: 'image/*'
};

export default function BossUploadsPage() {
  const [activeTab, setActiveTab] = useState<typeof tabs[number]>('Images');
  const [libraryScope, setLibraryScope] = useState<'all' | 'used'>('all');
  const [query, setQuery] = useState('');
  const [showUnused, setShowUnused] = useState(false);
  const [assets, setAssets] = useState<Asset[]>(seedAssets);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<typeof tabs[number]>('Images');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<Asset | null>(null);
  const [copyState, setCopyState] = useState<{ id: string; message: string } | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const [cacheBusters, setCacheBusters] = useState<Record<string, number>>({});
  const isNewAsset = (name: string) => {
    const match = name.match(/^(\d{10,})-/);
    if (!match) return false;
    const timestamp = Number(match[1]);
    if (!Number.isFinite(timestamp)) return false;
    const ageMs = Date.now() - timestamp;
    return ageMs >= 0 && ageMs < 7 * 24 * 60 * 60 * 1000;
  };
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [brokenAssets, setBrokenAssets] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void loadAssets();
  }, []);

  const filteredAssets = useMemo(() => {
    const baseAssets = libraryScope === 'used' ? assets.filter((asset) => asset.usedIn.length > 0) : assets;
    return baseAssets
      .filter((asset) => asset.type === activeTab)
      .filter((asset) => asset.name.toLowerCase().includes(query.toLowerCase()))
      .filter((asset) => (showUnused ? asset.usedIn.length === 0 : true));
  }, [assets, activeTab, query, showUnused, libraryScope]);

  const loadAssets = async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setErrorMessage('');
    }
    try {
      const res = await fetch(buildApiUrl('/api/media'), {
        headers: buildAdminHeaders()
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Unauthorized. Please sign in again.');
        }
        throw new Error('Failed to load uploads.');
      }
      const data = (await res.json()) as { name: string; path: string }[];
      const next = data.map((asset) => ({
        id: asset.name,
        name: asset.name,
        type: getAssetType(asset.path),
        size: '-',
        usedIn: [],
        path: asset.path
      }));
      setAssets(next);
    } catch (error) {
      if (!silent) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load uploads.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const refreshAssets = async () => {
    setRefreshing(true);
    setErrorMessage('');
    try {
      await loadAssets(true);
    } finally {
      setRefreshing(false);
    }
  };

  const onUpload = async (files: FileList | null) => {
    if (!files) return;
    setErrorMessage('');
    const token =
      sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY) || '';
    if (!token) {
      setErrorMessage('Session missing/expired. Please log in again.');
      return;
    }
    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append('files', file);
    });
    const uploadUrl = buildApiUrl('/api/media/upload');
    if (import.meta.env.DEV) {
      console.warn('[upload] url=', uploadUrl, 'hasToken=', Boolean(token));
    }
    try {
      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: buildAdminHeaders()
      });
      if (!res.ok) {
        if (res.status === 401) {
          setErrorMessage('Unauthorized. Please sign in again.');
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErrorMessage(data.error || res.statusText || 'Upload failed.');
        return;
      }
      setActiveTab(selectedType);
      await loadAssets();
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Upload network error', error);
      }
      setErrorMessage(
        `Network error while uploading to ${uploadUrl}. Check VITE_API_BASE_URL, backend running on :4000, or CORS.`
      );
    }
  };

  const onDelete = async (name: string) => {
    setErrorMessage('');
    const res = await fetch(buildApiUrl(`/api/media/${encodeURIComponent(name)}`), {
      method: 'DELETE',
      headers: buildAdminHeaders()
    });
    if (!res.ok) {
      if (res.status === 401) {
        setErrorMessage('Unauthorized. Please sign in again.');
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setErrorMessage(data.error || 'Delete failed.');
      return;
    }
    setAssets((prev) => prev.filter((asset) => asset.name !== name));
    await loadAssets(true);
  };

  const onReplace = async (asset: Asset, file: File | null) => {
    if (!file) return;
    setErrorMessage('');
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(buildApiUrl(`/api/media/${encodeURIComponent(asset.name)}`), {
      method: 'PUT',
      body: formData,
      headers: buildAdminHeaders()
    });
    if (!res.ok) {
      if (res.status === 401) {
        setErrorMessage('Unauthorized. Please sign in again.');
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setErrorMessage(data.error || 'Replace failed.');
      return;
    }
    setCacheBusters((prev) => ({ ...prev, [asset.name]: Date.now() }));
    await loadAssets(true);
    if (replaceInputRef.current) {
      replaceInputRef.current.value = '';
    }
    setReplaceTarget(null);
  };

  const openUpload = () => {
    setSelectedType(activeTab);
    setModalOpen(true);
  };

  const onCopyPath = async (asset: Asset) => {
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
    }
    try {
      await navigator.clipboard.writeText(asset.path || '');
      setCopyState({ id: asset.id, message: 'Path copied.' });
    } catch {
      setCopyState({ id: asset.id, message: 'Copy failed. Try again.' });
    }
    copyTimerRef.current = window.setTimeout(() => setCopyState(null), 900);
  };

  const getDisplayPath = (asset: Asset) => {
    if (!asset.path) return '';
    const resolved = resolveMediaUrl(asset.path);
    const stamp = cacheBusters[asset.name];
    if (!stamp) return appendMediaVersion(resolved, undefined);
    return appendMediaVersion(resolved, stamp);
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Uploads</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Manage media files used across client pages.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={refreshAssets} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button onClick={openUpload}>Upload Asset</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-border-subtle bg-panel-elevated p-1 text-xs font-semibold">
            <button
              type="button"
              className={`rounded-full px-3 py-1 ${
                libraryScope === 'all' ? 'bg-blue-50 text-blue-700' : 'text-slate-600'
              }`}
              onClick={() => setLibraryScope('all')}
            >
              All Assets
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1 ${
                libraryScope === 'used' ? 'bg-blue-50 text-blue-700' : 'text-slate-600'
              }`}
              onClick={() => setLibraryScope('used')}
            >
              Used in UI
            </button>
          </div>
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                activeTab === tab
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-200'
                  : 'border-border-subtle bg-panel-elevated text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200'
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
          <div className="flex w-full flex-wrap items-center gap-3 sm:ml-auto sm:w-auto">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search assets"
              className="w-full rounded-full border border-border-subtle bg-panel-elevated px-4 py-2 text-xs text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100 sm:w-[220px]"
            />
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showUnused}
                onChange={(event) => setShowUnused(event.target.checked)}
                className="h-4 w-4"
              />
              Unused only
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <Card className="p-5 text-sm text-slate-600 dark:text-slate-300">Loading uploads...</Card>
          ) : null}
          {errorMessage ? (
            <Card className="p-5 text-sm text-red-600">{errorMessage}</Card>
          ) : null}
          {!loading && filteredAssets.length === 0 ? (
            <Card className="p-5 text-sm text-slate-600 dark:text-slate-300">
              No uploads yet. Use the Upload Asset button to add files.
            </Card>
          ) : null}
          {filteredAssets.map((asset) => (
            <Card key={asset.id} className="relative p-5">
              <div
                className={`pointer-events-none absolute right-4 top-4 z-20 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm transition-all duration-200 ease-out ${
                  copyState?.id === asset.id ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
                }`}
              >
                {copyState?.id === asset.id ? copyState.message : 'Copied'}
              </div>
              {isNewAsset(asset.name) ? (
                <span className="absolute bottom-4 right-4 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                  NEW
                </span>
              ) : null}
              {asset.path ? (
                <div className="group relative mb-4 overflow-hidden rounded-xl border border-border-subtle bg-panel">
                  <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 rounded-lg bg-slate-900/90 px-3 py-1 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">
                    {asset.name}
                  </div>
                  {brokenAssets[asset.name] ? (
                    <div className="flex h-40 w-full items-center justify-center gap-3 px-4 text-sm text-slate-600 dark:text-slate-300">
                      <span className="rounded-lg border border-border-subtle bg-panel-elevated px-3 py-2 text-xs font-semibold text-slate-500">
                        FILE
                      </span>
                      <span className="truncate">{asset.name}</span>
                    </div>
                  ) : asset.type === 'Videos' ? (
                    <video
                      src={getDisplayPath(asset)}
                      controls
                      preload="metadata"
                      className="h-40 w-full object-cover"
                      onError={() => setBrokenAssets((prev) => ({ ...prev, [asset.name]: true }))}
                    />
                  ) : asset.type === 'Documents' ? (
                    <div className="flex h-40 items-center justify-center gap-3 px-4 text-sm text-slate-600 dark:text-slate-300">
                      <span className="rounded-lg border border-border-subtle bg-panel-elevated px-3 py-2 text-xs font-semibold text-slate-500">
                        DOC
                      </span>
                      <span className="truncate">{asset.name}</span>
                    </div>
                  ) : (
                    <img
                      src={getDisplayPath(asset)}
                      alt={asset.name}
                      loading="lazy"
                      decoding="async"
                      className="h-40 w-full object-cover"
                      onError={() => setBrokenAssets((prev) => ({ ...prev, [asset.name]: true }))}
                    />
                  )}
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="sr-only">{asset.name}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {asset.type}
                </span>
              </div>
              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                {asset.size} {asset.dimensions ? `- ${asset.dimensions}` : ''}
              </div>
              <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Used in: {asset.usedIn.length ? asset.usedIn.join(', ') : 'Unused'}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {asset.path ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void onCopyPath(asset)}
                  >
                    Copy Path
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setReplaceTarget(asset);
                    replaceInputRef.current?.click();
                  }}
                >
                  Replace
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void onDelete(asset.name)}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <AdminModal
        title="Upload Asset"
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={() => fileInputRef.current?.click()}
      >
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">What are you uploading?</span>
          <div className="grid gap-2">
            {tabs.map((tab) => (
              <label key={tab} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="upload-type"
                  checked={selectedType === tab}
                  onChange={() => setSelectedType(tab)}
                  className="h-4 w-4"
                />
                {tab}
              </label>
            ))}
          </div>
        </label>
        <p className="text-xs text-slate-600 sm:text-sm">
          All uploads go to the library and can be picked anywhere in the admin.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept={acceptByTab[selectedType]}
          onChange={(event) => {
            void onUpload(event.target.files);
            setModalOpen(false);
          }}
        />
      </AdminModal>
      <input
        ref={replaceInputRef}
        type="file"
        className="hidden"
        accept={replaceTarget ? acceptByTab[replaceTarget.type] : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          if (replaceTarget) {
            void onReplace(replaceTarget, file);
          }
        }}
      />
    </AdminShell>
  );
}

