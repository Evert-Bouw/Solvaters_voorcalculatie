import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  DEFAULT_BOOTSTRAP_STATUS,
  fetchAppSettings,
  fetchBootstrapStatus,
  fetchCoreSettings,
  fetchIframeSessionProfile,
  saveAppSettings,
} from '../../core/api/client';
import { DEFAULT_CORE_SETTINGS } from '../../core/settings';
import { BootstrapStatus } from '../../core/types';
import { applyThemeColors } from '../../core/utils/theme';
import BlockingOverlay from '../../core/components/BlockingOverlay';
import FullscreenToggleButton from '../../core/components/FullscreenToggleButton';
import RefreshButton from '../../core/components/RefreshButton';
import AppDebugSection from '../settings/AppDebugSection';
import AppSettingsSection from '../settings/AppSettingsSection';
import { AppSettings } from '../settings/types';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from '../settings/defaults';

function navLinkClassName(isActive: boolean) {
  return `rounded px-3 py-2 text-xs font-medium transition ${
    isActive ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
  }`;
}

export default function AppSettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>(DEFAULT_BOOTSTRAP_STATUS);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDebugSection, setShowDebugSection] = useState(false);
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const [debugFacts, setDebugFacts] = useState<Array<{ label: string; value: string }>>([]);
  const [refreshVersion, setRefreshVersion] = useState(0);

  function pushDebugLine(message: string) {
    const timestamp = new Date().toLocaleTimeString('nl-NL', { hour12: false });
    setDebugLines((current) => [`[${timestamp}] ${message}`, ...current].slice(0, 80));
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [coreSettings, nextBootstrapStatus, iframeResult, appSettings] = await Promise.all([
          fetchCoreSettings().catch(() => DEFAULT_CORE_SETTINGS),
          fetchBootstrapStatus(),
          fetchIframeSessionProfile().catch(() => undefined),
          fetchAppSettings(),
        ]);
        applyThemeColors({ core: coreSettings });
        setBootstrapStatus(nextBootstrapStatus);
        setSettings(appSettings);
        setDebugFacts([
          { label: 'settingsAllowed', value: String(nextBootstrapStatus.settingsAllowed) },
          { label: 'bootstrapAllowed', value: String(nextBootstrapStatus.bootstrapAllowed) },
          { label: 'ready', value: String(nextBootstrapStatus.ready) },
          { label: 'writeAuthMode', value: nextBootstrapStatus.writeAuthMode },
          { label: 'blockReason', value: nextBootstrapStatus.blockReason || '-' },
          { label: 'hasIframeSession', value: String(nextBootstrapStatus.hasIframeSession) },
          { label: 'iframeUserId', value: iframeResult?.session?.userId || '-' },
          { label: 'iframeSessionId', value: iframeResult?.session?.sessionId || '-' },
        ]);
        pushDebugLine('App-instellingen geladen.');
        setStatus('');
      } catch (error) {
        applyThemeColors({ core: DEFAULT_CORE_SETTINGS });
        const message = (error as Error).message || 'App-instellingen konden niet worden geladen.';
        setStatus(message);
        pushDebugLine(`Laden mislukt: ${message}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshVersion]);

  function updateSettings(patch: Partial<AppSettings>) {
    setSettings((current) => normalizeAppSettings({ ...current, ...patch }));
  }

  async function onSave() {
    setSaving(true);
    setStatus('');
    try {
      const saved = await saveAppSettings(settings);
      setSettings(saved);
      setStatus('App-instellingen opgeslagen.');
      pushDebugLine('App-instellingen opgeslagen.');
    } catch (error) {
      const message = (error as Error).message || 'App-instellingen konden niet worden opgeslagen.';
      setStatus(message);
      pushDebugLine(`Opslaan mislukt: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  function refreshSettingsView() {
    setRefreshVersion((current) => current + 1);
  }

  const hasSettingsAccess = bootstrapStatus.settingsAllowed || bootstrapStatus.bootstrapAllowed;
  const showOverlay = !loading && !hasSettingsAccess;
  const overlayTitle = useMemo(
    () =>
      bootstrapStatus.blockReason === 'iframe_required'
        ? 'Open deze app vanuit AFAS'
        : bootstrapStatus.blockReason === 'oauth_login_required'
          ? 'Aanmelden vereist'
          : 'Geen toegang tot instellingen',
    [bootstrapStatus.blockReason],
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Solvaters Voorcalculatie</p>
            <h1 className="text-lg font-semibold text-slate-900">Instellingen</h1>
          </div>
          <nav className="flex items-center gap-2">
            <NavLink to="/" end className={({ isActive }) => navLinkClassName(isActive)}>
              App
            </NavLink>
            <NavLink to="/settings" end className={({ isActive }) => navLinkClassName(isActive)}>
              Instellingen
            </NavLink>
            <NavLink to="/settings/advanced" className={({ isActive }) => navLinkClassName(isActive)}>
              Geavanceerd
            </NavLink>
            <RefreshButton onRefresh={refreshSettingsView} />
            <FullscreenToggleButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="text-base font-semibold text-slate-900">App-instellingen</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Deze pagina beheert alleen de concrete app-beleving. Voor ParamId, AFAS-authenticatie en
                connectorconfiguratie gebruik je `Geavanceerde instellingen`.
              </p>
            </div>
            <NavLink
              to="/settings/advanced"
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Naar geavanceerde instellingen
            </NavLink>
          </div>

          <div className="mt-6">
            <AppSettingsSection settings={settings} onChange={updateSettings} />
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Opslaan...' : 'App-instellingen opslaan'}
            </button>
            {status ? <p className="text-sm text-slate-600">{status}</p> : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Debug-info</h2>
              <p className="mt-1 text-sm text-slate-600">
                Verborgen standaard. Bevat geen tokens of secrets, maar wel interne status- en sessie-info.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDebugSection((current) => !current)}
              className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition ${
                showDebugSection
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100'
              }`}
            >
              {showDebugSection ? 'Debug-info verbergen' : 'Debug-info tonen'}
            </button>
          </div>
          {showDebugSection ? (
            <div className="mt-4">
              <AppDebugSection facts={debugFacts} lines={debugLines} onClear={() => setDebugLines([])} />
            </div>
          ) : null}
        </section>
      </main>

      {showOverlay ? (
        <BlockingOverlay
          title={overlayTitle}
          message={bootstrapStatus.message}
          actions={
            <>
              <button
                type="button"
                onClick={refreshSettingsView}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Opnieuw controleren
              </button>
              <NavLink
                to="/settings/advanced"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                Geavanceerde instellingen
              </NavLink>
            </>
          }
        />
      ) : null}
    </div>
  );
}
