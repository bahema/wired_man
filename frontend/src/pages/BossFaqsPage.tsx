import React, { useEffect, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi } from '../services/adminApi';

type FaqItem = {
  question: string;
  answer: string;
  active: boolean;
};

const seedFaqs: FaqItem[] = [
  { question: 'How do I get access after subscribing?', answer: 'We email you access details.', active: true },
  { question: 'Do I need experience to start?', answer: 'No, beginners are welcome.', active: true }
];

export default function BossFaqsPage() {
  const [items, setItems] = useState<FaqItem[]>(seedFaqs);
  const [modalOpen, setModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [form, setForm] = useState<FaqItem>({ question: '', answer: '', active: true });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const res = await adminApi.getSiteContent<FaqItem[]>('faqs');
        if (!active) return;
        if (Array.isArray(res.value) && res.value.length) {
          setItems(res.value);
        } else {
          setItems(seedFaqs);
        }
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load FAQs.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const persist = async (nextItems: FaqItem[]) => {
    setLoading(true);
    setErrorMessage('');
    try {
      await adminApi.updateSiteContent('faqs', nextItems);
      setItems(nextItems);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save FAQs.');
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setEditIndex(null);
    setForm({ question: '', answer: '', active: true });
    setModalOpen(true);
  };

  const openEdit = (index: number) => {
    setEditIndex(index);
    setForm(items[index]);
    setModalOpen(true);
  };

  const onSave = () => {
    if (!form.question.trim()) return;
    const nextItems = editIndex === null
      ? [...items, { ...form, question: form.question.trim() }]
      : items.map((item, idx) => (idx === editIndex ? form : item));
    void persist(nextItems);
    setModalOpen(false);
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">FAQs</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Add or edit FAQs shown on the client homepage.
            </p>
          </div>
          <Button onClick={openAdd}>Add FAQ</Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {loading ? (
            <Card className="p-5 text-sm text-slate-600 dark:text-slate-300">Loading FAQs...</Card>
          ) : null}
          {errorMessage ? (
            <Card className="p-5 text-sm text-red-600">{errorMessage}</Card>
          ) : null}
          {!loading && !items.length ? (
            <Card className="p-5 text-sm text-slate-600 dark:text-slate-300">No FAQs yet.</Card>
          ) : null}
          {items.map((item, index) => (
            <Card key={`${item.question}-${index}`} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{item.question}</h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.active ? 'Visible' : 'Hidden'}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.answer}</p>
              <div className="mt-4 flex flex-wrap gap-2">
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
        title={editIndex === null ? 'Add FAQ' : 'Edit FAQ'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
      >
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Question</span>
          <input
            value={form.question}
            onChange={(event) => setForm({ ...form, question: event.target.value })}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </label>
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Answer</span>
          <textarea
            rows={3}
            value={form.answer}
            onChange={(event) => setForm({ ...form, answer: event.target.value })}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600 sm:text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => setForm({ ...form, active: event.target.checked })}
            className="h-4 w-4"
          />
          Visible
        </label>
      </AdminModal>
    </AdminShell>
  );
}
