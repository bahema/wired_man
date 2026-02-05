import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import Section from '../components/ui/Section';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Slider from '../components/ui/Slider';
import Accordion from '../components/Accordion';
import Input from '../components/ui/Input';
import { appendMediaVersion, buildApiUrl } from '../data/mediaLibrary';
import { useSubscribe } from '../context/SubscribeContext';
import { PageSection, publicApi } from '../services/publicApi';

type SectionData = Record<string, any>;

const toArray = (value: any) => (Array.isArray(value) ? value : []);

export default function CustomPage() {
  const { slug } = useParams();
  const { open } = useSubscribe();
  const [sections, setSections] = useState<PageSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [mediaVersion, setMediaVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!slug) return;
      setLoading(true);
      setNotFound(false);
      try {
        const data = await publicApi.fetchPage(slug);
        if (!active) return;
        setSections(data.sections);
      } catch {
        if (active) {
          setNotFound(true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    const interval = window.setInterval(() => {
      if (!document.hidden) {
        void load();
      }
    }, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [slug]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(buildApiUrl('/api/public/media-version'));
        if (!res.ok) return;
        const data = (await res.json()) as { version?: number };
        if (active && typeof data.version === 'number') {
          setMediaVersion((prev) => (data.version !== prev ? data.version : prev));
        }
      } catch {
        // ignore
      }
    };
    void poll();
    const interval = window.setInterval(poll, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const renderSection = (section: PageSection) => {
    const data = (section.data || {}) as SectionData;

    switch (section.type) {
      case 'hero':
        return (
          <Section key={section.id}>
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl dark:text-slate-100">
                  {data.heading || 'Hero headline'}
                </h1>
                <p className="mt-3 text-base text-slate-600 dark:text-slate-300">
                  {data.subheading || 'Add a short description here.'}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {data.primaryCta ? (
                    <Button size="lg" onClick={() => open({ source: 'custom-hero' })}>
                      {data.primaryCta}
                    </Button>
                  ) : null}
                  {data.secondaryCta ? (
                    <Button size="lg" variant="secondary">
                      {data.secondaryCta}
                    </Button>
                  ) : null}
                </div>
              </div>
              <Card className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {data.cardTitle || 'Highlight'}
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {data.cardBody || 'Use this card for a quick highlight.'}
                </p>
              </Card>
            </div>
          </Section>
        );
      case 'feature-grid':
        return (
          <Section key={section.id}>
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {data.heading || 'Features'}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {toArray(data.items).map((item: any, index: number) => (
                  <Card key={`${section.id}-feature-${index}`} className="p-5">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {item.title || 'Feature title'}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      {item.text || 'Describe the feature.'}
                    </p>
                  </Card>
                ))}
              </div>
            </div>
          </Section>
        );
      case 'offer-cards':
        return (
          <Section key={section.id}>
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {data.heading || 'Offers'}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {toArray(data.items).map((item: any, index: number) => (
                  <Card key={`${section.id}-offer-${index}`} className="p-5">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {item.title || 'Offer title'}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                      {item.text || 'Offer details here.'}
                    </p>
                    <Button className="mt-4" size="sm" onClick={() => open({ source: 'custom-offer' })}>
                      {item.cta || 'Learn more'}
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          </Section>
        );
      case 'stats':
        return (
          <Section key={section.id}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {toArray(data.items).map((item: any, index: number) => (
                <Card key={`${section.id}-stat-${index}`} className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {item.label || 'Metric'}
                  </p>
                  <p className="mt-3 text-2xl font-semibold text-slate-900 dark:text-slate-100">
                    {item.value || '0'}
                  </p>
                </Card>
              ))}
            </div>
          </Section>
        );
      case 'testimonial-slider':
        return (
          <Section key={section.id}>
            <Slider
              title={data.heading || 'Testimonials'}
              subtitle={data.subheading || 'What people say'}
              items={toArray(data.items)}
              itemsPerBreakpoint={{ base: 1, md: 2, lg: 3 }}
              showDots
              autoplay
              autoplayIntervalMs={2500}
              loop
              renderItem={(item: any, index: number) => (
                <Card key={`${section.id}-testimonial-${index}`} className="p-5">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    "{item.quote || 'Testimonial copy goes here.'}"
                  </p>
                  <p className="mt-3 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {item.author || 'Subscriber'}
                  </p>
                </Card>
              )}
            />
          </Section>
        );
      case 'cta-band':
        return (
          <Section key={section.id}>
            <Card className="p-6">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {data.heading || 'Call to action'}
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {data.subheading || 'Add a supporting message.'}
              </p>
              {data.ctaLabel ? (
                <Button className="mt-4" onClick={() => open({ source: 'custom-cta' })}>
                  {data.ctaLabel}
                </Button>
              ) : null}
            </Card>
          </Section>
        );
      case 'faq':
        return (
          <Section key={section.id}>
            <div className="grid gap-6 lg:grid-cols-[0.4fr_0.6fr] lg:items-start">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {data.heading || 'FAQs'}
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {data.subheading || 'Quick answers to common questions.'}
                </p>
              </div>
              <Accordion
                items={toArray(data.items).map((item: any, index: number) => ({
                  id: item.id || `${section.id}-faq-${index}`,
                  question: item.q || 'Question',
                  answer: item.a || 'Answer'
                }))}
              />
            </div>
          </Section>
        );
      case 'video':
        return (
          <Section key={section.id}>
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {data.heading || 'Video'}
              </h2>
              <div className="rounded-2xl border border-border-subtle bg-panel-elevated p-4">
                {data.src ? (
                  <video
                    controls
                    className="w-full rounded-xl"
                    src={data.src}
                    poster={data.poster || undefined}
                  />
                ) : (
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    Add a video URL to display here.
                  </div>
                )}
              </div>
            </div>
          </Section>
        );
      case 'newsletter-form':
        return (
          <Section key={section.id}>
            <Card className="p-6">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {data.heading || 'Join the list'}
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {data.subheading || 'Get updates in your inbox.'}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input label="Email" placeholder="you@email.com" />
                <Button onClick={() => open({ source: 'custom-newsletter' })}>
                  {data.ctaLabel || 'Subscribe'}
                </Button>
              </div>
            </Card>
          </Section>
        );
      case 'gallery':
        return (
          <Section key={section.id}>
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {data.heading || 'Gallery'}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {toArray(data.items).map((item: any, index: number) => (
                  <Card key={`${section.id}-gallery-${index}`} className="overflow-hidden">
                    <div className="h-44 w-full bg-slate-100">
                      {item.src ? (
                        <img
                          src={appendMediaVersion(item.src, mediaVersion)}
                          alt={item.alt || 'Gallery image'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-400">
                          Add image
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </Section>
        );
      case 'rich-text':
        return (
          <Section key={section.id}>
            <Card className="p-6">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                {data.heading || 'Section heading'}
              </h2>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                {data.body || 'Add your content here.'}
              </p>
            </Card>
          </Section>
        );
      case 'buttons':
        return (
          <Section key={section.id}>
            <div className="flex flex-wrap gap-3">
              {toArray(data.items).map((item: any, index: number) => (
                <Button key={`${section.id}-btn-${index}`} variant={item.variant || 'primary'}>
                  {item.label || 'Button'}
                </Button>
              ))}
            </div>
          </Section>
        );
      case 'slider':
        return (
          <Section key={section.id}>
            <Slider
              title={data.heading || 'Slider'}
              subtitle={data.subheading || ''}
              items={toArray(data.items)}
              itemsPerBreakpoint={{ base: 1, sm: 2, lg: 3 }}
              showDots
              autoplay
              autoplayIntervalMs={2000}
              loop
              renderItem={(item: any, index: number) => (
                <Card key={`${section.id}-slide-${index}`} className="p-5">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {item.title || 'Slide'}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    {item.text || 'Slide detail.'}
                  </p>
                </Card>
              )}
            />
          </Section>
        );
      default:
        return (
          <Section key={section.id}>
            <Card className="p-5">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Unsupported section type: {section.type}
              </p>
            </Card>
          </Section>
        );
    }
  };

  return (
    <Layout>
      {loading ? (
        <Section>
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading page...</Card>
        </Section>
      ) : null}
      {notFound ? (
        <Section>
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Page not found.</Card>
        </Section>
      ) : null}
      {!loading && !notFound ? sections.map((section) => renderSection(section)) : null}
    </Layout>
  );
}
