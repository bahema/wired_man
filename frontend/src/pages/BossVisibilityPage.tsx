import React, { useEffect, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, type AdminVisibilitySection } from '../services/adminApi';

export default function BossVisibilityPage() {
  const [sections, setSections] = useState<AdminVisibilitySection[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let activeRequest = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const data = await adminApi.getVisibility();
        if (activeRequest) {
          setSections(data.items || []);
        }
      } catch (error) {
        if (activeRequest) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load visibility settings.');
        }
      } finally {
        if (activeRequest) setLoading(false);
      }
    };
    void load();
    return () => {
      activeRequest = false;
    };
  }, []);

  const persistSections = async (nextSections: AdminVisibilitySection[], closeModal = false) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const updated = await adminApi.updateVisibility(nextSections);
      setSections(updated.items || []);
      if (closeModal) setModalOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save visibility settings.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (index: number) => {
    const nextSections = sections.map((item, idx) =>
      idx === index ? { ...item, active: !item.active } : item
    );
    void persistSections(nextSections);
  };

  const openEdit = (index: number) => {
    const section = sections[index];
    setEditIndex(index);
    setLabel(section?.label ?? '');
    setActive(Boolean(section?.active));
    setModalOpen(true);
  };

  const onSave = async () => {
    if (!label.trim()) return;
    if (editIndex === null) return;
    const nextSections = sections.map((item, idx) =>
      idx === editIndex ? { ...item, label: label.trim(), active } : item
    );
    await persistSections(nextSections, true);
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Section Visibility</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Toggle which sections are visible on the client homepage.
          </p>
        </div>
        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading...</Card>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section, index) => (
            <Card key={`${section.label}-${index}`} className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{section.label}</h3>
                <button
                  type="button"
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    section.active
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                  onClick={() => toggleSection(index)}
                >
                  {section.active ? 'Visible' : 'Hidden'}
                </button>
              </div>
              <div className="mt-4">
                <Button size="sm" variant="outline" onClick={() => openEdit(index)}>
                  Edit
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <AdminModal
        title="Edit Section"
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
      >
        <div className="grid gap-4">
          <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-700">Label</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
              placeholder="Section label"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600 sm:text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            <span className="font-medium text-slate-700">Visible</span>
          </label>
        </div>
      </AdminModal>
    </AdminShell>
  );
}
