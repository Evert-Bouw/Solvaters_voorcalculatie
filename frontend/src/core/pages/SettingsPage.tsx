import { ReactNode, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  DEFAULT_AFAS_CONNECTION,
  DEFAULT_BOOTSTRAP_STATUS,
  DEFAULT_WRITE_AUTH_STATUS,
  exchangeIframeSession,
  fetchAppSettings,
  fetchBootstrapStatus,
  fetchAfasConnectionConfig,
  fetchAfasGetConnectors,
  fetchAfasUpdateConnectors,
  fetchAfasWriteAuthStatus,
  fetchContextCatalog,
  fetchCoreSettings,
  fetchIframeSessionProfile,
  logoutAfasOAuthSession,
  saveAfasConnectionConfig,
  saveAppSettings,
  saveCoreSettings,
} from '../api/client';
import { DEFAULT_CORE_SETTINGS, normalizeCoreSettings } from '../settings';
import { findParamIdOption, PARAM_ID_CATALOG } from '../config/paramIdCatalog';
import {
  AfasConnectionConfig,
  CoreSettings,
  AfasGetConnectorInfo,
  AfasConnectionInput,
  AfasUpdateConnectorInfo,
  AfasWriteAuthMode,
  AfasWriteAuthStatus,
  BootstrapStatus,
  ContextEntitySettings,
  IframeSessionProfile,
  ParamIdOption,
  ThemeColors,
  UiThemeMode,
} from '../types';
import { AppSettings } from '../../app/settings/types';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from '../../app/settings/defaults';
import { applyThemeColors } from '../utils/theme';
import FullscreenToggleButton from '../components/FullscreenToggleButton';
import RefreshButton from '../components/RefreshButton';
import ToggleSection from '../components/ToggleSection';
import { useAfasOauthPopup } from '../hooks/useAfasOauthPopup';

function navLinkClassName(isActive: boolean) {
  return `rounded px-3 py-2 text-xs font-medium transition ${
    isActive ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
  }`;
}

function buildContextEntity(nextParamId: string, current: ContextEntitySettings) {
  const option = findParamIdOption(nextParamId);
  const label = option?.description ?? current.label;
  return {
    ...current,
    key:
      label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || current.key,
    label,
    paramId: option?.paramId ?? nextParamId,
    queryParamName: option?.paramId ?? nextParamId,
  };
}

function readIframeExchangePayload() {
  const params = new URLSearchParams(window.location.search);
  const tokenurl = params.get('tokenurl')?.trim() || '';
  const code = params.get('code')?.trim() || '';
  const publickey = params.get('publickey')?.trim() || '';
  const sessionid = params.get('sessionid')?.trim() || '';
  return { tokenurl, code, publickey, sessionid };
}

function clearIframeExchangePayloadFromUrl() {
  const url = new URL(window.location.href);
  let changed = false;
  ['tokenurl', 'code', 'publickey', 'sessionid'].forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });
  if (!changed) return;
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
}

function JsonPreview({ value }: { value: unknown }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}
function ExpandableCell({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="rounded-lg border border-slate-200 bg-slate-50 p-2"
    >
      <summary className="cursor-pointer list-none text-xs font-medium text-slate-700">
        <div className="flex items-center justify-between gap-2">
          <span>{title}</span>
          {subtitle ? <span className="text-slate-500">{subtitle}</span> : null}
        </div>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function InfoHint({ text }: { text: string }) {
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-100 text-[11px] font-semibold text-sky-700"
      title={text}
      aria-label={text}
    >
      i
    </span>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const THEME_COLOR_LABELS: Record<keyof ThemeColors, { label: string; description: string }> = {
  brand50: { label: 'Merkkleur licht', description: 'Lichte accenten en zachte achtergronden.' },
  brand100: { label: 'Merkkleur zacht', description: 'Subtiele highlights, badges en vlakken.' },
  brand600: { label: 'Merkkleur primair', description: 'Primaire knoppen en actieve elementen.' },
  brand700: { label: 'Merkkleur hover', description: 'Hoverstaat van primaire knoppen en links.' },
  appBg: { label: 'Pagina-achtergrond', description: 'De algemene achtergrond van de app.' },
  panelBg: { label: 'Kaarten en panelen', description: 'Achtergrond van blokken, formulieren en cards.' },
  mutedBg: { label: 'Zachte vlakken', description: 'Secundaire achtergronden en rustige panelen.' },
  panelBorder: { label: 'Randen en lijnen', description: 'Borders van panelen, tabellen en invoervelden.' },
  textPrimary: { label: 'Primaire tekst', description: 'Koppen en belangrijke tekst.' },
  textSecondary: { label: 'Secundaire tekst', description: 'Uitleg, labels en ondersteunende tekst.' },
};

export default function SettingsPage() {
  const [debugLines, setDebugLines] = useState<string[]>([]);
  const [settings, setSettings] = useState<CoreSettings>(DEFAULT_CORE_SETTINGS);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [contextCatalog, setContextCatalog] = useState<ParamIdOption[]>(PARAM_ID_CATALOG);
  const [settingsStatus, setSettingsStatus] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const [afasConnection, setAfasConnection] = useState<AfasConnectionConfig>(DEFAULT_AFAS_CONNECTION);
  const [afasForm, setAfasForm] = useState<AfasConnectionInput>({
    mode: 'afas',
    environmentId: '',
    environmentType: 'production',
    token: '',
  });
  const [afasStatus, setAfasStatus] = useState('');
  const [savingAfas, setSavingAfas] = useState(false);

  const [writeAuthStatus, setWriteAuthStatus] = useState<AfasWriteAuthStatus>(DEFAULT_WRITE_AUTH_STATUS);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>(DEFAULT_BOOTSTRAP_STATUS);
  const [writeAuthBusy, setWriteAuthBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [iframeSessionProfile, setIframeSessionProfile] = useState<IframeSessionProfile | null>(null);
  const [iframeSessionStatus, setIframeSessionStatus] = useState('');
  const [baseSettingsOpen, setBaseSettingsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [getConnectorsOpen, setGetConnectorsOpen] = useState(false);
  const [updateConnectorsOpen, setUpdateConnectorsOpen] = useState(false);
  const [getConnectors, setGetConnectors] = useState<AfasGetConnectorInfo[]>([]);
  const [updateConnectors, setUpdateConnectors] = useState<AfasUpdateConnectorInfo[]>([]);
  const [getConnectorsStatus, setGetConnectorsStatus] = useState('');
  const [updateConnectorsStatus, setUpdateConnectorsStatus] = useState('');
  const [loadingGetConnectors, setLoadingGetConnectors] = useState(false);
  const [loadingUpdateConnectors, setLoadingUpdateConnectors] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const coreSettings = settings;

  const selectedGetConnector =
    getConnectors.find((connector) => connector.name === coreSettings.contextEntity.connectorName) ?? null;

  function pushDebugLine(message: string) {
    const timestamp = new Date().toLocaleTimeString('nl-NL', { hour12: false });
    setDebugLines((current) => [`[${timestamp}] ${message}`, ...current].slice(0, 80));
  }

  async function refreshAfterPopupWithoutMessage(reason: string) {
    setAfasStatus(reason);
    pushDebugLine(reason);
    await refreshWriteAuthStatus();
    try {
      const [nextBootstrapStatus, iframeResult] = await Promise.all([
        fetchBootstrapStatus(),
        fetchIframeSessionProfile().catch(() => undefined),
      ]);
      setBootstrapStatus(nextBootstrapStatus);
      if (iframeResult?.session) {
        setIframeSessionProfile(iframeResult.session);
        setIframeSessionStatus('');
      }
      pushDebugLine(
        `post-popup refresh: ready=${String(nextBootstrapStatus.ready)} hasIframe=${String(
          nextBootstrapStatus.hasIframeSession,
        )} oauthAuthenticated=${String(nextBootstrapStatus.oauthAuthenticated)}`,
      );
    } catch (error) {
      pushDebugLine(`post-popup refresh fout: ${(error as Error).message}`);
    }
  }

  useEffect(() => {
    const iframeExchange = readIframeExchangePayload();

    void (async () => {
      if (
        iframeExchange.tokenurl &&
        iframeExchange.code &&
        iframeExchange.publickey &&
        iframeExchange.sessionid
      ) {
        await exchangeIframeSession(iframeExchange);
        clearIframeExchangePayloadFromUrl();
      }

      try {
        const iframeResult = await fetchIframeSessionProfile();
        setIframeSessionProfile(iframeResult.session);
        setIframeSessionStatus('');
        pushDebugLine(`iframeSessionProfile ok: ${iframeResult.session.userId} / ${iframeResult.session.sessionId}`);
      } catch (error) {
        setIframeSessionProfile(null);
        setIframeSessionStatus((error as Error).message);
        pushDebugLine(`iframeSessionProfile fout: ${(error as Error).message}`);
      }

      const nextBootstrapStatus = await fetchBootstrapStatus();
      setBootstrapStatus(nextBootstrapStatus);
      pushDebugLine(
        `bootstrapStatus: ready=${String(nextBootstrapStatus.ready)} settingsAllowed=${String(
          nextBootstrapStatus.settingsAllowed,
        )} hasIframe=${String(nextBootstrapStatus.hasIframeSession)} oauthAuthenticated=${String(
          nextBootstrapStatus.oauthAuthenticated,
        )}`,
      );

      const authStatus = await fetchAfasWriteAuthStatus();
      setWriteAuthStatus(authStatus);
      pushDebugLine(
        `writeAuthStatus: configured=${String(authStatus.oauthConfigured)} authenticated=${String(
          authStatus.authenticated,
        )} user=${authStatus.userId || '-'}`,
      );

      if (!nextBootstrapStatus.settingsAllowed) {
        setSettings((current) => ({
          ...current,
          writeAuthMode: nextBootstrapStatus.writeAuthMode,
        }));
        return;
      }

      const [loadedSettings, loadedAppSettings] = await Promise.all([
        fetchCoreSettings(),
        fetchAppSettings(),
      ]);
      const normalizedCoreSettings = normalizeCoreSettings(loadedSettings);
      setSettings(normalizedCoreSettings);
      setAppSettings(normalizeAppSettings(loadedAppSettings));
      applyThemeColors({ core: normalizedCoreSettings });

      setContextCatalog(await fetchContextCatalog());

      const loadedConnection = await fetchAfasConnectionConfig();
      setAfasConnection(loadedConnection);
      setAfasForm({
        mode: loadedConnection.mode,
        environmentId: loadedConnection.environmentId,
        environmentType: loadedConnection.environmentType,
        token: '',
      });
      await loadGetConnectors();
    })().catch((error) => {
      setIframeSessionProfile(null);
      setIframeSessionStatus((error as Error).message);
      applyThemeColors({ core: DEFAULT_CORE_SETTINGS });
      setContextCatalog(PARAM_ID_CATALOG);
    }).finally(() => {
      setLoading(false);
    });
  }, [refreshVersion]);

  useEffect(() => {
    applyThemeColors({ core: settings });
  }, [settings.uiThemeMode, settings.uiColors, settings]);

  async function refreshWriteAuthStatus() {
    try {
      const nextStatus = await fetchAfasWriteAuthStatus();
      setWriteAuthStatus(nextStatus);
      pushDebugLine(
        `refreshWriteAuthStatus: configured=${String(nextStatus.oauthConfigured)} authenticated=${String(
          nextStatus.authenticated,
        )} user=${nextStatus.userId || '-'}`,
      );
    } catch (error) {
      setWriteAuthStatus({
        ...DEFAULT_WRITE_AUTH_STATUS,
        message: (error as Error).message,
      });
      pushDebugLine(`refreshWriteAuthStatus fout: ${(error as Error).message}`);
    }
  }

  async function refreshAfterOauthSuccess() {
    const delaysMs = [150, 400, 900, 1500];
    for (const delayMs of delaysMs) {
      await sleep(delayMs);
      try {
        const [nextWriteAuthStatus, nextBootstrapStatus, nextIframeResult] = await Promise.all([
          fetchAfasWriteAuthStatus(),
          fetchBootstrapStatus(),
          fetchIframeSessionProfile().catch(() => undefined),
        ]);
        setWriteAuthStatus(nextWriteAuthStatus);
        setBootstrapStatus(nextBootstrapStatus);
        if (nextIframeResult?.session) {
          setIframeSessionProfile(nextIframeResult.session);
          setIframeSessionStatus('');
        }
        pushDebugLine(
          `refreshAfterOauthSuccess ${delayMs}ms: authenticated=${String(
            nextWriteAuthStatus.authenticated,
          )} ready=${String(nextBootstrapStatus.ready)} iframe=${nextIframeResult?.session?.sessionId || '-'}`,
        );
        if (nextWriteAuthStatus.authenticated) {
          setAfasStatus('OAuth-sessie is actief.');
          setRefreshVersion((current) => current + 1);
          return;
        }
      } catch {
        // Retry shortly; cookie/session propagation can lag behind popup close.
      }
    }

    await refreshWriteAuthStatus();
    try {
      setBootstrapStatus(await fetchBootstrapStatus());
    } catch {
      // Keep current status if refresh fails.
    }
    setRefreshVersion((current) => current + 1);
  }

  async function loadGetConnectors(force = false) {
    if (loadingGetConnectors || (!force && getConnectors.length)) return;
    setLoadingGetConnectors(true);
    setGetConnectorsStatus('');
    try {
      const loaded = await fetchAfasGetConnectors();
      setGetConnectors(loaded);
      setGetConnectorsStatus(`${loaded.length} get-connectoren geladen.`);
    } catch (error) {
      setGetConnectorsStatus((error as Error).message);
    } finally {
      setLoadingGetConnectors(false);
    }
  }

  async function loadUpdateConnectors(force = false) {
    if (loadingUpdateConnectors || (!force && updateConnectors.length)) return;
    setLoadingUpdateConnectors(true);
    setUpdateConnectorsStatus('');
    try {
      const loaded = await fetchAfasUpdateConnectors();
      setUpdateConnectors(loaded);
      setUpdateConnectorsStatus(`${loaded.length} update-connectoren geladen.`);
    } catch (error) {
      setUpdateConnectorsStatus((error as Error).message);
    } finally {
      setLoadingUpdateConnectors(false);
    }
  }

  async function onSaveSettings() {
    setSavingSettings(true);
    setSettingsStatus('');
    try {
      const [savedCoreSettings, savedAppSettings] = await Promise.all([
        saveCoreSettings(settings),
        saveAppSettings(appSettings),
      ]);
      setSettings(savedCoreSettings);
      setAppSettings(savedAppSettings);
      applyThemeColors({ core: savedCoreSettings });
      setSettingsStatus('Geavanceerde instellingen opgeslagen.');
      await Promise.all([refreshWriteAuthStatus(), fetchBootstrapStatus().then(setBootstrapStatus).catch(() => undefined)]);
    } catch (error) {
      setSettingsStatus((error as Error).message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function onSaveAfas() {
    setSavingAfas(true);
    setAfasStatus('');
    pushDebugLine(`AFAS opslaan gestart: mode=${coreSettings.writeAuthMode} env=${afasForm.environmentId || '-'}`);
    try {
      const savedSettings = await saveCoreSettings(settings);
      setSettings(savedSettings);
      applyThemeColors({ core: savedSettings });
      const saved = await saveAfasConnectionConfig({
        mode: 'afas',
        environmentId: afasForm.environmentId ?? '',
        environmentType: afasForm.environmentType ?? 'production',
        token: afasForm.token?.trim() || undefined,
      });
      setAfasConnection(saved);
      setAfasForm({
        mode: saved.mode,
        environmentId: saved.environmentId,
        environmentType: saved.environmentType,
        token: '',
      });
      setAfasStatus(
        savedSettings.writeAuthMode === 'classic'
          ? saved.hasToken
            ? `AFAS-instellingen opgeslagen. Classic token actief: ${saved.tokenPreview}`
            : 'AFAS-instellingen opgeslagen.'
          : 'AFAS-instellingen opgeslagen. OAuth namens gebruiker is actief en het classic token is verwijderd.',
      );
      pushDebugLine('AFAS-instellingen opgeslagen.');
      await Promise.all([refreshWriteAuthStatus(), fetchBootstrapStatus().then(setBootstrapStatus).catch(() => undefined)]);
    } catch (error) {
      setAfasStatus((error as Error).message);
      pushDebugLine(`AFAS opslaan fout: ${(error as Error).message}`);
    } finally {
      setSavingAfas(false);
    }
  }

  async function onLogoutOauth() {
    setWriteAuthBusy(true);
    try {
      await logoutAfasOAuthSession();
      setAfasStatus('OAuth-sessie afgemeld.');
      await Promise.all([refreshWriteAuthStatus(), fetchBootstrapStatus().then(setBootstrapStatus).catch(() => undefined)]);
    } catch (error) {
      setAfasStatus((error as Error).message);
    } finally {
      setWriteAuthBusy(false);
    }
  }

  const oauthLogin = useAfasOauthPopup({
    onStatusChange: setAfasStatus,
    onIframeSessionChange: (session) => {
      if (session) {
        setIframeSessionProfile(session);
        setIframeSessionStatus('');
        return;
      }
      setIframeSessionProfile(null);
    },
    onDebugLine: pushDebugLine,
    onSuccess: refreshAfterOauthSuccess,
    onFailure: async (message) => {
      await refreshAfterPopupWithoutMessage(message);
    },
  });

  function updateContextEntity(patch: Partial<ContextEntitySettings>) {
    setSettings((current) => ({
      ...current,
      contextEntity: {
        ...current.contextEntity,
        ...patch,
      },
    }));
  }

  function updateCoreSettings(patch: Partial<CoreSettings>) {
    setSettings((current) => ({
      ...current,
      ...patch,
    }));
  }

  function updateThemeColor(key: keyof ThemeColors, value: string) {
    setSettings((current) => ({
      ...current,
      uiColors: {
        ...current.uiColors,
        [key]: value,
      },
    }));
  }

  function onSelectContextConnector(connectorName: string) {
    const connector = getConnectors.find((entry) => entry.name === connectorName);
    const fallbackIdField =
      connector?.fields.find((field) => field.name === coreSettings.contextEntity.idField)?.name ||
      connector?.fields[0]?.name ||
      '';
    const fallbackNameField =
      connector?.fields.find((field) => field.name === coreSettings.contextEntity.nameField)?.name ||
      connector?.fields.find((field) => /desc|name|omschrijving|caption/i.test(field.name))?.name ||
      connector?.fields[1]?.name ||
      connector?.fields[0]?.name ||
      '';

    updateContextEntity({
      connectorName,
      idField: fallbackIdField,
      nameField: fallbackNameField,
    });
  }

  function onToggleGetConnectors() {
    const nextOpen = !getConnectorsOpen;
    setGetConnectorsOpen(nextOpen);
    if (nextOpen) void loadGetConnectors();
  }

  function onToggleUpdateConnectors() {
    const nextOpen = !updateConnectorsOpen;
    setUpdateConnectorsOpen(nextOpen);
    if (nextOpen) void loadUpdateConnectors();
  }

  function onRefreshGetConnectors() {
    void loadGetConnectors(true);
  }

  function onRefreshUpdateConnectors() {
    void loadUpdateConnectors(true);
  }

  function refreshSettingsView() {
    setRefreshVersion((current) => current + 1);
  }

  const hasActiveIframeSession = Boolean(iframeSessionProfile?.sessionId) || bootstrapStatus.hasIframeSession;
  const canStartOauth =
    bootstrapStatus.writeAuthMode === 'oauth_user' &&
    writeAuthStatus.oauthConfigured &&
    hasActiveIframeSession &&
    !oauthLogin.busy;
  const needsOAuthConfiguration =
    bootstrapStatus.writeAuthMode === 'oauth_user' && !writeAuthStatus.oauthConfigured;
  const needsOAuthLogin =
    bootstrapStatus.writeAuthMode === 'oauth_user' &&
    writeAuthStatus.oauthConfigured &&
    !writeAuthStatus.authenticated;
  const nextAuthAction =
    !hasActiveIframeSession
      ? 'Open de app vanuit AFAS zodat eerst een geldige iFrame-sessie beschikbaar is.'
      : bootstrapStatus.writeAuthMode === 'classic'
        ? afasConnection.hasToken
          ? 'De verbinding is klaar voor gebruik.'
          : 'Vul een classic token in en sla de verbinding op.'
        : needsOAuthConfiguration
          ? 'Controleer omgevingsnummer en omgevingstype en klik daarna op Stap 1 opslaan.'
          : needsOAuthLogin
            ? 'Klik op Stap 2: aanmelden via AFAS om namens de gebruiker te werken.'
            : 'De OAuth-sessie is actief. Je kunt verder met de app.';
  const authFlowSteps =
    bootstrapStatus.writeAuthMode === 'classic'
      ? [
          { label: 'Stap 1', title: 'Classic token invullen', done: Boolean(afasConnection.hasToken) },
          { label: 'Stap 2', title: 'AFAS opslaan', done: Boolean(afasConnection.hasToken) },
        ]
      : [
          { label: 'Stap 1', title: 'Omgeving en methode opslaan', done: writeAuthStatus.oauthConfigured },
          { label: 'Stap 2', title: 'Aanmelden via AFAS', done: writeAuthStatus.authenticated },
        ];
  const debugFacts = [
    { label: 'writeAuthMode', value: bootstrapStatus.writeAuthMode || '-' },
    { label: 'oauthConfigured', value: String(writeAuthStatus.oauthConfigured) },
    { label: 'oauthAuthenticated', value: String(writeAuthStatus.authenticated) },
    { label: 'oauthUserId', value: writeAuthStatus.userId || '-' },
    { label: 'settingsAllowed', value: String(bootstrapStatus.settingsAllowed) },
    { label: 'ready', value: String(bootstrapStatus.ready) },
    { label: 'hasIframeSession', value: String(bootstrapStatus.hasIframeSession) },
    { label: 'iframeProfileUserId', value: iframeSessionProfile?.userId || '-' },
    { label: 'iframeProfileSessionId', value: iframeSessionProfile?.sessionId || '-' },
    { label: 'canStartOauth', value: String(canStartOauth) },
    { label: 'blockReason', value: bootstrapStatus.blockReason || '-' },
    { label: 'afasStatus', value: afasStatus || '-' },
  ];
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Solvaters basis app</p>
            <h1 className="text-lg font-semibold text-slate-900">Geavanceerde instellingen</h1>
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
        <ToggleSection
          title="Basisinstellingen"
          description="Contextselectie op basis van ParamId, met een hoofdbron als kapstok voor de app en de header."
          open={baseSettingsOpen}
          onToggle={() => setBaseSettingsOpen((current) => !current)}
        >
          <p className="text-sm leading-6 text-slate-600">
            Stel hier de contextbron en URL-koppeling in die de header en de rest van de app voeden.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">ParamId gebruiken</span>
              <button
                type="button"
                role="switch"
                aria-checked={appSettings.useContextFromParamId}
                onClick={() =>
                  setAppSettings((current) =>
                    normalizeAppSettings({
                      ...current,
                      useContextFromParamId: !current.useContextFromParamId,
                    }),
                  )
                }
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                  appSettings.useContextFromParamId
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                <span>
                  {appSettings.useContextFromParamId
                    ? 'Aan: context wordt uit de querystring gelezen'
                    : 'Uit: de app draait zonder ParamId-context'}
                </span>
                <span
                  className={`inline-flex h-6 w-11 items-center rounded-full transition ${
                    appSettings.useContextFromParamId ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`h-5 w-5 rounded-full bg-white transition ${
                      appSettings.useContextFromParamId ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </span>
              </button>
              <span className="mt-1 block text-xs text-slate-500">
                Deze waarde wordt per app bewaard. Zet hem uit voor algemene pagina&apos;s zonder context in de URL.
              </span>
            </label>

            <label className="text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">ParamId keuze</span>
              <select
                value={coreSettings.contextEntity.paramId}
                onChange={(event) =>
                  updateContextEntity(buildContextEntity(event.target.value, coreSettings.contextEntity))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-600"
                disabled={!appSettings.useContextFromParamId}
              >
                {contextCatalog.map((option) => (
                  <option key={`${option.id}-${option.paramId}-${option.description}`} value={option.paramId}>
                    {option.description} ({option.paramId})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm md:col-span-2">
              <span className="mb-1 flex items-center gap-2 font-medium text-slate-700">
                Hoofdbron
                <InfoHint text="De hoofdbron is de gekoppelde get-connector van deze ParamId. Deze bron is de kapstok voor de rest van de app en levert altijd de input voor de header met code en naam." />
              </span>
              <select
                value={coreSettings.contextEntity.connectorName}
                onChange={(event) => onSelectContextConnector(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-600"
                disabled={!appSettings.useContextFromParamId}
              >
                <option value="">Kies een get-connector</option>
                {getConnectors.map((connector) => (
                  <option key={connector.name} value={connector.name}>
                    {connector.name}
                    {connector.label ? ` - ${connector.label}` : ''}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-500">
                Deze get-connector is de hoofdbron voor de gekozen `ParamId` en voedt direct de app-header.
              </span>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Veld voor ID</span>
              <select
                value={coreSettings.contextEntity.idField}
                onChange={(event) => updateContextEntity({ idField: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-600"
                disabled={!appSettings.useContextFromParamId || !selectedGetConnector}
              >
                <option value="">{selectedGetConnector ? 'Kies een veld' : 'Kies eerst een connector'}</option>
                {selectedGetConnector?.fields.map((field) => (
                  <option key={`id-${field.name}`} value={field.name}>
                    {field.name}
                    {field.label ? ` - ${field.label}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Veld voor omschrijving</span>
              <select
                value={coreSettings.contextEntity.nameField}
                onChange={(event) => updateContextEntity({ nameField: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-600"
                disabled={!appSettings.useContextFromParamId || !selectedGetConnector}
              >
                <option value="">{selectedGetConnector ? 'Kies een veld' : 'Kies eerst een connector'}</option>
                {selectedGetConnector?.fields.map((field) => (
                  <option key={`name-${field.name}`} value={field.name}>
                    {field.name}
                    {field.label ? ` - ${field.label}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Query parameter</span>
              <input
                value={coreSettings.contextEntity.queryParamName}
                onChange={(event) => updateContextEntity({ queryParamName: event.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-600"
                disabled={!appSettings.useContextFromParamId}
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void onSaveSettings()}
              disabled={savingSettings}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingSettings ? 'Opslaan...' : 'Basisinstellingen opslaan'}
            </button>
            {settingsStatus ? <p className="text-sm text-slate-600">{settingsStatus}</p> : null}
          </div>
        </ToggleSection>

        <ToggleSection
          title="Get-connectoren"
          description="Overzicht van verbonden get-connectoren op basis van metainfo, inclusief metadata en de eerste opgehaalde regel."
          open={getConnectorsOpen}
          onToggle={onToggleGetConnectors}
          actions={
            <button
              type="button"
              onClick={onRefreshGetConnectors}
              disabled={loadingGetConnectors}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingGetConnectors ? 'Verversen...' : 'Refresh'}
            </button>
          }
        >
          {getConnectorsStatus ? <p className="mb-4 text-sm text-slate-600">{getConnectorsStatus}</p> : null}
          {loadingGetConnectors ? <p className="text-sm text-slate-600">Get-connectoren laden...</p> : null}
          {!loadingGetConnectors && getConnectors.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="border border-slate-200 px-3 py-2">Connector</th>
                    <th className="border border-slate-200 px-3 py-2">Omschrijving</th>
                    <th className="border border-slate-200 px-3 py-2">Metainfo</th>
                    <th className="border border-slate-200 px-3 py-2">Velden</th>
                    <th className="border border-slate-200 px-3 py-2">Eerste regel</th>
                  </tr>
                </thead>
                <tbody>
                  {getConnectors.map((connector) => (
                    <tr key={connector.name} className="align-top">
                      <td className="border border-slate-200 px-3 py-2 font-medium text-slate-900">
                        {connector.name}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-600">
                        {connector.label || connector.description || '-'}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-600">
                        <ExpandableCell
                          title="Metainfo"
                          subtitle={connector.fields.length ? `${connector.fields.length} velden` : undefined}
                        >
                          <JsonPreview value={connector.metadata} />
                        </ExpandableCell>
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-600">
                        {connector.fields.length ? (
                          <ExpandableCell
                            title="Velden"
                            subtitle={`${connector.fields.length} stuks`}
                          >
                            <div className="space-y-1 text-xs">
                              {connector.fields.map((field) => (
                                <div key={`${connector.name}-${field.name}`}>
                                  {field.name}
                                  {field.label ? ` - ${field.label}` : ''}
                                  {field.type ? ` (${field.type})` : ''}
                                </div>
                              ))}
                            </div>
                          </ExpandableCell>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        {connector.firstRowError ? (
                          <ExpandableCell title="Niet beschikbaar" subtitle="eerste regel">
                            <p className="text-xs leading-5 text-slate-600">{connector.firstRowError}</p>
                          </ExpandableCell>
                        ) : (
                          <ExpandableCell title="Eerste regel" subtitle={connector.firstRow ? '1 record' : 'leeg'}>
                            <JsonPreview value={connector.firstRow} />
                          </ExpandableCell>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </ToggleSection>

        <ToggleSection
          title="Update-connectoren"
          description="Overzicht van update-connectoren op basis van metainfo/update, inclusief veldmetadata."
          open={updateConnectorsOpen}
          onToggle={onToggleUpdateConnectors}
          actions={
            <button
              type="button"
              onClick={onRefreshUpdateConnectors}
              disabled={loadingUpdateConnectors}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingUpdateConnectors ? 'Verversen...' : 'Refresh'}
            </button>
          }
        >
          {updateConnectorsStatus ? <p className="mb-4 text-sm text-slate-600">{updateConnectorsStatus}</p> : null}
          {loadingUpdateConnectors ? <p className="text-sm text-slate-600">Update-connectoren laden...</p> : null}
          {!loadingUpdateConnectors && updateConnectors.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="border border-slate-200 px-3 py-2">Connector</th>
                    <th className="border border-slate-200 px-3 py-2">Omschrijving</th>
                    <th className="border border-slate-200 px-3 py-2">Velden</th>
                    <th className="border border-slate-200 px-3 py-2">Metainfo</th>
                  </tr>
                </thead>
                <tbody>
                  {updateConnectors.map((connector) => (
                    <tr key={connector.name} className="align-top">
                      <td className="border border-slate-200 px-3 py-2 font-medium text-slate-900">
                        {connector.name}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-600">
                        {connector.label || connector.description || '-'}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-600">
                        {connector.fields.length ? (
                          <ExpandableCell
                            title="Velden"
                            subtitle={`${connector.fields.length} stuks`}
                          >
                            <div className="space-y-1 text-xs">
                              {connector.fields.map((field) => (
                                <div key={`${connector.name}-${field.name}`}>
                                  {field.name}
                                  {field.label ? ` - ${field.label}` : ''}
                                  {field.type ? ` (${field.type})` : ''}
                                  {field.required ? ' verplicht' : ''}
                                </div>
                              ))}
                            </div>
                          </ExpandableCell>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        <ExpandableCell
                          title="Metainfo"
                          subtitle={connector.fields.length ? `${connector.fields.length} velden` : undefined}
                        >
                          <JsonPreview value={connector.metadata} />
                        </ExpandableCell>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </ToggleSection>

        <ToggleSection
          title="AFAS-authenticatie"
          description="Kies hier de AFAS-verbindingsmethode en beheer classic token of OAuth namens gebruiker."
          open={authOpen}
          onToggle={() => setAuthOpen((current) => !current)}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="mt-1 text-sm text-slate-600">
                Kies hier de AFAS-verbindingsmethode: óf classic token óf OAuth namens gebruiker.
              </p>
            </div>
            {coreSettings.writeAuthMode === 'classic' && afasConnection.hasToken ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                Token actief: {afasConnection.tokenPreview}
              </span>
            ) : null}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap gap-3">
              {authFlowSteps.map((step) => (
                <div
                  key={step.label}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-700'
                  }`}
                >
                  <span className="font-semibold">{step.label}</span> {step.title}
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {bootstrapStatus.writeAuthMode === 'oauth_user'
                ? needsOAuthConfiguration
                  ? 'Sla eerst omgevingsnummer, omgevingstype en de gekozen methode op. Daarna wordt OAuth configureerbaar en kun je aanmelden.'
                  : needsOAuthLogin
                    ? 'De basisconfiguratie staat goed. De volgende stap is aanmelden via AFAS om namens de gebruiker te werken.'
                    : 'De OAuth-configuratie en gebruikerssessie zijn actief.'
                : 'Classic token wordt direct gebruikt zodra je de verbinding opslaat.'}
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Verbinding</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {coreSettings.writeAuthMode === 'oauth_user'
                  ? writeAuthStatus.oauthConfigured
                    ? `AFAS ${afasForm.environmentId || afasConnection.environmentId || '-'} staat klaar`
                    : 'Basisconfiguratie nog niet afgerond'
                  : afasConnection.hasToken
                    ? `Classic token actief voor ${afasConnection.environmentId || afasForm.environmentId || '-'}`
                    : 'Classic token ontbreekt'}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Omgevingstype: {afasForm.environmentType || afasConnection.environmentType || '-'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">AFAS-context</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {iframeSessionProfile?.sessionId ? 'iFrame-sessie gevonden' : 'Nog geen iFrame-sessie'}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {iframeSessionProfile?.displayName || iframeSessionProfile?.userId || 'Open de app vanuit AFAS.'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Volgende stap</p>
              <p className="mt-2 text-sm font-medium text-slate-900">{nextAuthAction}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block font-medium text-slate-700">Verbindingsmethode</span>
              <select
                value={coreSettings.writeAuthMode}
                onChange={(event) =>
                  updateCoreSettings({ writeAuthMode: event.target.value as AfasWriteAuthMode })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-600"
              >
                <option value="classic">Classic token</option>
                <option value="oauth_user">OAuth namens gebruiker</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Omgevingsnummer</span>
              <input
                value={afasForm.environmentId}
                onChange={(event) =>
                  setAfasForm((current) => ({ ...current, environmentId: event.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-600"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Omgevingstype</span>
              <select
                value={afasForm.environmentType}
                onChange={(event) =>
                  setAfasForm((current) => ({
                    ...current,
                    environmentType: event.target.value as AfasConnectionInput['environmentType'],
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-600"
              >
                <option value="production">production</option>
                <option value="test">test</option>
                <option value="accept">accept</option>
              </select>
            </label>
          </div>

          {coreSettings.writeAuthMode === 'classic' ? (
            <label className="mt-4 block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Classic token</span>
              <input
                type="password"
                value={afasForm.token ?? ''}
                onChange={(event) =>
                  setAfasForm((current) => ({ ...current, token: event.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-600"
                placeholder="Laat leeg om bestaand token te behouden"
              />
            </label>
          ) : (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              OAuth namens gebruiker is actief. De backend gebruikt dan alleen nog user-bound OAuth en verwijdert het
              classic token uit de actieve configuratie.
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void onSaveAfas()}
              disabled={savingAfas}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingAfas
                ? 'Opslaan...'
                : coreSettings.writeAuthMode === 'oauth_user'
                  ? 'Stap 1 opslaan'
                  : 'AFAS opslaan'}
            </button>
            {afasStatus ? <p className="text-sm text-slate-600">{afasStatus}</p> : null}
          </div>

          <div className="mt-6 border-t border-slate-200 pt-6">
            <h3 className="text-sm font-semibold text-slate-900">OAuth namens gebruiker</h3>
            <p className="mt-1 text-sm text-slate-600">
              {writeAuthStatus.message || 'Controleer en beheer hier de OAuth-gebruikerssessie.'}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span
                className={`rounded-full px-3 py-1 font-medium ${
                  writeAuthStatus.oauthConfigured ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-700'
                }`}
              >
                Configuratie: {writeAuthStatus.oauthConfigured ? 'gereed' : 'onvolledig'}
              </span>
              <span
                className={`rounded-full px-3 py-1 font-medium ${
                  writeAuthStatus.oauthClientIdConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                }`}
              >
                Client ID: {writeAuthStatus.oauthClientIdConfigured ? 'ingevuld' : 'ontbreekt'}
              </span>
              <span
                className={`rounded-full px-3 py-1 font-medium ${
                  writeAuthStatus.oauthClientSecretConfigured
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                Client secret: {writeAuthStatus.oauthClientSecretConfigured ? 'ingevuld' : 'ontbreekt'}
              </span>
              <span
                className={`rounded-full px-3 py-1 font-medium ${
                  writeAuthStatus.keyVaultConfigured ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'
                }`}
              >
                Bron: {writeAuthStatus.keyVaultConfigured ? 'Key Vault actief' : 'omgevingvariabelen'}
              </span>
              <span
                className={`rounded-full px-3 py-1 font-medium ${
                  writeAuthStatus.authenticated ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                }`}
              >
                Sessiestatus: {writeAuthStatus.authenticated ? 'aangemeld' : 'niet aangemeld'}
              </span>
              {writeAuthStatus.displayName ? (
                <span className="rounded-full bg-violet-100 px-3 py-1 font-medium text-violet-700">
                  Gebruiker: {writeAuthStatus.displayName}
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-sm text-slate-600">
              De waarden zelf blijven verborgen; je ziet hier alleen of de vereiste OAuth-secrets aanwezig zijn.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void oauthLogin.startLogin()}
                disabled={writeAuthBusy || oauthLogin.busy || !canStartOauth}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {oauthLogin.busy
                  ? 'Aanmelden bezig...'
                  : needsOAuthConfiguration
                    ? 'Sla eerst stap 1 op'
                    : 'Stap 2: aanmelden via AFAS'}
              </button>
              {!canStartOauth ? (
                <p className="self-center text-sm text-slate-600">
                  {!hasActiveIframeSession
                    ? 'Deze knop wordt actief zodra een iFrame-sessie bekend is.'
                    : !writeAuthStatus.oauthConfigured
                      ? 'Deze knop wordt actief zodra stap 1 is opgeslagen en de OAuth-configuratie compleet is.'
                      : 'Deze knop wordt actief zodra de huidige sessie opnieuw is gecontroleerd.'}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void onLogoutOauth()}
                disabled={writeAuthBusy || oauthLogin.busy || !writeAuthStatus.authenticated}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Afmelden
              </button>
            </div>
          </div>
        </ToggleSection>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">iFrame-sessie</h2>
          {iframeSessionProfile ? (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-slate-700">Sessie-ID</dt>
                <dd className="mt-1 break-all text-slate-600">{iframeSessionProfile.sessionId}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Gebruiker</dt>
                <dd className="mt-1 text-slate-600">
                  {iframeSessionProfile.displayName || iframeSessionProfile.userId}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">User ID</dt>
                <dd className="mt-1 text-slate-600">{iframeSessionProfile.userId}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-700">Omgeving</dt>
                <dd className="mt-1 text-slate-600">{iframeSessionProfile.environmentId || '-'}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-600">{iframeSessionStatus}</p>
          )}
        </section>

        <ToggleSection
          title="App kleurenschema"
          description="Beheer hier de themamodus en de kleuren van de app."
          open={themeOpen}
          onToggle={() => setThemeOpen((current) => !current)}
        >
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap gap-3">
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  coreSettings.uiThemeMode === 'standard'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-white text-slate-700'
                }`}
              >
                Standaard
              </span>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  coreSettings.uiThemeMode === 'standard_dark'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-white text-slate-700'
                }`}
              >
                Dark mode
              </span>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  coreSettings.uiThemeMode === 'custom'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-white text-slate-700'
                }`}
              >
                Custom
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              De gekozen modus wordt nu direct als voorbeeld toegepast. Klik daarna nog op opslaan om hem blijvend te
              bewaren.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">Themamodus</span>
              <select
                value={coreSettings.uiThemeMode}
                onChange={(event) =>
                  updateCoreSettings({ uiThemeMode: event.target.value as UiThemeMode })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-600"
              >
                <option value="standard">Standard</option>
                <option value="standard_dark">Dark mode</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(coreSettings.uiColors).map(([key, value]) => (
              <label key={key} className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  {THEME_COLOR_LABELS[key as keyof ThemeColors].label}
                </span>
                <span className="mb-2 block text-xs leading-5 text-slate-500">
                  {THEME_COLOR_LABELS[key as keyof ThemeColors].description}
                </span>
                <input
                  type="color"
                  value={value}
                  onChange={(event) => updateThemeColor(key as keyof ThemeColors, event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white p-1"
                  disabled={coreSettings.uiThemeMode !== 'custom'}
                />
              </label>
            ))}
          </div>

          {coreSettings.uiThemeMode !== 'custom' ? (
            <p className="mt-4 text-sm text-slate-600">
              De kleurkiezers worden actief zodra je `Custom` kiest.
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void onSaveSettings()}
              disabled={savingSettings}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingSettings ? 'Opslaan...' : 'Kleurenschema opslaan'}
            </button>
            {settingsStatus ? <p className="text-sm text-slate-600">{settingsStatus}</p> : null}
          </div>
        </ToggleSection>
      </main>
    </div>
  );
}

