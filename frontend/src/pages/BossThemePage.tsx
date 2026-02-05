import React, { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/admin/AdminShell';
import AdminModal from '../components/admin/AdminModal';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { adminApi, CustomTheme } from '../services/adminApi';

export default function BossThemePage() {
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [seasonalTheme, setSeasonalTheme] = useState('none');
  const [customThemeId, setCustomThemeId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modeValue, setModeValue] = useState<'light' | 'dark'>('light');
  const [seasonalValue, setSeasonalValue] = useState('none');
  const [customThemeValue, setCustomThemeValue] = useState<string>('none');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [customName, setCustomName] = useState('');
  const [customValues, setCustomValues] = useState({
    '--bg': '#f8fafc',
    '--bg-accent': '#eef2f7',
    '--panel': '#ffffff',
    '--panel-elevated': '#ffffff',
    '--border': '#cbd5e1',
    '--text': '#0f172a',
    '--text-muted': '#5b667a',
    '--accent': '#2563eb'
  });
  const isHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

  const seasonalOptions = [
    { value: 'none', label: 'None' },
    { value: 'christmas', label: 'Christmas' },
    { value: 'new-year', label: 'New Year' },
    { value: 'halloween', label: 'Halloween' },
    { value: 'ramadan', label: 'Ramadan' },
    { value: 'easter', label: 'Easter' },
    { value: 'summer', label: 'Summer' },
    { value: 'autumn', label: 'Autumn' },
    { value: 'winter', label: 'Winter' }
  ];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [data, themes] = await Promise.all([
          adminApi.getTheme(),
          adminApi.getCustomThemes()
        ]);
        if (data) {
          setThemeMode(data.mode);
          setSeasonalTheme(data.seasonalTheme || 'none');
          setCustomThemeId(data.customThemeId || null);
          setModeValue(data.mode);
          setSeasonalValue(data.seasonalTheme || 'none');
          setCustomThemeValue(data.customThemeId || 'none');
        }
        setCustomThemes(themes);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load theme.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const applyTheme = async (payload: {
    mode: 'light' | 'dark';
    seasonalTheme: string;
    customThemeId: string | null;
    closeModal?: boolean;
  }) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const updated = await adminApi.updateTheme({
        mode: payload.mode,
        seasonalTheme: payload.seasonalTheme,
        customThemeId: payload.customThemeId
      });
      setThemeMode(updated.mode);
      setSeasonalTheme(updated.seasonalTheme || 'none');
      setCustomThemeId(updated.customThemeId || null);
      setCustomThemeValue(updated.customThemeId || 'none');
      setModeValue(updated.mode);
      setSeasonalValue(updated.seasonalTheme || 'none');
      if (payload.closeModal) {
        setModalOpen(false);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      setLoading(false);
    }
  };

  const onSave = async () => {
    await applyTheme({
      mode: modeValue,
      seasonalTheme: seasonalValue,
      customThemeId: customThemeValue === 'none' ? null : customThemeValue,
      closeModal: true
    });
  };

  const handleCreateCustomTheme = async () => {
    if (!customName.trim()) {
      setErrorMessage('Custom theme name is required.');
      return;
    }
    const hasInvalidColor = Object.values(customValues).some((value) => !isHexColor(value));
    if (hasInvalidColor) {
      setErrorMessage('Custom theme colors must be valid hex values.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const created = await adminApi.createCustomTheme({
        name: customName.trim(),
        values: customValues
      });
      setCustomThemes((prev) => [created, ...prev]);
      setCustomName('');
      await applyTheme({
        mode: themeMode,
        seasonalTheme,
        customThemeId: created.id
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save custom theme.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCustomTheme = async (id: string | null) => {
    await applyTheme({
      mode: themeMode,
      seasonalTheme,
      customThemeId: id
    });
  };

  const handleDeleteCustomTheme = async (id: string) => {
    if (!window.confirm('Delete this custom theme?')) return;
    setLoading(true);
    setErrorMessage('');
    try {
      await adminApi.deleteCustomTheme(id);
      setCustomThemes((prev) => prev.filter((theme) => theme.id !== id));
      if (customThemeId === id) {
        setCustomThemeId(null);
        setCustomThemeValue('none');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete theme.');
    } finally {
      setLoading(false);
    }
  };

  const customPreviewStyle = useMemo(
    () => ({
      background: `linear-gradient(135deg, ${customValues['--bg']} 0%, ${customValues['--bg-accent']} 55%)`,
      borderColor: customValues['--border'],
      color: customValues['--text']
    }),
    [customValues]
  );

  return (
    <AdminShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Theme Defaults</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Choose the default theme for the client site.
            </p>
          </div>
        <Button onClick={() => setModalOpen(true)}>Edit</Button>
        </div>
        {errorMessage ? (
          <Card className="p-4 text-sm text-red-600">{errorMessage}</Card>
        ) : null}
        <Card className="p-5">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Mode: {loading ? 'Loading...' : themeMode}
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Seasonal theme: {loading ? 'Loading...' : seasonalTheme}
          </p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Custom theme: {customThemeId ? 'Active' : 'None'}
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Custom Themes</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Add your own palette without changing the built-in themes.
              </p>
            </div>
            <Button variant="outline" onClick={() => void handleApplyCustomTheme(null)}>
              Clear Custom Theme
            </Button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-border-subtle bg-panel-elevated p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                New Custom Theme
              </h3>
              <div className="mt-4 grid gap-3 text-sm">
                <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
                  <span className="font-medium text-slate-700">Theme name</span>
                  <input
                    className="rounded-xl border border-border-subtle bg-panel px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
                    value={customName}
                    onChange={(event) => setCustomName(event.target.value)}
                    placeholder="Ocean Breeze"
                  />
                </label>
                {Object.entries(customValues).map(([key, value]) => (
                  <label key={key} className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {key.replace('--', '')}
                    </span>
                    <input
                      type="color"
                      value={value}
                      onChange={(event) =>
                        setCustomValues((prev) => ({ ...prev, [key]: event.target.value }))
                      }
                      className="h-8 w-16 cursor-pointer rounded-lg border border-border-subtle bg-panel"
                    />
                  </label>
                ))}
                <Button onClick={handleCreateCustomTheme} disabled={loading}>
                  Add Custom Theme
                </Button>
              </div>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-panel-elevated p-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Live Preview
              </h3>
              <div
                className="mt-4 rounded-2xl border p-4 shadow-sm"
                style={customPreviewStyle}
              >
                <p className="text-sm font-semibold">Preview card</p>
                <p className="mt-2 text-xs" style={{ color: customValues['--text-muted'] }}>
                  This is how text, muted text, and accent colors will feel together.
                </p>
                <div className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold" style={{ background: customValues['--accent'], color: '#fff' }}>
                  Accent
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {customThemes.map((theme) => (
              <div key={theme.id} className="rounded-2xl border border-border-subtle bg-panel-elevated p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {theme.name}
                  </h4>
                  {customThemeId === theme.id ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                      Active
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(theme.values).map(([key, value]) => (
                    <span
                      key={`${theme.id}-${key}`}
                      className="inline-flex h-6 w-6 rounded-full border border-border-subtle"
                      style={{ background: value }}
                      title={key}
                    />
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void handleApplyCustomTheme(theme.id)}>
                    Apply
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void handleDeleteCustomTheme(theme.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
            {!customThemes.length ? (
              <div className="rounded-2xl border border-border-subtle bg-panel-elevated p-4 text-sm text-slate-600 dark:text-slate-300">
                No custom themes yet.
              </div>
            ) : null}
          </div>
        </Card>
      </div>
        <AdminModal
          title="Set Default Theme"
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={onSave}
        >
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Theme</span>
          <select
            value={modeValue}
            onChange={(event) => setModeValue(event.target.value as 'light' | 'dark')}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Seasonal Theme</span>
          <select
            value={seasonalValue}
            onChange={(event) => setSeasonalValue(event.target.value)}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          >
            {seasonalOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-xs text-slate-600 sm:text-sm">
          <span className="font-medium text-slate-700">Custom Theme</span>
          <select
            value={customThemeValue}
            onChange={(event) => setCustomThemeValue(event.target.value)}
            className="rounded-xl border border-border-subtle bg-panel-elevated px-4 py-3 text-sm text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-slate-100"
          >
            <option value="none">None</option>
            {customThemes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </label>
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await applyTheme({
                  mode: modeValue,
                  seasonalTheme: seasonalValue,
                  customThemeId: customThemeValue === 'none' ? null : customThemeValue,
                  closeModal: true
                });
              }}
            >
              Apply
            </Button>
          </div>
        </AdminModal>
    </AdminShell>
  );
}
