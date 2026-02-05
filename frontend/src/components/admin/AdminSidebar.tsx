import React from 'react';
import { NavLink } from 'react-router-dom';

const navSections = [
  {
    title: 'Global Controls',
    links: [
      { to: '/boss', label: 'Dashboard' },
      { to: '/boss/analytics', label: 'Analytics' },
      { to: '/boss/system-health', label: 'System Health' },
      { to: '/boss/theme', label: 'Theme Defaults' },
      { to: '/boss/navigation', label: 'Navigation Links' },
      { to: '/boss/footer-keywords', label: 'Footer Keywords' },
      { to: '/boss/modal-copy', label: 'Subscribe Copy' },
      { to: '/boss/visibility', label: 'Section Visibility' },
      { to: '/boss/compliance', label: 'Compliance Text' },
      { to: '/boss/uploads', label: 'Uploads' },
      { to: '/boss/placement', label: 'Placement Map' },
      { to: '/boss/settings', label: 'Settings' },
      { to: '/boss/diagnostics', label: 'Diagnostics' }
    ]
  },
  {
    title: 'Home Page',
    links: [
      { to: '/boss/products', label: 'Top Products' },
      { to: '/boss/hero', label: 'Top Hero' },
      { to: '/boss/upcoming', label: 'Upcoming Products' },
      { to: '/boss/faqs', label: 'FAQs' },
      { to: '/boss/partners', label: 'Partners' },
      { to: '/boss/testimonials', label: 'Testimonials' },
      { to: '/boss/subscribers', label: 'Subscribers' },
      { to: '/boss/cta', label: 'CTA Labels' },
      { to: '/boss/videos', label: 'Video Ads' }
    ]
  },
  {
    title: 'Items Page',
    links: [{ to: '/boss/products', label: 'Products' }]
  },
  {
    title: 'Forex Page',
    links: [
      { to: '/boss/campaigns', label: 'Campaigns' },
      { to: '/boss/templates', label: 'Email Templates' },
      { to: '/boss/automations', label: 'Automations' },
      { to: '/boss/audiences', label: 'Audiences' },
      { to: '/boss/segments', label: 'Segmented Clients' },
      { to: '/boss/sources', label: 'Forms & Sources' },
      { to: '/boss/attribution', label: 'Attribution Studio' },
      { to: '/boss/deliverability', label: 'Deliverability' },
      { to: '/boss/calendar', label: 'Calendar' }
    ]
  }
];

type AdminSidebarProps = {
  onNavigate?: () => void;
};

export default function AdminSidebar({ onNavigate }: AdminSidebarProps) {
  return (
    <nav className="flex h-full flex-col gap-5 text-sm font-semibold text-text-muted">
      {navSections.map((section) => (
        <div key={section.title} className="grid gap-2">
          <div className="rounded-lg bg-red-600 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white">
            {section.title}
          </div>
          {section.links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/boss'}
              onClick={onNavigate}
              className={({ isActive }) =>
                `min-h-[44px] rounded-xl px-3 py-3 whitespace-normal leading-snug transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-panel-elevated'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      ))}
      <div className="mt-auto grid gap-2 border-t border-border-subtle pt-4">
        <div className="rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white">
          Tools
        </div>
        <NavLink
          to="/boss/bottom-hero"
          onClick={onNavigate}
          className={({ isActive }) =>
            `min-h-[44px] rounded-xl px-3 py-3 whitespace-normal leading-snug transition ${
              isActive ? 'bg-blue-50 text-blue-700' : 'hover:bg-panel-elevated'
            }`
          }
        >
          Bottom Hero
        </NavLink>
      </div>
    </nav>
  );
}
