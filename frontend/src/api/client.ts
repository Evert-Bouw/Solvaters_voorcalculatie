import {
  AfasConnectionConfig,
  AfasConnectionInput,
  AfasWriteAuthStatus,
  Creditor,
  Item,
  IframeSessionProfile,
  Project,
  ProjectStage,
  QuotationLockResponse,
  QuotationLineFieldMapping,
  Quotation,
  QuotationLine,
  SaveQuotationLinesPayload,
  Settings,
} from '../types';

const settingsCacheKey = 'voorcalc_app_settings';
const appSessionCacheKey = 'voorcalc_app_session_id';
const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || '';
const allMarkups: Settings['markupOrder'] = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'];
const legacyMarkupMap: Record<string, Settings['markupOrder'][number]> = {
  UITVAL: 'M1',
  AFVAL: 'M2',
  UA: 'M3',
  Q1: 'M4',
  Q2: 'M5',
  Q3: 'M6',
  OH: 'M7',
  R: 'M8',
  W: 'M9',
  RW: 'M10',
};

function normalizeMarkupKey(value: unknown): Settings['markupOrder'][number] | null {
  if (typeof value !== 'string') return null;
  if (allMarkups.includes(value as Settings['markupOrder'][number])) return value as Settings['markupOrder'][number];
  return legacyMarkupMap[value] ?? null;
}

const defaultSettings: Settings = {
  dataMode: 'afas',
  writeAuthMode: 'classic',
  usePhases: true,
  libraryEnabled: true,
  supplierColumnEnabled: false,
  purchasePriceColumnEnabled: false,
  columnVisibility: { item: true, description: true, purchaseEnabled: true, supplier: false, unit: true, baseQty: true, computedQty: true, unitCost: true, purchasePrice: false, computedUnitCost: true, costTotal: true, unitPrice: true, priceTotal: true, actions: true },
  lineMarkupCount: 0,
  phaseMarkupCount: 0,
  rwCombined: false,
  uaCombined: false,
  markupOrder: [...allMarkups],
  columnOrder: [],
  lineMarkups: { M1: false, M2: false, M3: false, M4: false, M5: false, M6: false, M7: false, M8: false, M9: false, M10: false },
  phaseMarkups: { M1: true, M2: false, M3: false, M4: false, M5: false, M6: false, M7: false, M8: false, M9: false, M10: false },
  lineMarkupBases: { M1: 'cost', M2: 'cost', M3: 'cost', M4: 'cost', M5: 'cost', M6: 'cost', M7: 'cost', M8: 'cost', M9: 'cost', M10: 'cost' },
  lineMarkupValueTypes: { M1: 'percentage', M2: 'percentage', M3: 'percentage', M4: 'percentage', M5: 'percentage', M6: 'percentage', M7: 'percentage', M8: 'percentage', M9: 'percentage', M10: 'percentage' },
  phaseMarkupBases: { M1: 'cost', M2: 'cost', M3: 'cost', M4: 'cost', M5: 'cost', M6: 'cost', M7: 'cost', M8: 'cost', M9: 'cost', M10: 'cost' },
  phaseMarkupValueTypes: { M1: 'percentage', M2: 'percentage', M3: 'percentage', M4: 'percentage', M5: 'percentage', M6: 'percentage', M7: 'percentage', M8: 'percentage', M9: 'percentage', M10: 'percentage' },
  lineMarkupItemCodes: { M1: 'V1', M2: 'V2', M3: 'V3', M4: 'V4', M5: 'V5', M6: 'V6', M7: 'V7', M8: 'V8', M9: 'V9', M10: 'V10' },
  lineMarkupDescriptions: { M1: 'Vrije opslag kolom 1', M2: 'Vrije opslag kolom 2', M3: 'Vrije opslag kolom 3', M4: 'Vrije opslag kolom 4', M5: 'Vrije opslag kolom 5', M6: 'Vrije opslag kolom 6', M7: 'Vrije opslag kolom 7', M8: 'Vrije opslag kolom 8', M9: 'Vrije opslag kolom 9', M10: 'Vrije opslag kolom 10' },
  lineMarkupAfasIds: {},
  lineMarkupPreferenceValues: {},
  quotationLineConfigurableAfasIds: {
    'QL-SUPPLIER_ID': '',
    'QL-ORDER': '',
    'QL-QTY_BASE': '',
    'QL-QTY_FORMULA_MEMO': '',
    'QL-COST_FORMULA_MEMO': '',
    'QL-MARKUP_FORMULA_MEMO': '',
    'QL-UNIT_COST_BASE': '',
    'QL-PURCHASE_PRICE': '',
    'QL-UNIT_PRICE_BASE': '',
    'QL-PURCHASE_ENABLED': '',
  },
  phaseMarkupItemCodes: { M1: 'V1', M2: 'V2', M3: 'V3', M4: 'V4', M5: 'V5', M6: 'V6', M7: 'V7', M8: 'V8', M9: 'V9', M10: 'V10' },
  phaseMarkupDescriptions: { M1: 'Vrije opslag regel 1', M2: 'Vrije opslag regel 2', M3: 'Vrije opslag regel 3', M4: 'Vrije opslag regel 4', M5: 'Vrije opslag regel 5', M6: 'Vrije opslag regel 6', M7: 'Vrije opslag regel 7', M8: 'Vrije opslag regel 8', M9: 'Vrije opslag regel 9', M10: 'Vrije opslag regel 10' },
  phaseMarkupAfasIds: {},
  phaseMarkupPreferenceValues: {},
  unitCostCalculatorEnabled: true,
  uiThemeMode: 'standard',
  uiColors: {
    brand50: '#eff6ff',
    brand100: '#dbeafe',
    brand600: '#2563eb',
    brand700: '#1d4ed8',
    appBg: '#f1f5f9',
    panelBg: '#ffffff',
    mutedBg: '#f8fafc',
    panelBorder: '#e2e8f0',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
  },
};

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const appSessionId = getOrCreateAppSessionId();
  const iframeSessionId = getStoredIframeSessionId();
  const res = await fetch(`${apiBase}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-App-Session-Id': appSessionId,
      ...(iframeSessionId ? { 'X-Iframe-Session-Id': iframeSessionId } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || `Request failed: ${res.status}`);
  }
  return res.json();
}

function createClientSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getOrCreateAppSessionId() {
  const existing = localStorage.getItem(appSessionCacheKey)?.trim();
  if (existing) return existing;
  const next = createClientSessionId();
  localStorage.setItem(appSessionCacheKey, next);
  return next;
}

function getStoredIframeSessionId() {
  return localStorage.getItem('voorcalc_iframe_session_id')?.trim() || '';
}

function normalizeSettings(input: Partial<Settings>): Settings {
  const inputOrder = Array.isArray(input.markupOrder) ? input.markupOrder : [];
  const seen = new Set<Settings['markupOrder'][number]>();
  const markupOrder: Settings['markupOrder'] = [];
  inputOrder.forEach((entry) => {
    const normalizedEntry = normalizeMarkupKey(entry);
    if (!normalizedEntry || seen.has(normalizedEntry)) return;
    seen.add(normalizedEntry);
    markupOrder.push(normalizedEntry);
  });
  allMarkups.forEach((type) => {
    if (!seen.has(type)) markupOrder.push(type);
  });
  const inputColumnOrder = Array.isArray(input.columnOrder) ? input.columnOrder : [];
  const columnSeen = new Set<string>();
  const columnOrder: string[] = [];
  inputColumnOrder.forEach((entry) => {
    if (typeof entry !== 'string') return;
    const key = entry.trim();
    if (!key || columnSeen.has(key)) return;
    columnSeen.add(key);
    columnOrder.push(key);
  });

  const maxMarkups = 10;
  const lineMarkupCount = Number.isFinite(Number(input.lineMarkupCount)) ? Math.max(0, Math.min(maxMarkups, Number(input.lineMarkupCount))) : defaultSettings.lineMarkupCount;
  const phaseMarkupCount = Number.isFinite(Number(input.phaseMarkupCount)) ? Math.max(0, Math.min(maxMarkups, Number(input.phaseMarkupCount))) : defaultSettings.phaseMarkupCount;

  const descriptions = { ...defaultSettings.phaseMarkupDescriptions, ...(input.phaseMarkupDescriptions ?? {}) };
  const legacyToUniversal: Array<[keyof typeof descriptions, string[], string]> = [
    ['M4', ['Vrij aantal opslag'], 'Vrije opslag kolom 1'],
    ['M5', ['Vrij aantal opslag'], 'Vrije opslag kolom 2'],
    ['M6', ['Vrij aantal opslag'], 'Vrije opslag kolom 3'],
  ];
  legacyToUniversal.forEach(([type, legacyValues, replacement]) => {
    if (legacyValues.includes((descriptions[type] ?? '').trim())) descriptions[type] = replacement;
  });

  const normalized: Settings = {
    ...defaultSettings,
    ...input,
    dataMode: 'afas',
    writeAuthMode: input.writeAuthMode === 'oauth_user' ? 'oauth_user' : 'classic',
    markupOrder,
    columnOrder,
    lineMarkupCount,
    phaseMarkupCount,
    lineMarkups: { ...defaultSettings.lineMarkups, ...(input.lineMarkups ?? {}) },
    libraryEnabled: input.libraryEnabled ?? defaultSettings.libraryEnabled,
    columnVisibility: { ...defaultSettings.columnVisibility, ...(input.columnVisibility ?? {}) },
    supplierColumnEnabled: input.supplierColumnEnabled ?? input.columnVisibility?.supplier ?? defaultSettings.supplierColumnEnabled,
    purchasePriceColumnEnabled: input.purchasePriceColumnEnabled ?? input.columnVisibility?.purchasePrice ?? defaultSettings.purchasePriceColumnEnabled,
    phaseMarkups: { ...defaultSettings.phaseMarkups, ...(input.phaseMarkups ?? {}) },
    lineMarkupBases: { ...defaultSettings.lineMarkupBases, ...(input.lineMarkupBases ?? (input as unknown as { markupBases?: Settings['lineMarkupBases'] }).markupBases ?? {}) },
    lineMarkupValueTypes: { ...defaultSettings.lineMarkupValueTypes, ...(input.lineMarkupValueTypes ?? (input as unknown as { markupValueTypes?: Settings['lineMarkupValueTypes'] }).markupValueTypes ?? {}) },
    phaseMarkupBases: (() => {
      const merged = { ...defaultSettings.phaseMarkupBases, ...(input.phaseMarkupBases ?? (input as unknown as { markupBases?: Settings['phaseMarkupBases'] }).markupBases ?? {}) };
      (Object.keys(merged) as Array<keyof typeof merged>).forEach((k) => {
        if (merged[k] === 'quantity') merged[k] = 'cost';
      });
      return merged;
    })(),
    phaseMarkupValueTypes: { ...defaultSettings.phaseMarkupValueTypes, ...(input.phaseMarkupValueTypes ?? (input as unknown as { markupValueTypes?: Settings['phaseMarkupValueTypes'] }).markupValueTypes ?? {}) },
    lineMarkupItemCodes: { ...defaultSettings.lineMarkupItemCodes, ...(input.lineMarkupItemCodes ?? input.phaseMarkupItemCodes ?? {}) },
    lineMarkupDescriptions: { ...defaultSettings.lineMarkupDescriptions, ...(input.lineMarkupDescriptions ?? input.phaseMarkupDescriptions ?? {}) },
    lineMarkupAfasIds: { ...defaultSettings.lineMarkupAfasIds, ...(input.lineMarkupAfasIds ?? {}) },
    lineMarkupPreferenceValues: { ...defaultSettings.lineMarkupPreferenceValues, ...(input.lineMarkupPreferenceValues ?? {}) },
    quotationLineConfigurableAfasIds: {
      ...defaultSettings.quotationLineConfigurableAfasIds,
      ...(input.quotationLineConfigurableAfasIds ?? {}),
    },
    phaseMarkupItemCodes: { ...defaultSettings.phaseMarkupItemCodes, ...(input.phaseMarkupItemCodes ?? {}) },
    phaseMarkupDescriptions: descriptions,
    phaseMarkupAfasIds: { ...defaultSettings.phaseMarkupAfasIds, ...(input.phaseMarkupAfasIds ?? {}) },
    phaseMarkupPreferenceValues: { ...defaultSettings.phaseMarkupPreferenceValues, ...(input.phaseMarkupPreferenceValues ?? {}) },
    unitCostCalculatorEnabled: input.unitCostCalculatorEnabled ?? defaultSettings.unitCostCalculatorEnabled,
    uiThemeMode: input.uiThemeMode === 'standard_dark' || input.uiThemeMode === 'custom' ? input.uiThemeMode : 'standard',
    uiColors: { ...defaultSettings.uiColors, ...(input.uiColors ?? {}) },
  };
  normalized.lineMarkupCount = markupOrder.filter((type) => normalized.lineMarkups[type]).length;
  normalized.phaseMarkupCount = markupOrder.filter((type) => normalized.phaseMarkups[type]).length;
  normalized.columnVisibility.supplier = normalized.supplierColumnEnabled;
  normalized.columnVisibility.purchasePrice = normalized.purchasePriceColumnEnabled;
  return normalized;
}

export const fetchProjects = () => api<Project[]>(`/api/projects`);
export const fetchProject = (projectId: string) => api<Project>(`/api/projects/${encodeURIComponent(projectId)}`);
export const updateProject = (projectId: string, payload: Partial<Project>) =>
  api<Project>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const fetchProjectStages = (projectId: string) =>
  api<ProjectStage[]>(`/api/projects/${encodeURIComponent(projectId)}/stages`);

export const createProjectStage = (projectId: string, payload: Partial<ProjectStage>) =>
  api<ProjectStage>(`/api/projects/${encodeURIComponent(projectId)}/stages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateProjectStage = (projectId: string, stageId: string, payload: Partial<ProjectStage>) =>
  api<ProjectStage>(`/api/projects/${encodeURIComponent(projectId)}/stages/${encodeURIComponent(stageId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const fetchQuotations = (projectId: string) =>
  api<Quotation[]>(`/api/projects/${encodeURIComponent(projectId)}/quotations`);

export const createQuotation = (projectId: string, payload: Partial<Quotation>) =>
  api<Quotation>(`/api/projects/${encodeURIComponent(projectId)}/quotations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateQuotation = (projectId: string, quotationId: string, payload: Partial<Quotation>) =>
  api<Quotation>(`/api/projects/${encodeURIComponent(projectId)}/quotations/${encodeURIComponent(quotationId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const fetchQuotationLines = (projectId: string) =>
  api<QuotationLine[]>(`/api/projects/${encodeURIComponent(projectId)}/quotation-lines`);

export const fetchQuotationLineFieldMappings = () =>
  api<QuotationLineFieldMapping[]>('/api/quotation-line-field-mappings');

export const saveQuotationLines = (projectId: string, payload: SaveQuotationLinesPayload) =>
  api<{ ok: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/quotation-lines/save`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const fetchItems = (query: string) => api<Item[]>(`/api/items?query=${encodeURIComponent(query)}`);
export const fetchCreditors = (query: string) => api<Creditor[]>(`/api/creditors?query=${encodeURIComponent(query)}`);

export async function fetchSettings(): Promise<Settings> {
  try {
    const settings = normalizeSettings(await api<Partial<Settings>>(`/api/settings`));
    localStorage.setItem(settingsCacheKey, JSON.stringify(settings));
    return settings;
  } catch (error) {
    const fromStorage = localStorage.getItem(settingsCacheKey);
    if (!fromStorage) throw error;
    return normalizeSettings(JSON.parse(fromStorage) as Partial<Settings>);
  }
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const saved = normalizeSettings(
    await api<Partial<Settings>>(`/api/settings`, {
      method: 'POST',
      body: JSON.stringify(settings),
    }),
  );
  localStorage.setItem(settingsCacheKey, JSON.stringify(saved));
  return saved;
}

export const fetchAfasConnectionConfig = () => api<AfasConnectionConfig>('/api/afas/config');

export const fetchAfasWriteAuthStatus = () => api<AfasWriteAuthStatus>('/api/afas/write-auth-status');

export const saveAfasConnectionConfig = (input: AfasConnectionInput) =>
  api<AfasConnectionConfig>('/api/afas/config', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export function getAfasOAuthStartUrl() {
  const params = new URLSearchParams();
  params.set('appSessionId', getOrCreateAppSessionId());
  const iframeSessionId = getStoredIframeSessionId();
  if (iframeSessionId) params.set('iframeSessionId', iframeSessionId);
  return `${apiBase}/api/afas/oauth/start?${params.toString()}`;
}

export const logoutAfasOAuthSession = () =>
  api<{ ok: boolean }>('/api/afas/oauth/logout', {
    method: 'POST',
    body: JSON.stringify({ appSessionId: getOrCreateAppSessionId() }),
  });

export const exchangeIframeSession = (input: {
  tokenurl: string;
  code: string;
  publickey: string;
  sessionid: string;
}) =>
  api<{ ok: boolean; session: IframeSessionProfile }>('/api/iframe/exchange', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const fetchIframeSessionProfile = (sessionId: string) =>
  api<{ ok: boolean; session: IframeSessionProfile }>(`/api/iframe/session/${encodeURIComponent(sessionId)}`);

export const claimQuotationLock = (input: { projectId: string; quotationId: string; sessionId: string }) =>
  api<QuotationLockResponse>('/api/locks/claim', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const heartbeatQuotationLock = (input: { projectId: string; quotationId: string; sessionId: string }) =>
  api<QuotationLockResponse>('/api/locks/heartbeat', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const releaseQuotationLock = (input: { projectId: string; quotationId: string; sessionId: string }) =>
  api<QuotationLockResponse>('/api/locks/release', {
    method: 'POST',
    body: JSON.stringify(input),
  });
