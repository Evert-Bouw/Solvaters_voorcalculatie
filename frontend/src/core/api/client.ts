import {
  AfasConnectionConfig,
  CoreSettings,
  AfasGetConnectorInfo,
  AfasConnectionInput,
  AfasUpdateConnectorInfo,
  AfasWriteAuthStatus,
  BootstrapStatus,
  ContextRecord,
  IframeSessionProfile,
  ParamIdOption,
} from '../types';
import { normalizeCoreSettings } from '../settings';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../settings/compose';
import { Settings } from '../../settings/types';
import { AppSettings } from '../../app/settings/types';
import { normalizeAppSettings } from '../../app/settings/defaults';

const settingsCacheKey = 'solvaters_basis_app_settings';
const coreSettingsCacheKey = 'solvaters_basis_core_settings';
const appSettingsCacheKey = 'solvaters_basis_only_app_settings';
const appSessionStorageKey = 'solvaters_basis_app_session_id';
const iframeSessionStorageKey = 'solvaters_basis_iframe_session_id';
const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '';
const popupMessageOrigin = (() => {
  if (!apiBase) return window.location.origin;
  try {
    return new URL(apiBase, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
})();
const trustedPopupMessageOrigins = new Set([window.location.origin, popupMessageOrigin].filter(Boolean));

function getEmbedOrigin() {
  const ancestorOrigin = window.location.ancestorOrigins?.[0]?.trim();
  if (ancestorOrigin) return ancestorOrigin;
  if (!document.referrer) return '';
  try {
    return new URL(document.referrer).origin;
  } catch {
    return '';
  }
}

export const DEFAULT_AFAS_CONNECTION: AfasConnectionConfig = {
  mode: 'afas',
  environmentId: '',
  environmentType: 'production',
  hasToken: false,
  tokenPreview: '',
};

export const DEFAULT_WRITE_AUTH_STATUS: AfasWriteAuthStatus = {
  mode: 'classic',
  oauthConfigured: false,
  oauthClientIdConfigured: false,
  oauthClientSecretConfigured: false,
  keyVaultConfigured: false,
  authenticated: false,
  message: '',
};

export const DEFAULT_BOOTSTRAP_STATUS: BootstrapStatus = {
  ready: false,
  writeAuthMode: 'classic',
  blockReason: 'iframe_required',
  message: '',
  hasIframeSession: false,
  classicConfigured: false,
  oauthConfigured: false,
  oauthAuthenticated: false,
  settingsAllowed: false,
  bootstrapRequired: false,
  bootstrapAllowed: false,
};

function createAppSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateAppSessionId() {
  const existing = localStorage.getItem(appSessionStorageKey)?.trim();
  if (existing) return existing;
  const nextValue = createAppSessionId();
  localStorage.setItem(appSessionStorageKey, nextValue);
  return nextValue;
}

export function getStoredIframeSessionId() {
  return localStorage.getItem(iframeSessionStorageKey)?.trim() || '';
}

export function storeIframeSessionId(sessionId?: string) {
  const trimmed = sessionId?.trim() || '';
  if (!trimmed) {
    localStorage.removeItem(iframeSessionStorageKey);
    return;
  }
  localStorage.setItem(iframeSessionStorageKey, trimmed);
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const embedOrigin = getEmbedOrigin();
  const iframeSessionId = getStoredIframeSessionId();
  const response = await fetch(`${apiBase}${url}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Session-Id': getOrCreateAppSessionId(),
      ...(iframeSessionId ? { 'X-Iframe-Session-Id': iframeSessionId } : {}),
      ...(embedOrigin ? { 'X-Embed-Origin': embedOrigin } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const responseText = await response.text();
    let message = responseText;
    try {
      const parsed = responseText ? (JSON.parse(responseText) as { error?: string; message?: string }) : undefined;
      message = parsed?.error || parsed?.message || responseText;
    } catch {
      // Keep raw response text when it is not JSON.
    }
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json();
}

export async function fetchCoreSettings(): Promise<CoreSettings> {
  try {
    const settings = normalizeCoreSettings(await api<Partial<CoreSettings> & Record<string, unknown>>('/api/core/settings'));
    localStorage.setItem(coreSettingsCacheKey, JSON.stringify(settings));
    return settings;
  } catch (error) {
    const fromStorage = localStorage.getItem(coreSettingsCacheKey);
    if (!fromStorage) throw error;
    return normalizeCoreSettings(JSON.parse(fromStorage) as Partial<CoreSettings> & Record<string, unknown>);
  }
}

export async function saveCoreSettings(settings: CoreSettings): Promise<CoreSettings> {
  const saved = normalizeCoreSettings(
    await api<Partial<CoreSettings> & Record<string, unknown>>('/api/core/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),
  );
  localStorage.setItem(coreSettingsCacheKey, JSON.stringify(saved));
  return saved;
}

export async function fetchAppSettings(): Promise<AppSettings> {
  try {
    const settings = normalizeAppSettings(await api<Partial<AppSettings> & Record<string, unknown>>('/api/app/settings'));
    localStorage.setItem(appSettingsCacheKey, JSON.stringify(settings));
    return settings;
  } catch (error) {
    const fromStorage = localStorage.getItem(appSettingsCacheKey);
    if (!fromStorage) throw error;
    return normalizeAppSettings(JSON.parse(fromStorage) as Partial<AppSettings> & Record<string, unknown>);
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  const saved = normalizeAppSettings(
    await api<Partial<AppSettings> & Record<string, unknown>>('/api/app/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    }),
  );
  localStorage.setItem(appSettingsCacheKey, JSON.stringify(saved));
  return saved;
}

export async function fetchSettings(): Promise<Settings> {
  try {
    const [core, app] = await Promise.all([fetchCoreSettings(), fetchAppSettings()]);
    const settings = normalizeSettings({ core, app });
    localStorage.setItem(settingsCacheKey, JSON.stringify(settings));
    return settings;
  } catch (error) {
    const fromStorage = localStorage.getItem(settingsCacheKey);
    if (!fromStorage) throw error;
    return normalizeSettings(JSON.parse(fromStorage) as Partial<Settings> & Record<string, unknown>);
  }
}

export const fetchContextCatalog = () => api<ParamIdOption[]>('/api/context/catalog');
export const fetchContextRecord = (recordId: string) =>
  api<ContextRecord>(`/api/context/${encodeURIComponent(recordId)}`);

export const fetchAfasConnectionConfig = () => api<AfasConnectionConfig>('/api/afas/config');
export const saveAfasConnectionConfig = (input: AfasConnectionInput) =>
  api<AfasConnectionConfig>('/api/afas/config', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const fetchAfasWriteAuthStatus = () => api<AfasWriteAuthStatus>('/api/afas/write-auth-status');
export const fetchBootstrapStatus = () => api<BootstrapStatus>('/api/bootstrap/status');
export const fetchAfasGetConnectors = () => api<AfasGetConnectorInfo[]>('/api/afas/connectors/get');
export const fetchAfasUpdateConnectors = () => api<AfasUpdateConnectorInfo[]>('/api/afas/connectors/update');

export async function fetchAfasOAuthStartUrl(options?: { appSessionId?: string; iframeSessionId?: string }) {
  const params = new URLSearchParams();
  const appSessionId = options?.appSessionId?.trim() || getOrCreateAppSessionId();
  const iframeSessionId = options?.iframeSessionId?.trim() || getStoredIframeSessionId();
  if (appSessionId) params.set('appSessionId', appSessionId);
  if (iframeSessionId) params.set('iframeSessionId', iframeSessionId);
  const suffix = params.size ? `?${params.toString()}` : '';
  const response = await api<{ ok: boolean; url?: string; error?: string }>(`/api/afas/oauth/start-url${suffix}`);
  if (!response.url) {
    throw new Error(response.error || 'AFAS OAuth-starturl ontbreekt.');
  }
  return response.url;
}

export function isTrustedPopupMessageOrigin(origin: string) {
  return trustedPopupMessageOrigins.has(origin);
}

export const logoutAfasOAuthSession = () =>
  api<{ ok: boolean }>('/api/afas/oauth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  });

export const exchangeIframeSession = async (input: {
  tokenurl: string;
  code: string;
  publickey: string;
  sessionid: string;
}) => {
  const response = await api<{ ok: boolean; session: IframeSessionProfile }>('/api/iframe/exchange', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  storeIframeSessionId(response.session?.sessionId);
  return response;
};

export const fetchIframeSessionProfile = async () => {
  const storedSessionId = getStoredIframeSessionId();
  const endpoint = storedSessionId
    ? `/api/iframe/session/${encodeURIComponent(storedSessionId)}`
    : '/api/iframe/session/current';
  try {
    const response = await api<{ ok: boolean; session: IframeSessionProfile }>(endpoint);
    storeIframeSessionId(response.session?.sessionId);
    return response;
  } catch (error) {
    if (storedSessionId) {
      storeIframeSessionId('');
    }
    throw error;
  }
};
