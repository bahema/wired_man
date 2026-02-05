import React, { useEffect, useState } from 'react';
import AdminModal from './AdminModal';
import { appendMediaVersion, buildApiUrl, getAssetType, MediaAssetType } from '../../data/mediaLibrary';
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

type MediaAsset = {
  name: string;
  path: string;
  type: MediaAssetType;
};

type MediaPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onPick: (asset: MediaAsset) => void;
  title?: string;
  filter?: MediaAssetType;
};

export default function MediaPickerModal({
  open,
  onClose,
  onPick,
  title = 'Pick from Media Library',
  filter
}: MediaPickerModalProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [cacheStamp, setCacheStamp] = useState(0);
  const [brokenAssets, setBrokenAssets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    setErrorMessage('');
    setCacheStamp(Date.now());
    fetch(buildApiUrl('/api/media'), {
      headers: buildAdminHeaders()
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error('Unauthorized. Please sign in again.');
          }
          throw new Error('Failed to load media.');
        }
        return res.json();
      })
      .then((data: { name: string; path: string }[]) => {
        if (!mounted) return;
        const next = data.map((asset) => ({
          name: asset.name,
          path: asset.path,
          type: getAssetType(asset.path)
        }));
        setAssets(next);
      })
      .catch((error: unknown) => {
        if (mounted) {
          setAssets([]);
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load media.');
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [open]);

  const filtered = filter ? assets.filter((asset) => asset.type === filter) : assets;
  const resolvePreview = (asset: MediaAsset) => appendMediaVersion(asset.path, cacheStamp);

  return (
    <AdminModal title={title} open={open} onClose={onClose} onSave={onClose}>
      <div className="grid gap-3">
        {loading ? (
          <div className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text-muted">
            Loading assets...
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-red-600">
            {errorMessage}
          </div>
        ) : null}
        {!loading && filtered.length === 0 ? (
          <div className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text-muted">
            No uploads yet. Add media in the Uploads page first.
          </div>
        ) : null}
        {filtered.map((asset) => (
          <button
            key={asset.name}
            type="button"
            onClick={() => {
              onPick(asset);
              onClose();
            }}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-left text-sm text-text shadow-sm transition hover:-translate-y-[1px]"
          >
            <div className="flex items-center gap-3">
              {brokenAssets[asset.name] ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle bg-panel text-[10px] font-semibold text-text-muted">
                  FILE
                </div>
              ) : asset.type === 'Images' ? (
                <img
                  src={resolvePreview(asset)}
                  alt={asset.name}
                  className="h-10 w-10 rounded-lg object-cover"
                  onError={() => setBrokenAssets((prev) => ({ ...prev, [asset.name]: true }))}
                />
              ) : asset.type === 'Videos' ? (
                <video
                  src={resolvePreview(asset)}
                  muted
                  preload="metadata"
                  className="h-10 w-10 rounded-lg object-cover"
                  onError={() => setBrokenAssets((prev) => ({ ...prev, [asset.name]: true }))}
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-subtle bg-panel text-[10px] font-semibold text-text-muted">
                  DOC
                </div>
              )}
              <div>
                <div className="font-semibold text-text">{asset.name}</div>
                <div className="text-xs text-text-muted">{asset.type}</div>
              </div>
            </div>
            <span className="rounded-full border border-border-subtle px-3 py-1 text-xs font-semibold text-text-muted">
              Select
            </span>
          </button>
        ))}
      </div>
    </AdminModal>
  );
}
