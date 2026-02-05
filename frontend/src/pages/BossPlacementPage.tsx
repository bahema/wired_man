import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, AdminClientSection, AdminHeroPayload, AdminProduct, AdminVideoAd } from '../services/adminApi';

type SectionCard = {
  title: string;
  description: string;
  countLabel: string;
  link?: string;
  warning?: string;
};

const isActiveFlag = (value?: number | boolean | null) => Boolean(value);

export default function BossPlacementPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [videos, setVideos] = useState<AdminVideoAd[]>([]);
  const [hero, setHero] = useState<AdminHeroPayload | null>(null);
  const [featuredSlots, setFeaturedSlots] = useState([] as Array<{ isActive: number | boolean }>);
  const [clientSections, setClientSections] = useState<Record<string, AdminClientSection[]>>({});
  const [pages, setPages] = useState([] as Array<{ status: 'draft' | 'published' }>);
  const [footerKeywordsCount, setFooterKeywordsCount] = useState(0);
  const [ctaLabelsCount, setCtaLabelsCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [
          productRows,
          videoRows,
          heroRow,
          slots,
          homeSections,
          itemsSections,
          forexSections,
          pageRows,
          footerKeywords,
          ctaLabels
        ] = await Promise.all([
          adminApi.getProducts(),
          adminApi.getVideos(),
          adminApi.getHero(),
          adminApi.getFeaturedSlots(),
          adminApi.getClientSections('home'),
          adminApi.getClientSections('items'),
          adminApi.getClientSections('forex'),
          adminApi.getPages(),
          adminApi.getFooterKeywords(),
          adminApi.getCtaLabels()
        ]);
        if (!active) return;
        setProducts(productRows);
        setVideos(videoRows);
        setHero(heroRow);
        setFeaturedSlots(slots);
        setClientSections({ home: homeSections, items: itemsSections, forex: forexSections });
        setPages(pageRows);
        setFooterKeywordsCount(footerKeywords.items.length);
        setCtaLabelsCount(ctaLabels.items.length);
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load placement data.');
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

  const productCounts = useMemo(() => {
    const published = products.filter((item) => item.status === 'published');
    const byPlacement = (placement: AdminProduct['placement']) => {
      const total = products.filter((item) => item.placement === placement).length;
      const live = published.filter((item) => item.placement === placement).length;
      return { total, live };
    };
    return {
      home: byPlacement('home'),
      items: byPlacement('items'),
      forex: byPlacement('forex')
    };
  }, [products]);

  const activeVideos = videos.filter((video) => isActiveFlag(video.isActive));
  const activeFeaturedSlots = featuredSlots.filter((slot) => isActiveFlag(slot.isActive));
  const publishedPages = pages.filter((page) => page.status === 'published');

  const sectionCards: Array<{ label: string; cards: SectionCard[] }> = [
    {
      label: 'Home',
      cards: [
        {
          title: 'Hero',
          description: 'Main hero banner content on the homepage.',
          countLabel: hero ? (isActiveFlag(hero.isActive) ? 'Active' : 'Inactive') : 'Not configured',
          link: '/boss/hero',
          warning: hero ? undefined : 'Add hero content'
        },
        {
          title: 'Featured Slots',
          description: 'Featured cards beneath the hero.',
          countLabel: `${activeFeaturedSlots.length} active / ${featuredSlots.length} total`,
          link: '/boss/hero-featured',
          warning: activeFeaturedSlots.length === 0 ? 'No active slots' : undefined
        },
        {
          title: 'Top Products',
          description: 'Homepage product grid placement.',
          countLabel: `${productCounts.home.live} live / ${productCounts.home.total} total`,
          link: '/boss/products',
          warning: productCounts.home.live === 0 ? 'No published products' : undefined
        },
        {
          title: 'Video Ads',
          description: 'Homepage video ads strip.',
          countLabel: `${activeVideos.length} active / ${videos.length} total`,
          link: '/boss/videos',
          warning: activeVideos.length === 0 ? 'No active videos' : undefined
        },
        {
          title: 'Client Sections',
          description: 'Custom layout blocks for the home page.',
          countLabel: `${clientSections.home?.length ?? 0} sections`,
          link: '/boss/navigation/client/home',
          warning: (clientSections.home?.length ?? 0) === 0 ? 'No sections configured' : undefined
        }
      ]
    },
    {
      label: 'Items',
      cards: [
        {
          title: 'Product Grid',
          description: 'Products shown on the Items page.',
          countLabel: `${productCounts.items.live} live / ${productCounts.items.total} total`,
          link: '/boss/products',
          warning: productCounts.items.live === 0 ? 'No published products' : undefined
        },
        {
          title: 'Client Sections',
          description: 'Custom layout blocks for the Items page.',
          countLabel: `${clientSections.items?.length ?? 0} sections`,
          link: '/boss/navigation/client/items',
          warning: (clientSections.items?.length ?? 0) === 0 ? 'No sections configured' : undefined
        }
      ]
    },
    {
      label: 'Forex',
      cards: [
        {
          title: 'Offer Grid',
          description: 'Products shown on the Forex page.',
          countLabel: `${productCounts.forex.live} live / ${productCounts.forex.total} total`,
          link: '/boss/products',
          warning: productCounts.forex.live === 0 ? 'No published products' : undefined
        },
        {
          title: 'Client Sections',
          description: 'Custom layout blocks for the Forex page.',
          countLabel: `${clientSections.forex?.length ?? 0} sections`,
          link: '/boss/navigation/client/forex',
          warning: (clientSections.forex?.length ?? 0) === 0 ? 'No sections configured' : undefined
        }
      ]
    },
    {
      label: 'Global',
      cards: [
        {
          title: 'Footer Keywords',
          description: 'Keyword chips shown in the footer.',
          countLabel: `${footerKeywordsCount} labels`,
          link: '/boss/footer-keywords'
        },
        {
          title: 'Navigation Links',
          description: 'Client navigation links in the header/footer.',
          countLabel: `${publishedPages.length} live / ${pages.length} total`,
          link: '/boss/navigation'
        },
        {
          title: 'CTA Labels',
          description: 'Global CTA button labels.',
          countLabel: `${ctaLabelsCount} labels`,
          link: '/boss/cta'
        }
      ]
    }
  ];

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Placement Map</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Track where each asset appears on the client site and spot empty placements.
            </p>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>

        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        {loading ? (
          <Card className="p-4 text-sm text-slate-600 dark:text-slate-300">Loading placement map...</Card>
        ) : null}

        <div className="space-y-8">
          {sectionCards.map((group) => (
            <div key={group.label}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {group.label}
                </h2>
              </div>
              <div className="mt-4 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {group.cards.map((item) => (
                  <Card key={`${group.label}-${item.title}`} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                          {item.description}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {item.countLabel}
                      </span>
                    </div>
                    {item.warning ? (
                      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                        {item.warning}
                      </div>
                    ) : null}
                    {item.link ? (
                      <div className="mt-4">
                        <Link to={item.link}>
                          <Button size="sm" variant="secondary">Open</Button>
                        </Link>
                      </div>
                    ) : null}
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
