import React, { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSubscribe } from '../context/SubscribeContext';
import { buildApiUrl } from '../data/mediaLibrary';
import { publicApi } from '../services/publicApi';

export default function Footer() {
  const { open } = useSubscribe();
  const [keywords, setKeywords] = useState<string[]>([
    'Automation',
    'Affiliate Marketing',
    'Digital Products',
    'Email Funnels',
    'AI Content',
    'YouTube Growth'
  ]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await publicApi.fetchFooterKeywords();
        if (!active) return;
        if (data.items?.length) {
          setKeywords(data.items);
        }
      } catch {
        // keep fallback keywords
      }
    };

    void load();

    const source = new EventSource(buildApiUrl('/api/public/stream'));
    const handleStream = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { changed?: string[] };
        const changed = payload.changed || [];
        if (changed.includes('footer')) {
          void load();
        }
      } catch {
        // ignore malformed events
      }
    };
    source.addEventListener('content', handleStream);

    return () => {
      active = false;
      source.removeEventListener('content', handleStream);
      source.close();
    };
  }, []);

  return (
    <footer className="border-t border-blue-200/40 bg-gradient-to-r from-blue-800 via-blue-700 to-blue-900 text-white">
      <div className="container-shell grid gap-6 py-10 sm:gap-8 sm:py-12 md:grid-cols-3">
        <div>
          <Link to="/boss/login" className="flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 rounded-full">
            <img
              src="/icons/Screenshot 2024-03-31 121526.png"
              alt="Work Pays"
              className="h-10 w-10 rounded-full"
            />
            <span className="text-sm font-semibold text-white">Work Pays</span>
          </Link>
          <p className="mt-4 text-sm text-blue-100">
            Premium automation tools, affiliate courses, and growth strategies curated for
            creators and online entrepreneurs.
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Quick Links</h3>
          <div className="mt-4 grid gap-2 text-sm text-blue-100">
            <NavLink to="/">Automation</NavLink>
            <NavLink to="/items">Your First 2000$</NavLink>
            <NavLink to="/forex">Forex Trade & Betting</NavLink>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">Keywords</h3>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-blue-100">
            {keywords.map((keyword) => (
              <button
                key={keyword}
                type="button"
                onClick={open}
                className="rounded-full border border-rose-400/60 bg-rose-500 px-3 py-1 text-xs font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:bg-rose-600"
              >
                {keyword}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
