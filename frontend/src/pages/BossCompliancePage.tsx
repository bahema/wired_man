import React, { useEffect, useRef, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, type AdminComplianceSettings, type AdminWelcomeEmailConfig } from '../services/adminApi';

export default function BossCompliancePage() {
  const [text, setText] = useState('You can unsubscribe anytime.');
  const [modalOpen, setModalOpen] = useState(false);
  const [value, setValue] = useState(text);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [welcomeDraft, setWelcomeDraft] = useState<AdminWelcomeEmailConfig>({
    enabled: true,
    subject: 'Welcome to 33-item!',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    sendDelayMins: 0,
    body: 'Thanks for subscribing! Confirm your email here: {{confirmationUrl}}'
  });
  const [welcomeConfig, setWelcomeConfig] = useState<AdminWelcomeEmailConfig>(welcomeDraft);
  const [senderProfile, setSenderProfile] = useState({
    senderName: '',
    senderEmail: '',
    replyToEmail: ''
  });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const welcomeBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const confirmationToken = '{{confirmationUrl}}';
  const confirmationSnippet = `<a href="${confirmationToken}">Confirm subscription</a>`;
  const sampleBaseUrl = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://your-domain.com';
  const sampleConfirmationUrl = `${sampleBaseUrl}/confirm?token=example`;
  const welcomePreviewDoc = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; }
      body { padding: 12px; box-sizing: border-box; }
      img { max-width: 100% !important; height: auto !important; display: block; }
      table { width: 100% !important; max-width: 100% !important; }
      td, th { width: auto !important; }
      [width] { width: 100% !important; max-width: 100% !important; }
      [style*="width"] { max-width: 100% !important; }
      * { box-sizing: border-box; }
    </style>
  </head>
  <body>
    ${(welcomeDraft.body || '<div style="font-family:Arial;padding:8px;">No HTML to preview yet.</div>')
      .replace(/\{\{\s*confirmationUrl\s*\}\}/g, sampleConfirmationUrl)}
  </body>
</html>`;

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [data, settings] = await Promise.all([adminApi.getCompliance(), adminApi.getSettings()]);
        if (!active) return;
        setText(data.text || 'You can unsubscribe anytime.');
        setValue(data.text || 'You can unsubscribe anytime.');
        setWelcomeConfig(data.welcomeEmail);
        setWelcomeDraft(data.welcomeEmail);
        setSenderProfile({
          senderName: settings.senderName || '',
          senderEmail: settings.senderEmail || '',
          replyToEmail: settings.replyToEmail || ''
        });
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load compliance settings.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const persist = async (next: Partial<AdminComplianceSettings>, closeModal = false) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const updated = await adminApi.updateCompliance(next);
      setText(updated.text || text);
      setValue(updated.text || text);
      setWelcomeConfig(updated.welcomeEmail);
      setWelcomeDraft(updated.welcomeEmail);
      if (closeModal) setModalOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save compliance settings.');
    } finally {
      setLoading(false);
    }
  };

  const onSave = async () => {
    const nextText = value.trim() || text;
    await persist({ text: nextText, welcomeEmail: welcomeConfig }, true);
  };

  const onSaveWelcome = async () => {
    const nextWelcome = {
      ...welcomeDraft,
      subject: welcomeDraft.subject.trim() || welcomeConfig.subject,
      fromName: '',
      fromEmail: '',
      replyTo: '',
      body: welcomeDraft.body.trim() || welcomeConfig.body
    };
    await persist({ text, welcomeEmail: nextWelcome }, false);
    setWelcomeOpen(false);
  };

  const openWelcomeEdit = () => {
    setWelcomeDraft(welcomeConfig);
    setWelcomeOpen(true);
  };

  const copyConfirmationSnippet = async () => {
    try {
      await navigator.clipboard.writeText(confirmationSnippet);
    } catch {
      // ignore clipboard failures
    }
  };

  const insertConfirmationSnippet = () => {
    const textarea = welcomeBodyRef.current;
    const snippet = confirmationSnippet;
    if (!textarea) {
      setWelcomeDraft((prev) => ({
        ...prev,
        body: prev.body.includes(confirmationToken)
          ? prev.body
          : `${prev.body.trim()}\n\n${snippet}`.trim()
      }));
      return;
    }
    const { selectionStart, selectionEnd } = textarea;
    setWelcomeDraft((prev) => {
      const current = prev.body || '';
      const start = Math.max(0, selectionStart ?? current.length);
      const end = Math.max(0, selectionEnd ?? start);
      const next = `${current.slice(0, start)}${snippet}${current.slice(end)}`;
      return { ...prev, body: next };
    });
    window.setTimeout(() => {
      const el = welcomeBodyRef.current;
      if (!el) return;
      const pos = (selectionStart ?? 0) + snippet.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Compliance Text</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Manage footer compliance text shown on client pages.
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)}>Edit</Button>
        </div>

        <Card className="p-5">
          <p className="text-sm text-slate-600 dark:text-slate-300">{text}</p>
        </Card>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading...</Card>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Subscriber Welcome Email</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Send an automatic email immediately after a user subscribes.
            </p>
          </div>
          <Button variant="secondary" onClick={openWelcomeEdit}>
            Edit Email
          </Button>
        </div>

        <Card className="p-5 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Status</h3>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                welcomeConfig.enabled
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {welcomeConfig.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            <div><span className="font-semibold text-slate-700">Subject:</span> {welcomeConfig.subject}</div>
            <div>
              <span className="font-semibold text-slate-700">From:</span>{' '}
              {senderProfile.senderName || 'Sender'} &lt;{senderProfile.senderEmail || 'sender@example.com'}&gt;
            </div>
            <div>
              <span className="font-semibold text-slate-700">Reply-to:</span>{' '}
              {senderProfile.replyToEmail || senderProfile.senderEmail || 'reply@example.com'}
            </div>
            <div><span className="font-semibold text-slate-700">Delay:</span> {welcomeConfig.sendDelayMins} mins</div>
            <div className="mt-2 text-xs text-slate-500">
              Use {confirmationToken} in the body to insert the confirmation link.
            </div>
            <div className="mt-1 text-xs text-slate-500">
              The confirmation link uses `PUBLIC_URL` from the backend. When you move to your real domain, update `PUBLIC_URL` and the link will point to your live site.
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Sender details come from Settings and apply to all email types.
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Message preview: {welcomeConfig.body.slice(0, 120)}
            {welcomeConfig.body.length > 120 ? '...' : ''}
          </div>
        </Card>
      </div>
      <AdminModal
        title="Edit Compliance Text"
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={onSave}
      >
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Text</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
            placeholder="Compliance text"
          />
        </label>
      </AdminModal>
      <AdminModal
        title="Welcome Email"
        open={welcomeOpen}
        onClose={() => setWelcomeOpen(false)}
        onSave={onSaveWelcome}
      >
        <div className="grid gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-600 sm:text-sm">
            <input
              type="checkbox"
              checked={welcomeDraft.enabled}
              onChange={(event) =>
                setWelcomeDraft((prev) => ({ ...prev, enabled: event.target.checked }))
              }
            />
            <span className="font-medium text-slate-700">Enable welcome email</span>
          </label>
          <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-700">Subject</span>
            <input
              value={welcomeDraft.subject}
              onChange={(event) => setWelcomeDraft((prev) => ({ ...prev, subject: event.target.value }))}
              className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
              placeholder="Welcome subject"
            />
          </label>
          <div className="text-[11px] text-slate-500">
            Sender details come from Settings and apply to all emails.
          </div>
          <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-700">Send delay (minutes)</span>
            <input
              type="number"
              min={0}
              value={welcomeDraft.sendDelayMins}
              onChange={(event) =>
                setWelcomeDraft((prev) => ({ ...prev, sendDelayMins: Number(event.target.value || 0) }))
              }
              className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
              placeholder="0"
            />
          </label>
          <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
            <span className="font-medium text-slate-700">Email body (HTML supported)</span>
            <textarea
              ref={welcomeBodyRef}
              value={welcomeDraft.body}
              onChange={(event) => setWelcomeDraft((prev) => ({ ...prev, body: event.target.value }))}
              rows={6}
              className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
              placeholder="Welcome message... You can use HTML here."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={insertConfirmationSnippet}>
              Insert confirmation link
            </Button>
            <Button size="sm" variant="outline" onClick={copyConfirmationSnippet}>
              Copy confirmation link HTML
            </Button>
          </div>
          <div className="w-full overflow-hidden rounded-xl border border-border-subtle bg-panel-elevated p-3 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</div>
            <iframe
              title="Welcome email preview"
              sandbox=""
              className="h-80 w-full rounded-lg border border-border-subtle bg-white"
              srcDoc={welcomePreviewDoc}
            />
          </div>
        </div>
      </AdminModal>
    </AdminShell>
  );
}
