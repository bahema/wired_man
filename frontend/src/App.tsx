import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SubscribeProvider } from './context/SubscribeContext';
import SubscribeModal from './components/SubscribeModal';
import HomePage from './pages/HomePage';
import ItemsPage from './pages/ItemsPage';
import ForexPage from './pages/ForexPage';
import BossOverviewPage from './pages/BossOverviewPage';
import BossProductsPage from './pages/BossProductsPage';
import BossCampaignsPage from './pages/BossCampaignsPage';
import BossCampaignComposePage from './pages/BossCampaignComposePage';
import BossTemplatesPage from './pages/BossTemplatesPage';
import BossAutomationsPage from './pages/BossAutomationsPage';
import BossAutomationDetailPage from './pages/BossAutomationDetailPage';
import BossAudiencesPage from './pages/BossAudiencesPage';
import BossSegmentsPage from './pages/BossSegmentsPage';
import BossSegmentDetailPage from './pages/BossSegmentDetailPage';
import BossVideoAdsPage from './pages/BossVideoAdsPage';
import BossTestimonialsPage from './pages/BossTestimonialsPage';
import BossFaqsPage from './pages/BossFaqsPage';
import BossHeroTickerPage from './pages/BossHeroTickerPage';
import BossSourcesPage from './pages/BossSourcesPage';
import BossSourceDetailPage from './pages/BossSourceDetailPage';
import BossAttributionStudioPage from './pages/BossAttributionStudioPage';
import BossDeliverabilityPage from './pages/BossDeliverabilityPage';
import BossSystemHealthPage from './pages/BossSystemHealthPage';
import BossCalendarPage from './pages/BossCalendarPage';
import BossPlacementPage from './pages/BossPlacementPage';
import BossSettingsPage from './pages/BossSettingsPage';
import BossUpcomingPage from './pages/BossUpcomingPage';
import BossPartnersPage from './pages/BossPartnersPage';
import BossSubscribersPage from './pages/BossSubscribersPage';
import BossAnalyticsPage from './pages/BossAnalyticsPage';
import BossCtaManagerPage from './pages/BossCtaManagerPage';
import BossFooterKeywordsPage from './pages/BossFooterKeywordsPage';
import BossHeroFeaturedPage from './pages/BossHeroFeaturedPage';
import BossModalCopyPage from './pages/BossModalCopyPage';
import BossVisibilityPage from './pages/BossVisibilityPage';
import BossThemePage from './pages/BossThemePage';
import BossNavigationPage from './pages/BossNavigationPage';
import BossPageBuilderPage from './pages/BossPageBuilderPage';
import BossClientSectionsPage from './pages/BossClientSectionsPage';
import BossCompliancePage from './pages/BossCompliancePage';
import BossUploadsPage from './pages/BossUploadsPage';
import BossLoginPage from './pages/BossLoginPage';
import BossDiagnosticsPage from './pages/BossDiagnosticsPage';
import BossHeroPage from './pages/BossHeroPage';
import CustomPage from './pages/CustomPage';
import UnsubscribePage from './pages/UnsubscribePage';
import PreferencesPage from './pages/PreferencesPage';
import ConfirmPage from './pages/ConfirmPage';
import { adminApi } from './services/adminApi';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error?: Error }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: undefined };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[50vh] grid place-items-center text-sm text-red-700">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            App error: {this.state.error.message}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RequireAdmin({ children }: { children: React.ReactElement }) {
  const hasAdminToken =
    Boolean((import.meta as { env?: { VITE_ADMIN_TOKEN?: string } }).env?.VITE_ADMIN_TOKEN);
  if (hasAdminToken) {
    return children;
  }
  const [authorized, setAuthorized] = React.useState(false);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    const check = async () => {
      const token =
        sessionStorage.getItem('boss-admin-session') ||
        localStorage.getItem('boss-admin-session');
      if (!token) {
        if (active) {
          setAuthorized(false);
          setChecking(false);
        }
        return;
      }
      try {
        await adminApi.getSession();
        if (active) {
          setAuthorized(true);
        }
      } catch {
        sessionStorage.removeItem('boss-admin-session');
        if (active) {
          setAuthorized(false);
        }
      } finally {
        if (active) {
          setChecking(false);
        }
      }
    };
    void check();
    return () => {
      active = false;
    };
  }, []);

  if (checking) {
    return <div className="min-h-[50vh] grid place-items-center text-sm text-text-muted">Checking session...</div>;
  }
  if (!authorized) {
    return <Navigate to="/boss/login" replace />;
  }
  return children;
}

export default function App() {
  // Keep the variable to avoid unused warnings if we re-enable dev banners later.
  const isDev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV;
  return (
    <SubscribeProvider>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/forex" element={<ForexPage />} />
          <Route path="/unsubscribe" element={<UnsubscribePage />} />
          <Route path="/preferences" element={<PreferencesPage />} />
          <Route path="/confirm" element={<ConfirmPage />} />
          <Route path="/page/:slug" element={<CustomPage />} />
          <Route path="/boss/login" element={<BossLoginPage />} />
          <Route path="/boss" element={<RequireAdmin><BossOverviewPage /></RequireAdmin>} />
          <Route path="/boss/products" element={<RequireAdmin><BossProductsPage /></RequireAdmin>} />
          <Route path="/boss/videos" element={<RequireAdmin><BossVideoAdsPage /></RequireAdmin>} />
          <Route path="/boss/testimonials" element={<RequireAdmin><BossTestimonialsPage /></RequireAdmin>} />
          <Route path="/boss/faqs" element={<RequireAdmin><BossFaqsPage /></RequireAdmin>} />
          <Route path="/boss/hero" element={<RequireAdmin><BossHeroFeaturedPage /></RequireAdmin>} />
          <Route path="/boss/analytics" element={<RequireAdmin><BossAnalyticsPage /></RequireAdmin>} />
          <Route path="/boss/system-health" element={<RequireAdmin><BossSystemHealthPage /></RequireAdmin>} />
          <Route path="/boss/cta" element={<RequireAdmin><BossCtaManagerPage /></RequireAdmin>} />
          <Route path="/boss/footer-keywords" element={<RequireAdmin><BossFooterKeywordsPage /></RequireAdmin>} />
          <Route path="/boss/hero-featured" element={<RequireAdmin><BossHeroFeaturedPage /></RequireAdmin>} />
          <Route path="/boss/hero-ticker" element={<RequireAdmin><BossHeroTickerPage /></RequireAdmin>} />
          <Route path="/boss/modal-copy" element={<RequireAdmin><BossModalCopyPage /></RequireAdmin>} />
          <Route path="/boss/visibility" element={<RequireAdmin><BossVisibilityPage /></RequireAdmin>} />
          <Route path="/boss/theme" element={<RequireAdmin><BossThemePage /></RequireAdmin>} />
          <Route path="/boss/navigation" element={<RequireAdmin><BossNavigationPage /></RequireAdmin>} />
          <Route path="/boss/navigation/:id" element={<RequireAdmin><BossPageBuilderPage /></RequireAdmin>} />
          <Route path="/boss/navigation/client/:page" element={<RequireAdmin><BossClientSectionsPage /></RequireAdmin>} />
          <Route path="/boss/compliance" element={<RequireAdmin><BossCompliancePage /></RequireAdmin>} />
          <Route path="/boss/uploads" element={<RequireAdmin><BossUploadsPage /></RequireAdmin>} />
          <Route path="/boss/campaigns" element={<RequireAdmin><BossCampaignsPage /></RequireAdmin>} />
          <Route path="/boss/campaigns/new" element={<RequireAdmin><BossCampaignComposePage /></RequireAdmin>} />
          <Route path="/boss/campaigns/:id" element={<RequireAdmin><BossCampaignComposePage /></RequireAdmin>} />
          <Route path="/boss/templates" element={<RequireAdmin><BossTemplatesPage /></RequireAdmin>} />
          <Route path="/boss/automations" element={<RequireAdmin><BossAutomationsPage /></RequireAdmin>} />
          <Route path="/boss/automations/new" element={<RequireAdmin><BossAutomationDetailPage /></RequireAdmin>} />
          <Route path="/boss/automations/:id" element={<RequireAdmin><BossAutomationDetailPage /></RequireAdmin>} />
          <Route path="/boss/audiences" element={<RequireAdmin><BossAudiencesPage /></RequireAdmin>} />
          <Route path="/boss/segments" element={<RequireAdmin><BossSegmentsPage /></RequireAdmin>} />
          <Route path="/boss/segments/detail" element={<RequireAdmin><BossSegmentDetailPage /></RequireAdmin>} />
          <Route path="/boss/upcoming" element={<RequireAdmin><BossUpcomingPage /></RequireAdmin>} />
          <Route path="/boss/partners" element={<RequireAdmin><BossPartnersPage /></RequireAdmin>} />
          <Route path="/boss/subscribers" element={<RequireAdmin><BossSubscribersPage /></RequireAdmin>} />
          <Route path="/boss/sources" element={<RequireAdmin><BossSourcesPage /></RequireAdmin>} />
          <Route path="/boss/sources/detail" element={<RequireAdmin><BossSourceDetailPage /></RequireAdmin>} />
          <Route path="/boss/attribution" element={<RequireAdmin><BossAttributionStudioPage /></RequireAdmin>} />
          <Route path="/boss/deliverability" element={<RequireAdmin><BossDeliverabilityPage /></RequireAdmin>} />
          <Route path="/boss/calendar" element={<RequireAdmin><BossCalendarPage /></RequireAdmin>} />
          <Route path="/boss/library" element={<RequireAdmin><Navigate to="/boss" replace /></RequireAdmin>} />
          <Route path="/boss/placement" element={<RequireAdmin><BossPlacementPage /></RequireAdmin>} />
          <Route path="/boss/settings" element={<RequireAdmin><BossSettingsPage /></RequireAdmin>} />
          <Route path="/boss/diagnostics" element={<RequireAdmin><BossDiagnosticsPage /></RequireAdmin>} />
          <Route path="/boss/bottom-hero" element={<RequireAdmin><BossHeroPage /></RequireAdmin>} />
        </Routes>
      </ErrorBoundary>
      <SubscribeModal />
    </SubscribeProvider>
  );
}
