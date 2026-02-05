import React, { useEffect, useMemo, useState } from 'react';
import Button from './ui/Button';
import Input from './ui/Input';
import { useSubscribe } from '../context/SubscribeContext';
import { getSessionId, publicApi } from '../services/publicApi';
import { COUNTRY_OPTIONS } from '../data/countries';

type SubscribeModalProps = {
  onSubscribed?: () => void;
};

export default function SubscribeModal({ onSubscribed }: SubscribeModalProps) {
  const detectCountry = () => {
    if (typeof navigator === 'undefined') return 'US';
    const locales = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
    for (const locale of locales) {
      const match = locale.match(/[-_](\w{2})$/);
      if (!match) continue;
      const code = match[1].toUpperCase();
      if (COUNTRY_OPTIONS.some((option) => option.code === code)) {
        return code;
      }
    }
    return 'US';
  };

  const { isOpen, close, intent, clearIntent, completeIntent } = useSubscribe();
  const [successMessage, setSuccessMessage] = useState('');
  const [alreadySubscribed, setAlreadySubscribed] = useState(false);
  const defaultCountry = useMemo(() => detectCountry(), []);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    country: defaultCountry,
    interests: [] as string[]
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalCopy, setModalCopy] = useState({
    title: 'Subscribe',
    subtitle: 'No account required. We will email you updates.',
    ctaLabel: 'Submit',
    privacyNote: 'Please check your inbox. Look in Spam, Promotions, or Updates.'
  });

  const interestOptions = useMemo(
    () => ['tech', 'ai', 'automation', 'health', 'money', 'general'],
    []
  );
  const countryOptions = useMemo(() => COUNTRY_OPTIONS, []);
  const selectedCountry = useMemo(
    () => countryOptions.find((country) => country.code === form.country) || countryOptions[0],
    [countryOptions, form.country]
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close]);

  useEffect(() => {
    if (isOpen) {
      setSuccessMessage('');
      setAlreadySubscribed(false);
      setErrorMessage('');
      setForm({
        name: '',
        email: '',
        phone: '',
        country: defaultCountry,
        interests: []
      });
    }
  }, [isOpen]);

  useEffect(() => {
    let active = true;
    const loadCopy = async () => {
      try {
        const data = await publicApi.fetchModalCopy();
        if (!active) return;
        setModalCopy((prev) => ({
          title: data.title || prev.title,
          subtitle: data.subtitle || prev.subtitle,
          ctaLabel: data.ctaLabel || prev.ctaLabel,
          privacyNote: data.privacyNote || prev.privacyNote
        }));
      } catch {
        // keep defaults
      }
    };
    void loadCopy();
    return () => {
      active = false;
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-sky-900/10 px-4 dark:bg-slate-950/30"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="w-full max-w-lg rounded-3xl border border-border-subtle bg-panel-elevated p-6 shadow-premium backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-text">{modalCopy.title}</h2>
            <p className="mt-1 text-sm text-text-muted">
              {modalCopy.subtitle}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={close}>
            Close
          </Button>
        </div>

        <form
          className="mt-6 grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setErrorMessage('');
            setSuccessMessage('');
            if (!form.name.trim()) {
              setErrorMessage('Name is required.');
              return;
            }
            if (!form.email.trim()) {
              setErrorMessage('Email is required.');
              return;
            }
            if (form.interests.length === 0) {
              setErrorMessage('Select at least one interest.');
              return;
            }
            setSubmitting(true);
            try {
              const source = intent?.source || window.location.pathname;
              const result = await publicApi.subscribe({
                name: form.name.trim() || undefined,
                email: form.email.trim(),
                phone: form.phone.trim() || undefined,
                country: form.country,
                interests: form.interests,
                source
              });
              if (result.alreadySubscribed) {
                localStorage.setItem('isSubscribed', 'true');
                window.dispatchEvent(new Event('subscribe-success'));
                onSubscribed?.();
                setSuccessMessage(modalCopy.privacyNote || 'You are already subscribed.');
                window.setTimeout(() => {
                  close();
                }, 1200);
                return;
              }
              if ((result as { reactivated?: boolean }).reactivated) {
                localStorage.setItem('isSubscribed', 'true');
                window.dispatchEvent(new Event('subscribe-success'));
                onSubscribed?.();
                setSuccessMessage(modalCopy.privacyNote || 'Subscription reactivated.');
                window.setTimeout(() => {
                  close();
                }, 1200);
                return;
              }
              if (intent?.affiliateLink) {
                const sessionId = getSessionId();
                if (intent.productId) {
                  await publicApi.trackClick({
                    productId: intent.productId,
                    leadId: result.leadId,
                    sessionId,
                    source
                  });
                }
                clearIntent();
                window.location.href = intent.affiliateLink;
                return;
              }
              if (intent?.type === 'video' && intent.video) {
                localStorage.setItem('isSubscribed', 'true');
                window.dispatchEvent(new Event('subscribe-success'));
                window.dispatchEvent(
                  new CustomEvent('video-subscribe-success', {
                    detail: { videoId: intent.video.id }
                  })
                );
                onSubscribed?.();
                completeIntent(intent);
                close();
                return;
              }
              localStorage.setItem('isSubscribed', 'true');
              window.dispatchEvent(new Event('subscribe-success'));
              onSubscribed?.();
              setSuccessMessage(modalCopy.privacyNote || 'Subscriber added.');
              setForm({
                name: '',
                email: '',
                phone: '',
                country: defaultCountry,
                interests: []
              });
              window.setTimeout(() => {
                close();
              }, 1200);
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Subscription failed.';
              if (message.includes('UNIQUE') || message.toLowerCase().includes('already')) {
                setErrorMessage('You are already subscribed.');
                return;
              }
              setErrorMessage(message);
            } finally {
              setSubmitting(false);
            }
          }}
        >
            <Input
              label="Name"
              name="name"
              placeholder="Your name"
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <Input
              label="Email"
              name="email"
              type="email"
              placeholder="you@email.com"
              required
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
            <Input
              label="Phone (optional)"
              name="phone"
              placeholder={`Phone or WhatsApp (${selectedCountry.dial})`}
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
            <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
              <span className="font-medium text-slate-700">Country (optional)</span>
              <select
                value={form.country}
                onChange={(event) => {
                  const next = countryOptions.find((country) => country.code === event.target.value);
                  setForm((prev) => ({
                    ...prev,
                    country: event.target.value,
                    phone: prev.phone.trim() ? prev.phone : `${next?.dial ?? ''} `
                  }));
                }}
                className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
              >
                {countryOptions.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name} ({country.dial})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
              <span className="font-medium text-slate-700">Interests (required)</span>
              <div className="flex flex-wrap gap-2">
                {interestOptions.map((option) => (
                  <label key={option} className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.interests.includes(option)}
                      onChange={(event) => {
                        setForm((prev) => {
                          if (event.target.checked) {
                            return { ...prev, interests: [...prev.interests, option] };
                          }
                          return {
                            ...prev,
                            interests: prev.interests.filter((item) => item !== option)
                          };
                        });
                      }}
                      className="h-4 w-4"
                    />
                    <span className="capitalize">{option}</span>
                  </label>
                ))}
              </div>
            </label>
          {successMessage ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </div>
              <div className="rounded-2xl border border-border-subtle bg-panel px-4 py-3 text-sm text-text">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Where to find it
                </div>
                <p className="mt-2 text-sm text-text-muted">
                  Check your inbox. If you don’t see it, look in Spam, Promotions, or Updates.
                </p>
              </div>
            </div>
          ) : null}
          {errorMessage ? (
            <div className="rounded-2xl border border-border-subtle bg-panel px-4 py-3 text-sm text-red-600">
              {errorMessage}
            </div>
          ) : null}
            <div className="flex justify-end">
              <Button type="submit" size="lg" disabled={submitting}>
                {submitting ? 'Submitting...' : modalCopy.ctaLabel}
              </Button>
            </div>
        </form>
      </div>
    </div>
  );
}
