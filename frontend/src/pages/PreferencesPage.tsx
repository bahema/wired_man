import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { publicApi } from '../services/publicApi';

export default function PreferencesPage() {
  const [searchParams] = useSearchParams();
  const [topics, setTopics] = useState('');
  const [canSave, setCanSave] = useState(true);
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: ''
  });

  const token = searchParams.get('token') || '';

  useEffect(() => {
    if (!token) {
      setCanSave(false);
      setStatus({ type: 'error', message: 'Missing preferences token.' });
      return;
    }
    setStatus({ type: 'loading', message: 'Loading preferences...' });
    void publicApi
      .fetchPreferences(token)
      .then((data) => {
        setTopics(data.preferences || '');
        setCanSave(true);
        setStatus({ type: 'idle', message: '' });
      })
      .catch(() => {
        setCanSave(false);
        setStatus({ type: 'error', message: 'Invalid or expired preferences token.' });
      });
  }, [token]);

  const savePreferences = async () => {
    if (!token) {
      setStatus({ type: 'error', message: 'Missing preferences token.' });
      setCanSave(false);
      return;
    }
    if (!canSave) {
      setStatus({ type: 'error', message: 'Invalid or expired preferences token.' });
      return;
    }
    setStatus({ type: 'loading', message: 'Saving preferences...' });
    try {
      const list = topics
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item);
      await publicApi.savePreferences(token, list);
      setStatus({ type: 'success', message: 'Preferences saved.' });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to save preferences.'
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-16 text-slate-900">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-lg">
        <h1 className="text-xl font-semibold">Email Preferences</h1>
        <p className="mt-2 text-sm text-slate-600">
          Update the topics you want to receive, comma separated.
        </p>
        <textarea
          className="mt-4 w-full rounded-xl border border-slate-200 p-3 text-sm"
          rows={5}
          value={topics}
          onChange={(event) => setTopics(event.target.value)}
          placeholder="newsletter, promos, launches"
          disabled={!token || status.type === 'loading' || !canSave}
        />
        <button
          type="button"
          onClick={savePreferences}
          disabled={!token || status.type === 'loading' || !canSave}
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Save Preferences
        </button>
        {status.type !== 'idle' ? (
          <p className={`mt-3 text-xs ${status.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
            {status.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
