import React from 'react';
import { Link } from 'react-router-dom';

export default function AdminFooter() {
  return (
    <footer className="mt-10 border-t border-blue-900/60 bg-blue-950 py-6 text-sm text-white">
      <div className="container-shell grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="font-semibold text-white">BossDesk Monitor</p>
          <p className="mt-1 text-xs text-blue-100">
            Quick QA links to verify live client pages after edits.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/"
            className="rounded-full border border-red-400/60 bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
          >
            Client Home
          </Link>
          <Link
            to="/items"
            className="rounded-full border border-red-400/60 bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
          >
            Client Items
          </Link>
          <Link
            to="/forex"
            className="rounded-full border border-red-400/60 bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-red-700"
          >
            Client Forex
          </Link>
        </div>
      </div>
    </footer>
  );
}
