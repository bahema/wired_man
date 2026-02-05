type Listener = (event: MessageEvent<string>) => void;

type PollingEventSourceOptions = {
  intervalMs?: number;
};

const DEFAULT_INTERVAL_MS = 15000;

const parseUrl = (input: string) => {
  try {
    return new URL(input, window.location.origin);
  } catch {
    return null;
  }
};

const buildAdminUrl = (path: string, search: string) => `${path}${search || ''}`;

const emitEvent = (listeners: Map<string, Set<Listener>>, type: string, data: unknown) => {
  const set = listeners.get(type);
  if (!set || !set.size) return;
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  const event = new MessageEvent('message', { data: payload });
  set.forEach((listener) => {
    try {
      listener(event);
    } catch {
      // Ignore listener errors.
    }
  });
};

class PollingEventSource {
  url: string;
  intervalMs: number;
  listeners: Map<string, Set<Listener>>;
  timer: number | null;
  onerror: ((event: Event) => void) | null;
  onopen: ((event: Event) => void) | null;

  constructor(url: string, options: PollingEventSourceOptions = {}) {
    this.url = url;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.listeners = new Map();
    this.timer = window.setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    this.onerror = null;
    this.onopen = null;
    window.setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type);
    if (!set) return;
    set.delete(listener);
    if (!set.size) {
      this.listeners.delete(type);
    }
  }

  close() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick() {
    const parsed = parseUrl(this.url);
    if (!parsed) {
      emitEvent(this.listeners, 'content', { changed: ['theme', 'pages', 'analytics', 'media'] });
      return;
    }

    const pathname = parsed.pathname;
    const search = parsed.search;

    try {
      if (pathname.includes('/api/admin/segments/stream')) {
        const res = await fetch(buildAdminUrl('/api/admin/segments/summary', search));
        if (!res.ok) throw new Error('segments polling failed');
        const data = await res.json();
        emitEvent(this.listeners, 'segments', data);
        return;
      }

      if (pathname.includes('/api/admin/sources/stream')) {
        const res = await fetch(buildAdminUrl('/api/admin/sources/summary', search));
        if (!res.ok) throw new Error('sources polling failed');
        const data = await res.json();
        emitEvent(this.listeners, 'sources', data);
        return;
      }

      if (pathname.includes('/api/admin/deliverability/stream')) {
        const res = await fetch(buildAdminUrl('/api/admin/deliverability/status', search));
        if (!res.ok) throw new Error('deliverability polling failed');
        const status = await res.json();
        emitEvent(this.listeners, 'deliverability', { status });
        return;
      }

      // Default to content updates for public streams.
      emitEvent(this.listeners, 'content', {
        changed: [
          'theme',
          'pages',
          'analytics',
          'media',
          'products',
          'videos',
          'upcoming',
          'testimonials',
          'hero',
          'featured',
          'faqs',
          'partners',
          'modal-copy',
          'hero_presenter',
          'ticker'
        ],
        ts: new Date().toISOString()
      });
    } catch {
      if (this.onerror) {
        this.onerror(new Event('error'));
      }
    }
  }
}

export const installPollingEventSource = () => {
  if (typeof window === 'undefined') return;
  const usePolling =
    (import.meta as { env?: { VITE_USE_POLLING?: string } }).env?.VITE_USE_POLLING === 'true';
  if (!usePolling) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).EventSource = PollingEventSource;
};

export default PollingEventSource;
