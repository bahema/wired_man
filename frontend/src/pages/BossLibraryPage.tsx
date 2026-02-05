import React from 'react';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

export default function BossLibraryPage() {
  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Global Content Library</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Manage reusable assets for the client website.
            </p>
          </div>
          <Button>Add Asset</Button>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {['Product Banners', 'Video Ads', 'Price Badges', 'Testimonials', 'Icons'].map((item) => (
            <Card key={item} className="p-5">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{item}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                12 assets - Updated today
              </p>
              <Button size="sm" className="mt-4" variant="outline">
                Manage
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}

