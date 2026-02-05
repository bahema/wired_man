import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicApi } from '../services/publicApi';

export default function ConfirmPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('Confirming your subscription...');

  useEffect(() => {
    const token = searchParams.get('token') || '';
    if (!token) {
      setStatus('error');
      setMessage('Invalid confirmation token.');
      return;
    }
    setStatus('loading');
    void publicApi
      .confirm(token)
      .then(() => {
        setStatus('success');
        setMessage('Your subscription is confirmed.');
      })
      .catch((error) => {
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Unable to confirm subscription.');
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
                <h1 className="mt-2 text-2xl font-semibold text-slate-900">Welcome aboard! 🎉</h1>
                <p className="mt-2 text-sm text-slate-600">{message}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Status</p>
              <p className="mt-1">
                {status === 'success'
                  ? 'Confirmed.'
                  : status === 'error'
                    ? 'Action failed.'
                    : 'Working on it.'}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
            {status === 'loading'
              ? 'Processing your request…'
              : 'Check your inbox for your welcome email and future updates.'}
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">Stay connected</h2>
            <p className="mt-2 text-sm text-slate-600">
              Follow us for new releases, offers, and updates.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900"
                href="#"
                target="_blank"
                rel="noopener noreferrer"
              >
                Follow on Twitter
              </a>
              <a
                className="rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                href="#"
                target="_blank"
                rel="noopener noreferrer"
              >
                Follow on Facebook
              </a>
              <a
                className="rounded-full bg-pink-500 px-4 py-2 text-xs font-semibold text-white hover:bg-pink-600"
                href="#"
                target="_blank"
                rel="noopener noreferrer"
              >
                Follow on Instagram
              </a>
            </div>
          </div>

          {status === 'error' ? (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              The confirmation link looks invalid or expired. Please use the latest link from your email.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
