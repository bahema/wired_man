import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { adminApi, CalendarItem } from '../services/adminApi';

export default function BossCalendarPage() {
  const [view, setView] = useState<'week' | 'month' | 'list' | 'wave'>('week');
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [conflictMessage, setConflictMessage] = useState('');
  const [toasts, setToasts] = useState<Array<{ id: string; message: string }>>([]);
  const notifiedRef = useRef(new Set<string>());
  const [modalOpen, setModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<CalendarItem | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<CalendarItem['type']>('campaign');
  const [formChannel, setFormChannel] = useState<CalendarItem['channel']>('email');
  const [formStatus, setFormStatus] = useState<CalendarItem['status']>('scheduled');
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formDuration, setFormDuration] = useState(60);
  const [formNotes, setFormNotes] = useState('');
  const [formRelatedType, setFormRelatedType] = useState<CalendarItem['relatedType'] | ''>('');
  const [formRelatedId, setFormRelatedId] = useState('');
  const [visibleStatuses, setVisibleStatuses] = useState<Record<CalendarItem['status'], boolean>>({
    draft: true,
    scheduled: true,
    sent: true,
    cancelled: true
  });
  const [statusFilter, setStatusFilter] = useState<CalendarItem['status'] | ''>('');
  const [channelFilter, setChannelFilter] = useState<CalendarItem['channel'] | ''>('');
  const [typeFilter, setTypeFilter] = useState<CalendarItem['type'] | ''>('');
  const waveItems = useMemo(() => items.filter((item) => visibleStatuses[item.status]), [items, visibleStatuses]);
  const displayItems = waveItems;

  const toLocalInput = (iso: string) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const toIsoFromLocal = (value: string) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString();
  };

  const truncateText = (value: string, max = 32) => {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
  };

  const startOfWeek = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay(); // 0 Sun
    const diff = (day + 6) % 7;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const endOfWeek = (date: Date) => {
    const start = startOfWeek(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  };

  const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

  const range = useMemo(() => {
    if (view === 'month') {
      return { start: startOfMonth(anchorDate), end: endOfMonth(anchorDate) };
    }
    if (view === 'list') {
      const start = startOfWeek(anchorDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 30);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    return { start: startOfWeek(anchorDate), end: endOfWeek(anchorDate) };
  }, [anchorDate, view]);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const payload = await adminApi.getCalendar({
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        status: statusFilter || undefined,
        channel: channelFilter || undefined,
        type: typeFilter || undefined
      });
      setItems(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load calendar.');
    } finally {
      setLoading(false);
    }
  }, [range, statusFilter, channelFilter, typeFilter]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    const sorted = [...items]
      .filter((item) => item.status === 'scheduled')
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const currentStart = Date.parse(current.scheduledAt);
      const currentEnd = currentStart + (current.durationMins || 60) * 60 * 1000;
      const nextStart = Date.parse(next.scheduledAt);
      if (!Number.isNaN(currentEnd) && !Number.isNaN(nextStart) && nextStart < currentEnd) {
        setConflictMessage(
          `Conflict: "${current.title}" overlaps "${next.title}".`
        );
        return;
      }
    }
    setConflictMessage('');
  }, [items]);

  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      const windowEnd = now + 60 * 60 * 1000;
      items.forEach((item) => {
        if (item.status !== 'scheduled') return;
        const ts = Date.parse(item.scheduledAt);
        if (Number.isNaN(ts)) return;
        if (ts < now || ts > windowEnd) return;
        if (notifiedRef.current.has(item.id)) return;
        notifiedRef.current.add(item.id);
        const timeLabel = new Date(item.scheduledAt).toLocaleTimeString();
        setToasts((prev) => [
          ...prev,
          { id: crypto.randomUUID(), message: `Reminder: ${item.title} at ${timeLabel}` }
        ]);
      });
    };
    checkReminders();
    const interval = window.setInterval(checkReminders, 60000);
    return () => window.clearInterval(interval);
  }, [items]);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  const goToday = () => setAnchorDate(new Date());
  const goPrev = () => {
    const next = new Date(anchorDate);
    if (view === 'month') {
      next.setMonth(next.getMonth() - 1);
    } else if (view === 'list') {
      next.setDate(next.getDate() - 30);
    } else {
      next.setDate(next.getDate() - 7);
    }
    setAnchorDate(next);
  };
  const goNext = () => {
    const next = new Date(anchorDate);
    if (view === 'month') {
      next.setMonth(next.getMonth() + 1);
    } else if (view === 'list') {
      next.setDate(next.getDate() + 30);
    } else {
      next.setDate(next.getDate() + 7);
    }
    setAnchorDate(next);
  };


  const groupedByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    displayItems.forEach((item) => {
      const key = item.scheduledAt.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    map.forEach((dayItems) => dayItems.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    return map;
  }, [displayItems]);

  const formatRangeLabel = () => {
    const start = range.start.toLocaleDateString();
    const end = range.end.toLocaleDateString();
    return `${start} – ${end}`;
  };

  const waveBucketMs = view === 'month' || view === 'list' || view === 'wave' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  const waveBuckets = useMemo(() => {
    if (view !== 'wave') return [];
    const startMs = range.start.getTime();
    const endMs = range.end.getTime();
    const count = Math.max(1, Math.ceil((endMs - startMs) / waveBucketMs));
    const buckets = Array.from({ length: count }, (_, idx) => ({
      start: new Date(startMs + idx * waveBucketMs),
      count: 0
    }));
    waveItems.forEach((item) => {
      const ts = Date.parse(item.scheduledAt);
      if (Number.isNaN(ts) || ts < startMs || ts > endMs) return;
      const index = Math.min(
        count - 1,
        Math.max(0, Math.floor((ts - startMs) / waveBucketMs))
      );
      buckets[index].count += 1;
    });
    return buckets;
  }, [range, view, waveBucketMs, waveItems]);

  const waveSummary = useMemo(() => {
    if (view !== 'wave') return null;
    const total = waveBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
    const peak = waveBuckets.reduce((max, bucket) => Math.max(max, bucket.count), 0);
    const peakIndex = waveBuckets.findIndex((bucket) => bucket.count === peak);
    const peakLabel =
      peakIndex >= 0 && waveBuckets[peakIndex]
        ? waveBuckets[peakIndex].start.toLocaleDateString()
        : '';
    return { total, peak, peakLabel };
  }, [view, waveBuckets]);

  const waveGeometry = useMemo(() => {
    if (view !== 'wave' || !waveBuckets.length) return { path: '', points: [] as Array<{ x: number; y: number }> };
    const width = 900;
    const height = 180;
    const padding = 16;
    const max = Math.max(1, ...waveBuckets.map((bucket) => bucket.count));
    const step = (width - padding * 2) / Math.max(1, waveBuckets.length - 1);
    const points = waveBuckets.map((bucket, idx) => {
      const x = padding + idx * step;
      const y = height - padding - (bucket.count / max) * (height - padding * 2);
      return { x, y };
    });
    if (!points.length) return { path: '', points };
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const current = points[i];
      const midX = (prev.x + current.x) / 2;
      d += ` Q ${midX} ${prev.y} ${current.x} ${current.y}`;
    }
    return { path: d, points };
  }, [view, waveBuckets]);

  const waveMarkers = useMemo(() => {
    if (view !== 'wave' || !waveBuckets.length) return [];
    const width = 900;
    const height = 180;
    const padding = 16;
    const startMs = range.start.getTime();
    const endMs = range.end.getTime();
    const max = Math.max(1, ...waveBuckets.map((bucket) => bucket.count));
    const step = (width - padding * 2) / Math.max(1, waveBuckets.length - 1);
    const bucketMap = new Map<number, CalendarItem[]>();
    waveItems.forEach((item) => {
      const ts = Date.parse(item.scheduledAt);
      if (Number.isNaN(ts) || ts < startMs || ts > endMs) return;
      const index = Math.min(
        waveBuckets.length - 1,
        Math.max(0, Math.floor((ts - startMs) / waveBucketMs))
      );
      const list = bucketMap.get(index) || [];
      list.push(item);
      bucketMap.set(index, list);
    });
    const markers: Array<{
      id: string;
      x: number;
      y: number;
      title: string;
      timeLabel: string;
      status: string;
      channel: CalendarItem['channel'];
      items?: CalendarItem[];
    }> = [];
    waveBuckets.forEach((bucket, idx) => {
      const list = bucketMap.get(idx);
      if (!list || !list.length) return;
      const x = padding + idx * step;
      const baseY = height - padding - (bucket.count / max) * (height - padding * 2);
      if (list.length > 3) {
        markers.push({
          id: `cluster-${idx}`,
          x,
          y: Math.max(padding, baseY - 6),
          title: `${list.length} items`,
          timeLabel: bucket.start.toLocaleDateString(),
          status: 'scheduled',
          channel: 'other',
          items: list
        });
        return;
      }
      list.forEach((item, offsetIdx) => {
        markers.push({
          id: item.id,
          x,
          y: Math.max(padding, baseY - offsetIdx * 8),
          title: item.title,
          timeLabel: new Date(item.scheduledAt).toLocaleString(),
          status: item.status,
          channel: item.channel
        });
      });
    });
    return markers;
  }, [range, view, waveBucketMs, waveBuckets, waveItems]);

  const [waveTooltip, setWaveTooltip] = useState<null | { x: number; y: number; lines: string[]; width: number }>(null);
  const [clusterItems, setClusterItems] = useState<CalendarItem[] | null>(null);

  const buildTooltip = (x: number, y: number, lines: string[]) => {
    const baseWidth = Math.max(140, ...lines.map((line) => line.length * 6 + 24));
    const maxWidth = 220;
    const width = Math.min(baseWidth, maxWidth);
    const clampedX = Math.min(880 - width, Math.max(16, x + 10));
    const clampedY = Math.max(16, y - 30);
    setWaveTooltip({ x: clampedX, y: clampedY, lines, width });
  };

  const handleMarkerKeyDown = (event: KeyboardEvent<SVGCircleElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = Math.min(Math.max(index + direction, 0), waveMarkers.length - 1);
    const next = document.querySelector<SVGCircleElement>(`[data-wave-marker-index="${nextIndex}"]`);
    next?.focus();
    event.preventDefault();
  };

  const getRelatedLink = (item: CalendarItem) => {
    if (!item.relatedId || !item.relatedType) return null;
    if (item.relatedType === 'campaign') return `/boss/campaigns/${item.relatedId}`;
    if (item.relatedType === 'automation') return `/boss/automations/${item.relatedId}`;
    if (item.relatedType === 'template') return `/boss/templates/${item.relatedId}`;
    return null;
  };

  const openNewModal = () => {
    setActiveItem(null);
    setFormTitle('');
    setFormType('campaign');
    setFormChannel('email');
    setFormStatus('scheduled');
    setFormScheduledAt('');
    setFormDuration(60);
    setFormNotes('');
    setFormRelatedType('');
    setFormRelatedId('');
    setModalOpen(true);
  };

  const openEditModal = (item: CalendarItem) => {
    setActiveItem(item);
    setFormTitle(item.title);
    setFormType(item.type);
    setFormChannel(item.channel);
    setFormStatus(item.status);
    setFormScheduledAt(toLocalInput(item.scheduledAt));
    setFormDuration(item.durationMins || 60);
    setFormNotes(item.notes || '');
    setFormRelatedType(item.relatedType || '');
    setFormRelatedId(item.relatedId || '');
    setModalOpen(true);
  };

  const handleSave = async () => {
    setErrorMessage('');
    const scheduledIso = toIsoFromLocal(formScheduledAt);
    if (!formTitle.trim()) {
      setErrorMessage('Title is required.');
      return;
    }
    if (!scheduledIso) {
      setErrorMessage('Scheduled date/time is required.');
      return;
    }
    if (formRelatedType && !formRelatedId.trim()) {
      setErrorMessage('Related ID is required when related type is set.');
      return;
    }
    if (!Number.isFinite(formDuration) || formDuration < 5) {
      setErrorMessage('Duration must be at least 5 minutes.');
      return;
    }
    const payload: Partial<CalendarItem> = {
      title: formTitle.trim(),
      type: formType,
      channel: formChannel,
      status: formStatus,
      scheduledAt: scheduledIso,
      durationMins: formDuration,
      notes: formNotes.trim() || null,
      relatedType: formRelatedType || null,
      relatedId: formRelatedId.trim() || null
    };
    try {
      if (activeItem) {
        await adminApi.updateCalendarItem(activeItem.id, payload);
        setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: 'Schedule updated.' }]);
      } else {
        await adminApi.createCalendarItem(payload);
        setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: 'Schedule created.' }]);
      }
      setModalOpen(false);
      await loadCalendar();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save schedule.');
    }
  };

  const handleDelete = async () => {
    if (!activeItem) return;
    setErrorMessage('');
    try {
      await adminApi.deleteCalendarItem(activeItem.id);
      setToasts((prev) => [...prev, { id: crypto.randomUUID(), message: 'Schedule deleted.' }]);
      setModalOpen(false);
      await loadCalendar();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete schedule.');
    }
  };

  const statusTone = (status: CalendarItem['status']) => {
    if (status === 'sent') return 'bg-emerald-500';
    if (status === 'cancelled') return 'bg-red-500';
    if (status === 'draft') return 'bg-amber-400';
    return 'bg-sky-500';
  };

  const typeTone = (type: CalendarItem['type']) => {
    if (type === 'automation') return 'bg-indigo-500';
    if (type === 'content') return 'bg-violet-500';
    return 'bg-sky-500';
  };
  const channelTone = (channel: CalendarItem['channel']) => {
    if (channel === 'sms') return 'bg-orange-500 text-orange-50';
    if (channel === 'social') return 'bg-fuchsia-500 text-fuchsia-50';
    if (channel === 'web') return 'bg-emerald-500 text-emerald-50';
    if (channel === 'other') return 'bg-slate-500 text-slate-50';
    return 'bg-sky-600 text-sky-50';
  };
  const waveChannelColor = (channel: CalendarItem['channel']) => {
    if (channel === 'sms') return '#f97316';
    if (channel === 'social') return '#d946ef';
    if (channel === 'web') return '#22c55e';
    if (channel === 'other') return '#64748b';
    return '#38bdf8';
  };
  const waveStatusStroke = (status: CalendarItem['status']) => {
    if (status === 'sent') return '#16a34a';
    if (status === 'cancelled') return '#ef4444';
    if (status === 'draft') return '#f59e0b';
    return '#0f172a';
  };

  const renderItem = (item: CalendarItem) => {
    const link = getRelatedLink(item);
    return (
    <div key={item.id} className="rounded-xl border border-slate-200/70 bg-white/85 px-3 py-2 text-xs text-slate-700 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${statusTone(item.status)}`} />
        <span className={`h-1.5 w-6 rounded-full ${typeTone(item.type)}`} />
        <p className="font-semibold tracking-tight">{item.title}</p>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span>{new Date(item.scheduledAt).toLocaleTimeString()}</span>
        <span>·</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${channelTone(item.channel)}`}>
          {item.channel}
        </span>
        <span>·</span>
        <span className="uppercase tracking-wide">{item.status}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => openEditModal(item)}
          className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Edit
        </button>
        {link ? (
          <Link to={link} className="text-[10px] font-semibold text-blue-500 hover:text-blue-400">
            Open {item.relatedType}
          </Link>
        ) : null}
      </div>
    </div>
    );
  };

  return (
    <AdminShell>
      <AdminModal
        title={activeItem ? 'Edit Schedule' : 'Add Schedule'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      >
        <Input
          label="Title"
          value={formTitle}
          onChange={(event) => setFormTitle(event.target.value)}
          placeholder="Newsletter drop"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
            <span className="font-medium text-text">Type</span>
            <select
              value={formType}
              onChange={(event) => setFormType(event.target.value as CalendarItem['type'])}
              className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
            >
              <option value="campaign">Campaign</option>
              <option value="automation">Automation</option>
              <option value="content">Content</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
            <span className="font-medium text-text">Channel</span>
            <select
              value={formChannel}
              onChange={(event) => setFormChannel(event.target.value as CalendarItem['channel'])}
              className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="social">Social</option>
              <option value="web">Web</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
            <span className="font-medium text-text">Status</span>
            <select
              value={formStatus}
              onChange={(event) => setFormStatus(event.target.value as CalendarItem['status'])}
              className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
            >
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="sent">Sent</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <Input
            label="Duration (mins)"
            type="number"
            min={5}
            value={formDuration}
            onChange={(event) => setFormDuration(Number(event.target.value))}
          />
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-600 dark:text-slate-200">Quick duration:</span>
          {[30, 60, 90, 120].map((mins) => (
            <button
              key={mins}
              type="button"
              onClick={() => setFormDuration(mins)}
              className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {mins}m
            </button>
          ))}
        </div>
        <Input
          label="Scheduled date/time"
          type="datetime-local"
          value={formScheduledAt}
          onChange={(event) => setFormScheduledAt(event.target.value)}
        />
        <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
          <span className="font-medium text-text">Notes</span>
          <textarea
            rows={3}
            value={formNotes}
            onChange={(event) => setFormNotes(event.target.value)}
            placeholder="Optional notes"
            className="w-full rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-text shadow-sm focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-xs text-text-muted sm:text-sm">
            <span className="font-medium text-text">Related type</span>
            <select
              value={formRelatedType}
              onChange={(event) => setFormRelatedType(event.target.value as CalendarItem['relatedType'])}
              className="rounded-xl border border-border-subtle bg-panel-elevated px-3 py-2 text-sm text-text shadow-sm"
            >
              <option value="">None</option>
              <option value="campaign">Campaign</option>
              <option value="automation">Automation</option>
              <option value="template">Template</option>
            </select>
          </label>
          <Input
            label="Related ID"
            value={formRelatedId}
            onChange={(event) => setFormRelatedId(event.target.value)}
            placeholder="Optional ID"
          />
        </div>
        {activeItem ? (
          <Button variant="outline" size="sm" onClick={handleDelete}>
            Delete schedule
          </Button>
        ) : null}
      </AdminModal>
      {toasts.length ? (
        <div className="fixed right-6 top-6 z-50 flex flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-100 shadow-lg"
            >
              {toast.message}
            </div>
          ))}
        </div>
      ) : null}
      <div className="space-y-8">
        <Card className="relative overflow-hidden border border-slate-200/70 bg-gradient-to-br from-slate-50 via-white to-sky-50 p-6 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
          <div className="absolute inset-0 opacity-40">
            <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-200 blur-3xl dark:bg-sky-900/60" />
            <div className="absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-emerald-200 blur-3xl dark:bg-emerald-900/60" />
          </div>
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Content Calendar</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Plan, track, and orchestrate scheduled sends across your system.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Live schedule view
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={goPrev}>Prev</Button>
              <Button variant="outline" onClick={goToday}>Today</Button>
              <Button variant="outline" onClick={goNext}>Next</Button>
              <Button onClick={openNewModal}>Add Schedule</Button>
            </div>
          </div>
        </Card>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
          <span>{formatRangeLabel()}</span>
          <div className="flex items-center gap-2">
            <Button variant={view === 'week' ? 'primary' : 'outline'} size="sm" onClick={() => setView('week')}>Week</Button>
            <Button variant={view === 'month' ? 'primary' : 'outline'} size="sm" onClick={() => setView('month')}>Month</Button>
            <Button variant={view === 'list' ? 'primary' : 'outline'} size="sm" onClick={() => setView('list')}>List</Button>
            <Button variant={view === 'wave' ? 'primary' : 'outline'} size="sm" onClick={() => setView('wave')}>Wave</Button>
          </div>
        </div>
        <Card className="p-4">
          <div className="grid gap-3 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3">
            <label className="grid gap-2">
              <span className="font-semibold">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as CalendarItem['status'] | '')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">All</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="sent">Sent</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="font-semibold">Channel</span>
              <select
                value={channelFilter}
                onChange={(event) => setChannelFilter(event.target.value as CalendarItem['channel'] | '')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">All</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="social">Social</option>
                <option value="web">Web</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="font-semibold">Type</span>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as CalendarItem['type'] | '')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">All</option>
                <option value="campaign">Campaign</option>
                <option value="automation">Automation</option>
                <option value="content">Content</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
        </Card>

        {errorMessage ? <Card className="border border-red-200/80 bg-red-50/80 p-4 text-sm text-red-700">{errorMessage}</Card> : null}
        {conflictMessage ? <Card className="border border-amber-200/80 bg-amber-50/80 p-4 text-sm text-amber-700">{conflictMessage}</Card> : null}
        {loading ? <Card className="border border-slate-200/70 bg-white/70 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">Loading calendar…</Card> : null}

        {!loading && view === 'week' ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 7 }).map((_, index) => {
              const day = new Date(range.start);
              day.setDate(day.getDate() + index);
              const key = day.toISOString().slice(0, 10);
              const dayItems = groupedByDay.get(key) || [];
              return (
                <Card key={key} className="p-4">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </h3>
                  <div className="mt-3 space-y-2">
                    {dayItems.length ? dayItems.map(renderItem) : (
                      <div className="rounded-lg border border-dashed border-slate-200/70 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        No items.
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}

        {!loading && view === 'wave' ? (
          <Card className="p-6 text-sm text-slate-600 dark:text-slate-300">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-4">
                <span>Total items: <strong className="text-slate-700 dark:text-slate-200">{waveSummary?.total ?? 0}</strong></span>
                <span>Peak bucket: <strong className="text-slate-700 dark:text-slate-200">{waveSummary?.peak ?? 0}</strong></span>
                {waveSummary?.peakLabel ? (
                  <span>Peak date: <strong className="text-slate-700 dark:text-slate-200">{waveSummary.peakLabel}</strong></span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setVisibleStatuses((prev) => ({ ...prev, scheduled: !prev.scheduled, draft: !prev.draft }))}
                    className={`h-2 w-2 rounded-full ring-1 ring-slate-900/70 ${visibleStatuses.scheduled || visibleStatuses.draft ? 'bg-amber-300' : 'bg-slate-300 opacity-60'}`}
                    aria-label="Toggle scheduled and draft"
                  />
                  <button
                    type="button"
                    onClick={() => setVisibleStatuses((prev) => ({ ...prev, scheduled: !prev.scheduled, draft: !prev.draft }))}
                    className={`text-[11px] font-semibold ${visibleStatuses.scheduled || visibleStatuses.draft ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 line-through'}`}
                  >
                    Scheduled/Draft
                  </button>
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setVisibleStatuses((prev) => ({ ...prev, sent: !prev.sent }))}
                    className={`h-2 w-2 rounded-full ring-1 ring-slate-900/70 ${visibleStatuses.sent ? 'bg-emerald-400' : 'bg-slate-300 opacity-60'}`}
                    aria-label="Toggle sent"
                  />
                  <button
                    type="button"
                    onClick={() => setVisibleStatuses((prev) => ({ ...prev, sent: !prev.sent }))}
                    className={`text-[11px] font-semibold ${visibleStatuses.sent ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 line-through'}`}
                  >
                    Sent
                  </button>
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setVisibleStatuses((prev) => ({ ...prev, cancelled: !prev.cancelled }))}
                    className={`h-2 w-2 rounded-full ring-1 ring-slate-900/70 ${visibleStatuses.cancelled ? 'bg-red-400' : 'bg-slate-300 opacity-60'}`}
                    aria-label="Toggle cancelled"
                  />
                  <button
                    type="button"
                    onClick={() => setVisibleStatuses((prev) => ({ ...prev, cancelled: !prev.cancelled }))}
                    className={`text-[11px] font-semibold ${visibleStatuses.cancelled ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 line-through'}`}
                  >
                    Cancelled
                  </button>
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-600 dark:text-slate-200">Channels:</span>
              {[
                { key: 'email', label: 'Email', color: '#38bdf8' },
                { key: 'sms', label: 'SMS', color: '#f97316' },
                { key: 'social', label: 'Social', color: '#d946ef' },
                { key: 'web', label: 'Web', color: '#22c55e' },
                { key: 'other', label: 'Other', color: '#64748b' }
              ].map((channel) => (
                <span key={channel.key} className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: channel.color }} />
                  {channel.label}
                </span>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200/70 bg-gradient-to-b from-slate-50/70 to-white/80 p-4 shadow-inner dark:border-slate-700 dark:from-slate-900/60 dark:to-slate-950/60">
              <svg viewBox="0 0 900 180" className="h-44 w-full">
                <defs>
                  <linearGradient id="waveFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                {[1, 2, 3].map((idx) => (
                  <line
                    key={`h-${idx}`}
                    x1="16"
                    y1={164 - idx * 38}
                    x2="884"
                    y2={164 - idx * 38}
                    stroke="#cbd5f5"
                    strokeDasharray="4 6"
                    opacity="0.4"
                  />
                ))}
                {[1, 2, 3, 4].map((idx) => (
                  <line
                    key={`v-${idx}`}
                    x1={16 + idx * 172}
                    y1="16"
                    x2={16 + idx * 172}
                    y2="164"
                    stroke="#cbd5f5"
                    strokeDasharray="4 6"
                    opacity="0.4"
                  />
                ))}
                {waveBuckets.length > 1
                  ? waveBuckets.map((bucket, idx) => {
                    const step = Math.max(1, Math.ceil(waveBuckets.length / 6));
                    if (idx % step !== 0) return null;
                    const x = 16 + idx * ((900 - 32) / Math.max(1, waveBuckets.length - 1));
                    return (
                      <text key={`tick-${idx}`} x={x} y="12" textAnchor="middle" fontSize="9" fill="#94a3b8">
                        {bucket.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </text>
                    );
                  })
                  : null}
                <path
                  d={waveGeometry.path ? `${waveGeometry.path} L 884 164 L 16 164 Z` : ''}
                  fill="url(#waveFill)"
                />
                <path d={waveGeometry.path} fill="none" stroke="#38bdf8" strokeWidth="3" />
                <line x1="16" y1="164" x2="884" y2="164" stroke="#94a3b8" strokeDasharray="6 6" />
                <text x="16" y="176" fontSize="9" fill="#94a3b8">
                  {range.start.toLocaleDateString()}
                </text>
                <text x="884" y="176" textAnchor="end" fontSize="9" fill="#94a3b8">
                  {range.end.toLocaleDateString()}
                </text>
                {waveMarkers.map((marker, index) => (
                  <circle
                    key={marker.id}
                    cx={marker.x}
                    cy={marker.y}
                    r="4"
                    fill={waveChannelColor(marker.channel)}
                    stroke={waveStatusStroke(marker.status)}
                    strokeWidth="1"
                    tabIndex={0}
                    role="img"
                    data-wave-marker-index={index}
                    aria-label={`${marker.title} ${marker.timeLabel}`}
                    onMouseEnter={() => buildTooltip(marker.x, marker.y, [truncateText(marker.title, 28), truncateText(`${marker.channel} • ${marker.timeLabel}`, 36)])}
                    onMouseLeave={() => setWaveTooltip(null)}
                    onFocus={() => buildTooltip(marker.x, marker.y, [truncateText(marker.title, 28), truncateText(`${marker.channel} • ${marker.timeLabel}`, 36)])}
                    onBlur={() => setWaveTooltip(null)}
                    onKeyDown={(event) => handleMarkerKeyDown(event, index)}
                    onClick={() => {
                      if (marker.items?.length) {
                        setClusterItems(marker.items);
                        return;
                      }
                      const selected = items.find((item) => item.id === marker.id);
                      if (selected) openEditModal(selected);
                    }}
                  />
                ))}
                {waveTooltip ? (
                  <g transform={`translate(${waveTooltip.x}, ${waveTooltip.y})`}>
                    <rect rx="6" ry="6" width={waveTooltip.width} height="34" fill="#0f172a" opacity="0.85" />
                    <text x="8" y="14" fontSize="10" fill="#e2e8f0">
                      {waveTooltip.lines[0]}
                    </text>
                    <text x="8" y="27" fontSize="10" fill="#94a3b8">
                      {waveTooltip.lines[1]}
                    </text>
                  </g>
                ) : null}
              </svg>
            </div>
            {clusterItems?.length ? (
              <div className="mt-4 rounded-xl border border-slate-200/70 bg-white/80 p-4 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Cluster details</div>
                  <button
                    type="button"
                    onClick={() => setClusterItems(null)}
                    className="rounded-full border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {clusterItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openEditModal(item)}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-200/70 bg-white/80 px-3 py-2 text-left text-[11px] text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <span className="font-semibold">{item.title}</span>
                      <span className="text-slate-400">{new Date(item.scheduledAt).toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        ) : null}

        {!loading && view === 'month' ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: range.end.getDate() }).map((_, index) => {
              const day = new Date(range.start.getFullYear(), range.start.getMonth(), index + 1);
              const key = day.toISOString().slice(0, 10);
              const dayItems = groupedByDay.get(key) || [];
              return (
                <Card key={key} className="p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{index + 1}</h3>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {day.toLocaleDateString(undefined, { weekday: 'short' })}
                    </span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {dayItems.slice(0, 3).map(renderItem)}
                    {dayItems.length > 3 ? (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        +{dayItems.length - 3} more
                      </p>
                    ) : null}
                    {!dayItems.length ? (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">No items.</p>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : null}

        {!loading && view === 'list' ? (
          <Card className="p-4">
            <div className="space-y-3">
              {items.length ? items.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/60 bg-white/90 px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(item.scheduledAt).toLocaleString()} · {item.channel} · {item.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {getRelatedLink(item) ? (
                      <Link to={getRelatedLink(item) as string} className="text-xs text-blue-500 hover:text-blue-400">
                        Open linked
                      </Link>
                    ) : null}
                    <span className="text-xs text-slate-500 dark:text-slate-400">{item.type}</span>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No scheduled items in this range.</p>
              )}
            </div>
          </Card>
        ) : null}
      </div>
    </AdminShell>
  );
}

