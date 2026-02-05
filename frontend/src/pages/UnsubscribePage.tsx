import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSubscribe } from '../context/SubscribeContext';
import { publicApi } from '../services/publicApi';

export default function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const { open: openSubscribe } = useSubscribe();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('Confirming unsubscribe...');

  useEffect(() => {
    const token = searchParams.get('token') || '';
    if (!token) {
      setStatus('error');
      setMessage('Invalid unsubscribe token.');
      return;
    }
    setStatus('loading');
    void publicApi
      .unsubscribe(token)
      .then(() => {
        setStatus('success');
        setMessage('You are unsubscribed.');
      })
      .catch((error) => {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Unable to unsubscribe.');
      });
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-16 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
                {status === 'success' ? (
                  <span className="text-xl">✓</span>
                ) : status === 'error' ? (
                  <span className="text-xl">!</span>
                ) : (
                  <span className="text-xl">…</span>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Subscription Center</p>
                <h1 className="mt-2 text-2xl font-semibold text-slate-900">Unsubscribe</h1>
                <p className="mt-2 text-sm text-slate-600">{message}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Status</p>
              <p className="mt-1">
                {status === 'success'
                  ? 'Unsubscribed successfully.'
                  : status === 'error'
                    ? 'Action failed.'
                    : 'Working on it.'}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            {status === 'loading'
              ? 'Processing your request…'
              : 'Need to resubscribe? Use the button below at any time.'}
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-900">What happens next</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>No more marketing emails from us.</li>
                <li>Critical account notices may still arrive.</li>
                <li>You can resubscribe whenever you want.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white">
              <h2 className="text-base font-semibold">Want updates again?</h2>
              <p className="mt-2 text-sm text-slate-200">
                Rejoin to receive new offers, releases, and insights.
              </p>
              <button
                type="button"
                className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
                onClick={() => openSubscribe()}
              >
                Resubscribe
              </button>
            </div>
          </div>

          {status === 'error' ? (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              The unsubscribe link looks invalid or expired. If you still want to unsubscribe, please use a
              fresh link from a recent email.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
