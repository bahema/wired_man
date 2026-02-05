import React, { useEffect, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi } from '../services/adminApi';

export default function BossModalCopyPage() {
  const [copy, setCopy] = useState('No account required. We will email you updates.');
  const [thanks, setThanks] = useState('Please check your inbox. Look in Spam, Promotions, or Updates.');
  const [modalOpen, setModalOpen] = useState(false);
  const [tempCopy, setTempCopy] = useState(copy);
  const [tempThanks, setTempThanks] = useState(thanks);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const res = await adminApi.getSiteContent<{
          title?: string;
          subtitle?: string;
          ctaLabel?: string;
          privacyNote?: string;
        }>('subscribe_modal_copy');
        if (!active) return;
        const value = res.value || {};
        const nextCopy = value.subtitle || copy;
        const nextThanks = value.privacyNote || thanks;
        setCopy(nextCopy);
        setThanks(nextThanks);
        setTempCopy(nextCopy);
        setTempThanks(nextThanks);
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load modal copy.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const onSave = () => {
    const nextCopy = tempCopy.trim() || copy;
    const nextThanks = tempThanks.trim() || thanks;
    setCopy(nextCopy);
    setThanks(nextThanks);
    setLoading(true);
    setErrorMessage('');
    void adminApi.updateSiteContent('subscribe_modal_copy', {
      title: 'Subscribe',
      subtitle: nextCopy,
      ctaLabel: 'Submit',
      privacyNote: nextThanks
    }).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save modal copy.');
    }).finally(() => {
      setLoading(false);
    });
    setModalOpen(false);
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Subscribe Modal Copy</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Edit the helper and thank-you text shown inside the subscribe modal.
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)}>Edit Copy</Button>
        </div>

        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Helper text</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{copy}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Thank-you text</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{thanks}</p>
          {loading ? (
            <p className="mt-3 text-xs text-slate-500">Saving...</p>
          ) : null}
          {errorMessage ? (
            <p className="mt-3 text-xs text-red-600">{errorMessage}</p>
          ) : null}
        </Card>
      </div>
      <AdminModal
        title="Edit Subscribe Copy"
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
      >
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Helper text</span>
          <textarea
            rows={2}
            value={tempCopy}
            onChange={(event) => setTempCopy(event.target.value)}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </label>
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Thank-you text</span>
          <textarea
            rows={2}
            value={tempThanks}
            onChange={(event) => setTempThanks(event.target.value)}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </label>
      </AdminModal>
    </AdminShell>
  );
}
