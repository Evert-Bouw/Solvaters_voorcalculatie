import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import {
  AfasConfig,
  AfasEnvironmentType,
  AfasRequestAuth,
  callAfasRaw,
  createAfasProjectStage,
  createAfasQuotation,
  fetchAfasGetConnectorMetainfo,
  fetchAfasMetainfo,
  fetchConnectorRows,
  getAfasBaseUrl,
  getAfasConfig,
  getTokenPreview,
  normalizeTokenValue,
  probeAfas,
  sanitizeAfasEnvironmentType,
  updateAfasProjectStage,
  updateAfasQuotation,
} from './afas.js';
import { buildQuotationLineFieldMappings } from './quotationLineFieldMappings.js';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from './app/settings.js';
import { AppSettings as CoreShellAppSettings } from './app/types.js';
import { registerAppRoutes } from './app/routes/registerAppRoutes.js';
import { registerVoorcalculatieRoutes } from './app/routes/registerVoorcalculatieRoutes.js';
import { createAuthCore } from './core/auth/createAuthCore.js';
import { PARAM_ID_CATALOG } from './core/config/paramIdCatalog.js';
import { AppSettingsStore, createAppSettingsStore } from './core/stores/appStateStore.js';
import { registerCoreSettingsRoutes } from './core/routes/registerCoreSettingsRoutes.js';
import { registerAfasRoutes } from './core/routes/registerAfasRoutes.js';
import { registerOAuthRoutes } from './core/routes/registerOAuthRoutes.js';
import { registerIframeRoutes } from './core/routes/registerIframeRoutes.js';
import {
  buildAfasScopedSecretName,
  ensurePlaceholderSecret,
  getActiveEnvironmentNumberSecretName,
  getSecretValue,
  isKeyVaultConfigured,
  isPlaceholderSecretValue,
  listBootstrapSecretValues,
  setSecretValue,
} from './keyVault.js';
import { AfasOAuthSession, createOAuthStore, OAuthStore, PendingAfasOAuthState } from './oauthStore.js';
import type { CoreSettings as PersistableCoreSettings } from './core/types/index.js';
import {
  AfasWriteAuthMode,
  Creditor,
  Item,
  MarkupType,
  MarkupValueType,
  Project,
  ProjectStage,
  Quotation,
  QuotationLine,
  QuotationLineMutation,
  SaveQuotationLinesPayload,
  Settings,
  StageChargeMode,
} from './types/index.js';

const app = express();
const port = Number(process.env.PORT) || 3001;
let afasConfig = getAfasConfig();
const generatedSessionSecret = randomBytes(32).toString('hex');
const sessionSecret = process.env.SESSION_SECRET?.trim() || generatedSessionSecret;
const isProduction = process.env.NODE_ENV === 'production';
const cookieSameSite: true | false | 'lax' | 'strict' | 'none' = isProduction ? 'none' : 'lax';
const cookieSecure = isProduction ? true : 'auto';
const browserSessionCookieName = 'solvaters.appsid';
const iframeSessionCookieName = 'solvaters.iframesid';
const bootstrapUserCookieName = 'solvaters.bootstrapuid';
const legacyMarkupMap: Record<string, MarkupType> = {
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

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin ? corsOrigin.split(',').map((x) => x.trim()) : true,
  }),
);
app.use(express.json());
const allMarkups: MarkupType[] = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'];

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

let appSettings: Settings = structuredClone(defaultSettings);
let coreShellAppSettings: CoreShellAppSettings = normalizeAppSettings(DEFAULT_APP_SETTINGS);
const appSettingsScopeKey = process.env.APP_SETTINGS_SCOPE_KEY?.trim() || 'voorcalculatie';
let appSettingsStore: AppSettingsStore = createAppSettingsStore();

type IframeSessionProfile = {
  sessionId: string;
  userId: string;
  personCode?: string;
  employeeId?: string;
  environmentId?: string;
  displayName?: string;
  lastSeenAt: string;
  raw?: unknown;
};

type QuotationLock = {
  key: string;
  projectId: string;
  quotationId: string;
  ownerUserId: string;
  ownerDisplayName: string;
  ownerSessionId: string;
  acquiredAt: string;
  expiresAt: string;
};

type AfasUser = {
  userId: string;
  personId?: string;
  employeeId?: string;
  description?: string;
};

const iframeSessions = new Map<string, IframeSessionProfile>();
const iframeCodeToSessionId = new Map<string, string>();
const iframeExchangeInFlight = new Map<string, Promise<IframeSessionProfile>>();
const appSessionToIframeSessionId = new Map<string, string>();
const quotationLocks = new Map<string, QuotationLock>();
const afasUserCacheTtlMs = 5 * 60 * 1000;
let afasUsersCache = {
  expiresAt: 0,
  byUserId: new Map<string, AfasUser>(),
};
const defaultLockTtlSeconds = 180;
const maxLockTtlSeconds = 600;
const iframeTokenAllowedHostSuffixes = ['.afasinsite.nl', '.afas.online'];
const oauthStateTtlMs = 10 * 60 * 1000;
const afasAdminRoleCode = 'PR-001';
const userGroupsConnectorName = 'Profit_UserGroups';

type AfasOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope?: string;
};
type AfasRuntimeSecrets = {
  activeEnvironmentNumber?: string;
  publicKeySecrets: Record<string, string>;
  oauthClientId?: string;
  oauthClientSecret?: string;
  encryptionKey?: string;
  tableStorageConnectionString?: string;
  bootstrapAdminUserIds: string[];
};

let iframePublicKeySecrets = parsePublicKeySecrets(process.env.AFAS_PUBLICKEY_SECRETS);
let oauthStore: OAuthStore = createOAuthStore(oauthStateTtlMs);
let afasRuntimeSecrets: AfasRuntimeSecrets = {
  publicKeySecrets: iframePublicKeySecrets,
  bootstrapAdminUserIds: [],
};

const iframeSessionStore = {
  async getSession(sessionId: string) {
    return iframeSessions.get(sessionId);
  },
  async saveSession(session: IframeSessionProfile) {
    iframeSessions.set(session.sessionId, session);
  },
  async deleteSession(sessionId: string) {
    iframeSessions.delete(sessionId);
  },
  async getSessionIdByAppSession(appSessionId: string) {
    return appSessionToIframeSessionId.get(appSessionId);
  },
  async saveAppSessionBinding(appSessionId: string, sessionId: string) {
    appSessionToIframeSessionId.set(appSessionId, sessionId);
  },
  async deleteAppSessionBinding(appSessionId: string) {
    appSessionToIframeSessionId.delete(appSessionId);
  },
  async getSessionIdByCode(code: string) {
    return iframeCodeToSessionId.get(code);
  },
  async saveCodeMapping(code: string, sessionId: string) {
    iframeCodeToSessionId.set(code, sessionId);
  },
  async deleteCodeMapping(code: string) {
    iframeCodeToSessionId.delete(code);
  },
  async cleanupExpired(now: number) {
    for (const [sessionId, session] of iframeSessions.entries()) {
      const expiresAt = new Date(getIframeSessionExpiresAt(session.lastSeenAt)).getTime();
      if (expiresAt <= now) {
        iframeSessions.delete(sessionId);
      }
    }
    for (const [appSessionId, sessionId] of appSessionToIframeSessionId.entries()) {
      if (!iframeSessions.has(sessionId)) {
        appSessionToIframeSessionId.delete(appSessionId);
      }
    }
  },
};

function isDebugSessionFlowEnabled() {
  const rawValue = process.env.DEBUG_SESSION_FLOW?.trim().toLowerCase() || '';
  return rawValue === '1' || rawValue === 'true' || rawValue === 'yes' || rawValue === 'on';
}

function rebuildAuthCore() {
  return createAuthCore({
    coreSettingsRef: () => buildCoreSettingsResponse(normalizeSettings(appSettings)),
    afasConfigRef: () => afasConfig,
    oauthStore,
    iframeSessionStore,
    getRequestAppSessionId,
    peekRequestAppSessionId,
    peekRequestIframeSessionId: getRequestIframeSessionId,
    peekRequestBootstrapUserId: getBootstrapUserIdFromRequest,
    getIframeSessionExpiresAt,
    userGroupsConnectorName,
    afasAdminRoleCode,
    normalizeTokenValue,
    getAfasOAuthConfig: () => {
      const oauthConfig = getAfasOAuthConfig();
      return oauthConfig
        ? {
            clientId: oauthConfig.clientId,
            clientSecret: oauthConfig.clientSecret,
            redirectUri: oauthConfig.redirectUri,
            scope: oauthConfig.scope,
          }
        : undefined;
    },
    getAfasOAuthConfigState: async () => ({
      oauthClientIdConfigured: Boolean(afasRuntimeSecrets.oauthClientId?.trim() || process.env.AFAS_OAUTH_CLIENT_ID?.trim()),
      oauthClientSecretConfigured: Boolean(
        afasRuntimeSecrets.oauthClientSecret?.trim() || process.env.AFAS_OAUTH_CLIENT_SECRET?.trim(),
      ),
      keyVaultConfigured: isKeyVaultConfigured(),
    }),
    exchangeAfasOAuthToken,
    fetchConnectorRows: async (config, connector, options, auth) =>
      fetchConnectorRows(config as any, connector, options as any, auth),
    nowMs,
    iframeTokenAllowedHostSuffixes,
    getBootstrapAdminUserIds: () => afasRuntimeSecrets.bootstrapAdminUserIds,
    debugSessionFlow: isDebugSessionFlowEnabled(),
  });
}

let authCore = rebuildAuthCore();

function allowAllSettingsAccess(): express.RequestHandler {
  return (_req, _res, next) => next();
}

type AfasConnectionConfigResponse = {
  mode: 'afas';
  environmentId: string;
  environmentType: AfasEnvironmentType;
  hasToken: boolean;
  tokenPreview: string;
};

type AfasConnectionInput = {
  environmentId?: unknown;
  environmentType?: unknown;
  token?: unknown;
};

function buildAfasConnectionConfigResponse(config: AfasConfig): AfasConnectionConfigResponse {
  return {
    mode: config.mode,
    environmentId: config.environmentId ?? '',
    environmentType: config.environmentType,
    hasToken: Boolean(normalizeTokenValue(config.token)),
    tokenPreview: getTokenPreview(config.token),
  };
}

async function applyAfasConnectionInput(input: AfasConnectionInput) {
  const nextEnvironmentId = typeof input.environmentId === 'string' ? input.environmentId.trim() : afasConfig.environmentId;
  const nextEnvironmentType = sanitizeAfasEnvironmentType(typeof input.environmentType === 'string' ? input.environmentType : undefined);
  const incomingToken = typeof input.token === 'string' ? input.token.trim() : undefined;
  const nextToken = incomingToken ? normalizeTokenValue(incomingToken) : afasConfig.token;
  if (incomingToken && !nextToken) throw new Error('Classic token kon niet genormaliseerd worden.');
  if (!nextEnvironmentId) throw new Error('AFAS omgevings-ID ontbreekt.');
  if (!nextToken) throw new Error('Classic token ontbreekt.');

  await writeAfasBootstrapSecrets({
    environmentId: nextEnvironmentId,
    environmentType: nextEnvironmentType,
    token: nextToken,
  });

  afasConfig = {
    ...afasConfig,
    mode: 'afas',
    environmentId: nextEnvironmentId,
    environmentType: nextEnvironmentType,
    token: nextToken,
  };
  await refreshRuntimeSecretsFromKeyVault(nextEnvironmentId);
  appSettings = normalizeSettings({ ...appSettings, dataMode: 'afas' });
  return buildAfasConnectionConfigResponse(afasConfig);
}

function normalizeSettings(input: Partial<Settings>): Settings {
  const normalizeMarkupKey = (value: unknown): MarkupType | null => {
    if (typeof value !== 'string') return null;
    if (allMarkups.includes(value as MarkupType)) return value as MarkupType;
    return legacyMarkupMap[value] ?? null;
  };
  const inputOrder = Array.isArray(input.markupOrder) ? input.markupOrder : [];
  const seen = new Set<MarkupType>();
  const markupOrder: MarkupType[] = [];
  inputOrder.forEach((entry) => {
    const type = normalizeMarkupKey(entry);
    if (!type) return;
    if (seen.has(type)) return;
    seen.add(type);
    markupOrder.push(type);
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

  const lineValueTypes = { ...defaultSettings.lineMarkupValueTypes, ...(input.lineMarkupValueTypes ?? (input as unknown as { markupValueTypes?: Settings['lineMarkupValueTypes'] }).markupValueTypes ?? {}) };
  const lineBases = { ...defaultSettings.lineMarkupBases, ...(input.lineMarkupBases ?? (input as unknown as { markupBases?: Settings['lineMarkupBases'] }).markupBases ?? {}) };
  const phaseValueTypes = { ...defaultSettings.phaseMarkupValueTypes, ...(input.phaseMarkupValueTypes ?? (input as unknown as { markupValueTypes?: Settings['phaseMarkupValueTypes'] }).markupValueTypes ?? {}) };
  const phaseBases = { ...defaultSettings.phaseMarkupBases, ...(input.phaseMarkupBases ?? (input as unknown as { markupBases?: Settings['phaseMarkupBases'] }).markupBases ?? {}) };
  (Object.keys(phaseBases) as MarkupType[]).forEach((type) => {
    if (phaseBases[type] === 'quantity') phaseBases[type] = 'cost';
  });
  (Object.keys(lineValueTypes) as MarkupType[]).forEach((type) => {
    const basis = lineBases[type];
    const valueType = lineValueTypes[type];
    const isValidForQuantity = basis === 'quantity' && (valueType === 'percentage' || valueType === 'quantity');
    const isValidForMoney = basis !== 'quantity' && (valueType === 'percentage' || valueType === 'amount');
    if (!(isValidForQuantity || isValidForMoney)) lineValueTypes[type] = 'percentage' as MarkupValueType;
  });
  (Object.keys(phaseValueTypes) as MarkupType[]).forEach((type) => {
    const basis = phaseBases[type];
    const valueType = phaseValueTypes[type];
    const isValidForQuantity = basis === 'quantity' && (valueType === 'percentage' || valueType === 'quantity');
    const isValidForMoney = basis !== 'quantity' && (valueType === 'percentage' || valueType === 'amount');
    if (!(isValidForQuantity || isValidForMoney)) phaseValueTypes[type] = 'percentage' as MarkupValueType;
  });

  const descriptions = { ...defaultSettings.phaseMarkupDescriptions, ...(input.phaseMarkupDescriptions ?? {}) };
  const legacyToUniversal: Array<[MarkupType, string[], string]> = [
    ['M4', ['Vrij aantal opslag'], 'Vrije opslag kolom 1'],
    ['M5', ['Vrij aantal opslag'], 'Vrije opslag kolom 2'],
    ['M6', ['Vrij aantal opslag'], 'Vrije opslag kolom 3'],
  ];
  legacyToUniversal.forEach(([type, legacyValues, replacement]) => {
    if (legacyValues.includes((descriptions[type] ?? '').trim())) descriptions[type] = replacement;
  });
  const maxMarkups = 10;
  const lineMarkupCount = Number.isFinite(Number(input.lineMarkupCount)) ? Math.max(0, Math.min(maxMarkups, Number(input.lineMarkupCount))) : defaultSettings.lineMarkupCount;
  const phaseMarkupCount = Number.isFinite(Number(input.phaseMarkupCount)) ? Math.max(0, Math.min(maxMarkups, Number(input.phaseMarkupCount))) : defaultSettings.phaseMarkupCount;

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
    lineMarkupBases: lineBases,
    lineMarkupValueTypes: lineValueTypes,
    phaseMarkupBases: phaseBases,
    phaseMarkupValueTypes: phaseValueTypes,
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

type CoreSettingsPayload = {
  dataMode: 'afas';
  writeAuthMode: AfasWriteAuthMode;
  contextEntity: {
    key: string;
    label: string;
    paramId: string;
    connectorName: string;
    idField: string;
    nameField: string;
    queryParamName: string;
  };
  uiThemeMode: Settings['uiThemeMode'];
  uiColors: Settings['uiColors'];
};

function buildCoreSettingsResponse(settings: Settings): CoreSettingsPayload {
  return {
    dataMode: 'afas',
    writeAuthMode: settings.writeAuthMode,
    contextEntity: {
      key: 'project',
      label: 'Project',
      paramId: 'PrId',
      connectorName: afasConfig.connectors.projects || '',
      idField: afasConfig.fields.project.id || '',
      nameField: afasConfig.fields.project.name || '',
      queryParamName: 'PrId',
    },
    uiThemeMode: settings.uiThemeMode,
    uiColors: settings.uiColors,
  };
}

function applyCoreSettingsPayload(input: CoreSettingsPayload) {
  appSettings = normalizeSettings({
    ...appSettings,
    dataMode: 'afas',
    writeAuthMode: input.writeAuthMode === 'oauth_user' ? 'oauth_user' : 'classic',
    uiThemeMode:
      input.uiThemeMode === 'standard_dark' || input.uiThemeMode === 'custom' ? input.uiThemeMode : 'standard',
    uiColors: {
      ...appSettings.uiColors,
      ...(input.uiColors ?? {}),
    },
  });
  return buildCoreSettingsResponse(appSettings);
}

async function loadCoreSettings() {
  const stored = await appSettingsStore.getCoreSettings(appSettingsScopeKey);
  if (stored) {
    applyCoreSettingsPayload(stored as unknown as CoreSettingsPayload);
  }
  return buildCoreSettingsResponse(appSettings);
}

async function persistCoreSettings(nextSettings: CoreSettingsPayload) {
  const result = applyCoreSettingsPayload(nextSettings);
  await appSettingsStore.saveCoreSettings(appSettingsScopeKey, result as unknown as PersistableCoreSettings);
  return result;
}

async function loadAppOnlySettings() {
  const stored = await appSettingsStore.getAppSettings(appSettingsScopeKey);
  if (stored) {
    coreShellAppSettings = normalizeAppSettings(stored);
  }
  return coreShellAppSettings;
}

async function persistAppOnlySettings(nextSettings: CoreShellAppSettings) {
  coreShellAppSettings = normalizeAppSettings(nextSettings);
  await appSettingsStore.saveAppSettings(appSettingsScopeKey, coreShellAppSettings);
  return coreShellAppSettings;
}

async function cleanupExpiredIframeState() {
  await iframeSessionStore.cleanupExpired(nowMs());
}

async function buildAfasUserDebugStatus(req: express.Request) {
  return authCore.buildAfasUserDebugStatus(req);
}

async function fetchContextRecord(recordId: string) {
  return {
    id: recordId,
    name: recordId,
    entityKey: 'project',
    entityLabel: 'Project',
  };
}

async function getAfasRequestAuthForRequest(req: express.Request, options?: { allowOAuthWithoutIframe?: boolean }) {
  return authCore.getAfasRequestAuthForRequest(req, options);
}

function parsePublicKeySecrets(raw?: string): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [key.trim(), typeof value === 'string' ? value.trim() : ''])
        .filter(([key, value]) => key.length > 0 && value.length > 0),
    );
  } catch {
    return {};
  }
}

function parseBootstrapAdminUserIds(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(
    raw
      .split(/[\r\n,;]+/)
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => value.toLowerCase()),
  )];
}

function resetRuntimeSecretsFromEnvironment() {
  iframePublicKeySecrets = parsePublicKeySecrets(process.env.AFAS_PUBLICKEY_SECRETS);
  afasRuntimeSecrets = {
    activeEnvironmentNumber: afasConfig.environmentId,
    publicKeySecrets: iframePublicKeySecrets,
    oauthClientId: process.env.AFAS_OAUTH_CLIENT_ID?.trim() || undefined,
    oauthClientSecret: process.env.AFAS_OAUTH_CLIENT_SECRET?.trim() || undefined,
    encryptionKey: process.env.AFAS_ENCRYPTION_KEY?.trim() || undefined,
    tableStorageConnectionString: process.env.AZURE_TABLE_STORAGE_CONNECTION_STRING?.trim() || undefined,
    bootstrapAdminUserIds: parseBootstrapAdminUserIds(process.env.BOOTSTRAP_ADMIN_USER_IDS),
  };
  oauthStore = createOAuthStore(oauthStateTtlMs, {
    connectionString: afasRuntimeSecrets.tableStorageConnectionString,
    encryptionKey: afasRuntimeSecrets.encryptionKey,
  });
  appSettingsStore = createAppSettingsStore({
    connectionString: afasRuntimeSecrets.tableStorageConnectionString,
  });
  authCore = rebuildAuthCore();
}

async function refreshRuntimeSecretsFromKeyVault(environmentNumber?: string) {
  if (!isKeyVaultConfigured()) {
    resetRuntimeSecretsFromEnvironment();
    return;
  }
  const envNumber = environmentNumber?.trim() || afasConfig.environmentId?.trim() || '';
  if (!envNumber) {
    resetRuntimeSecretsFromEnvironment();
    return;
  }
  const values = await listBootstrapSecretValues(envNumber);
  iframePublicKeySecrets = parsePublicKeySecrets(values['publickey-secrets']);
  afasRuntimeSecrets = {
    activeEnvironmentNumber: envNumber,
    publicKeySecrets: iframePublicKeySecrets,
    oauthClientId: values['oauth-client-id'],
    oauthClientSecret: values['oauth-client-secret'],
    encryptionKey: values['encryption-key'],
    tableStorageConnectionString: values['azure-table-storage-connection-string'],
    bootstrapAdminUserIds: parseBootstrapAdminUserIds(values['bootstrap-admin-user-ids']),
  };
  oauthStore = createOAuthStore(oauthStateTtlMs, {
    connectionString: afasRuntimeSecrets.tableStorageConnectionString,
    encryptionKey: afasRuntimeSecrets.encryptionKey,
  });
  appSettingsStore = createAppSettingsStore({
    connectionString: afasRuntimeSecrets.tableStorageConnectionString,
  });
  authCore = rebuildAuthCore();
}

async function loadAfasConfigFromKeyVault() {
  if (!isKeyVaultConfigured()) return;
  const activeEnvironmentNumber = await getSecretValue(getActiveEnvironmentNumberSecretName());
  if (!activeEnvironmentNumber || isPlaceholderSecretValue(activeEnvironmentNumber)) return;
  const values = await listBootstrapSecretValues(activeEnvironmentNumber);
  const environmentId = values['environment-id']?.trim();
  const environmentType = sanitizeAfasEnvironmentType(values['environment-type']);
  const token = values.token?.trim();
  if (!environmentId || !token) return;
  afasConfig = {
    ...afasConfig,
    environmentId,
    environmentType,
    token,
  };
  await refreshRuntimeSecretsFromKeyVault(activeEnvironmentNumber);
}

async function writeAfasBootstrapSecrets(input: { environmentId: string; environmentType: AfasEnvironmentType; token: string }) {
  if (!isKeyVaultConfigured()) return;
  const environmentNumber = input.environmentId.trim();
  const tags = {
    app: process.env.AFAS_SECRET_APP_NAME?.trim() || 'afas-app',
    environmentNumber,
    source: 'settings-bootstrap',
  };
  await setSecretValue(getActiveEnvironmentNumberSecretName(), environmentNumber, tags);
  await setSecretValue(buildAfasScopedSecretName(environmentNumber, 'environment-id'), environmentNumber, tags);
  await setSecretValue(buildAfasScopedSecretName(environmentNumber, 'environment-type'), input.environmentType, tags);
  await setSecretValue(buildAfasScopedSecretName(environmentNumber, 'token'), input.token, tags);

  const placeholderSuffixes = [
    'publickey-secrets',
    'oauth-client-id',
    'oauth-client-secret',
    'encryption-key',
    'azure-table-storage-connection-string',
  ];
  for (const suffix of placeholderSuffixes) {
    await ensurePlaceholderSecret(buildAfasScopedSecretName(environmentNumber, suffix), tags);
  }
}

function getAfasOAuthConfig(): AfasOAuthConfig | null {
  const clientId = afasRuntimeSecrets.oauthClientId?.trim() || process.env.AFAS_OAUTH_CLIENT_ID?.trim() || '';
  const clientSecret = afasRuntimeSecrets.oauthClientSecret?.trim() || process.env.AFAS_OAUTH_CLIENT_SECRET?.trim() || '';
  const redirectUri = process.env.AFAS_OAUTH_REDIRECT_URI?.trim() || '';
  const scope = process.env.AFAS_OAUTH_SCOPE?.trim() || undefined;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri, scope };
}

async function cleanupExpiredOAuthStates() {
  await oauthStore.cleanupExpiredPendingStates(nowMs());
}

function createOAuthStateValue() {
  return `${nowMs().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function toBase64Url(buffer: Buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createPkceCodeVerifier() {
  return toBase64Url(randomBytes(32));
}

function createPkceCodeChallenge(codeVerifier: string) {
  return toBase64Url(createHash('sha256').update(codeVerifier, 'utf8').digest());
}

function getAfasOAuthAuthorizeUrl(config: AfasConfig) {
  return `${getAfasBaseUrl(config)}/oauth/authorize`;
}

function getAfasOAuthTokenUrl(config: AfasConfig) {
  return `${getAfasBaseUrl(config)}/oauth/token`;
}

function isAllowedIframeTokenUrl(tokenurl: string) {
  return authCore.isAllowedIframeTokenUrl(tokenurl);
}

function readNestedStringByKey(payload: unknown, targetKey: string): string | undefined {
  const target = targetKey.toLowerCase();
  function walk(node: unknown): string | undefined {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) {
      for (const entry of node) {
        const found = walk(entry);
        if (found) return found;
      }
      return undefined;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key.toLowerCase() === target && value !== null && value !== undefined) {
        const text = String(value).trim();
        if (text) return text;
      }
      if (typeof value === 'object') {
        const found = walk(value);
        if (found) return found;
      }
    }
    return undefined;
  }
  return walk(payload);
}

function pickIframeSessionProfile(payload: unknown, fallbackSessionId: string): IframeSessionProfile {
  return authCore.pickIframeSessionProfile(payload, fallbackSessionId);
}

function mapAfasUser(row: Record<string, unknown>): AfasUser {
  return {
    userId: readString(row, afasConfig.fields.user.id) ?? '',
    personId: readString(row, afasConfig.fields.user.personId),
    employeeId: readString(row, afasConfig.fields.user.employeeId),
    description: readString(row, afasConfig.fields.user.name),
  };
}

async function fetchAfasUsersByUserId() {
  const now = nowMs();
  if (afasUsersCache.expiresAt > now && afasUsersCache.byUserId.size) return afasUsersCache.byUserId;
  try {
    const rows = await fetchConnectorRows(afasConfig, ensureConnector('users'));
    const byUserId = new Map(
      rows
        .map(mapAfasUser)
        .filter((user) => user.userId)
        .map((user) => [user.userId, user] as const),
    );
    afasUsersCache = {
      expiresAt: now + afasUserCacheTtlMs,
      byUserId,
    };
    return byUserId;
  } catch {
    return afasUsersCache.byUserId;
  }
}

async function resolveAfasUserDisplayName(userId?: string) {
  const normalizedUserId = userId?.trim();
  if (!normalizedUserId) return undefined;
  const byUserId = await fetchAfasUsersByUserId();
  return byUserId.get(normalizedUserId)?.description?.trim() || undefined;
}

async function enrichIframeSessionProfile(profile: IframeSessionProfile) {
  const resolvedDisplayName = await resolveAfasUserDisplayName(profile.userId);
  return {
    ...profile,
    displayName: resolvedDisplayName || profile.displayName || profile.employeeId || profile.personCode || profile.userId,
  };
}

function lockKey(projectId: string, quotationId: string) {
  return `${projectId}\u0000${quotationId}`;
}

function nowMs() {
  return Date.now();
}

function getCookieMaxAgeMs() {
  return 1000 * 60 * 60 * 8;
}

function parseCookieHeader(cookieHeader?: string) {
  if (!cookieHeader?.trim()) return {};
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((entry) => {
        const index = entry.indexOf('=');
        if (index < 0) return [entry.trim(), ''];
        const key = entry.slice(0, index).trim();
        const rawValue = entry.slice(index + 1).trim();
        try {
          return [key, decodeURIComponent(rawValue)];
        } catch {
          return [key, rawValue];
        }
      })
      .filter(([key]) => key),
  );
}

function signBrowserSessionValue(value: string) {
  return createHmac('sha256', sessionSecret).update(value, 'utf8').digest('base64url');
}

function serializeCookie(name: string, value: string, options?: { maxAgeMs?: number }) {
  const segments = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly'];
  if (cookieSameSite) {
    const sameSiteValue = cookieSameSite === true ? 'Strict' : String(cookieSameSite);
    segments.push(`SameSite=${sameSiteValue.charAt(0).toUpperCase()}${sameSiteValue.slice(1)}`);
  }
  if (cookieSecure === true || cookieSecure === 'auto') {
    segments.push('Secure');
  }
  if (typeof options?.maxAgeMs === 'number') {
    const maxAgeSeconds = Math.max(0, Math.floor(options.maxAgeMs / 1000));
    segments.push(`Max-Age=${maxAgeSeconds}`);
    if (maxAgeSeconds === 0) {
      segments.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    }
  }
  return segments.join('; ');
}

function parseSignedBrowserSessionId(rawValue?: string) {
  const trimmed = rawValue?.trim();
  if (!trimmed) return undefined;
  const separatorIndex = trimmed.lastIndexOf('.');
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) return undefined;
  const sessionId = trimmed.slice(0, separatorIndex);
  const signature = trimmed.slice(separatorIndex + 1);
  const expectedSignature = signBrowserSessionValue(sessionId);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) return undefined;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return undefined;
  return sessionId;
}

function getBrowserSessionIdFromRequest(req: express.Request) {
  const cookies = parseCookieHeader(req.header('cookie'));
  return parseSignedBrowserSessionId(cookies[browserSessionCookieName]);
}

function getBootstrapUserIdFromRequest(req: express.Request) {
  const cookies = parseCookieHeader(req.header('cookie'));
  return parseSignedBrowserSessionId(cookies[bootstrapUserCookieName]);
}

function setBrowserSessionCookie(res: express.Response, sessionId: string) {
  const signedValue = `${sessionId}.${signBrowserSessionValue(sessionId)}`;
  res.append('Set-Cookie', serializeCookie(browserSessionCookieName, signedValue, { maxAgeMs: getCookieMaxAgeMs() }));
}

function setIframeSessionCookie(res: express.Response, sessionId: string) {
  const signedValue = `${sessionId}.${signBrowserSessionValue(sessionId)}`;
  res.append('Set-Cookie', serializeCookie(iframeSessionCookieName, signedValue, { maxAgeMs: getCookieMaxAgeMs() }));
}

function setBootstrapUserCookie(res: express.Response, userId: string) {
  const signedValue = `${userId}.${signBrowserSessionValue(userId)}`;
  res.append('Set-Cookie', serializeCookie(bootstrapUserCookieName, signedValue, { maxAgeMs: getCookieMaxAgeMs() }));
}

function clearBrowserSessionCookie(res: express.Response) {
  res.append('Set-Cookie', serializeCookie(browserSessionCookieName, '', { maxAgeMs: 0 }));
}

function clearIframeSessionCookie(res: express.Response) {
  res.append('Set-Cookie', serializeCookie(iframeSessionCookieName, '', { maxAgeMs: 0 }));
}

function clearBootstrapUserCookie(res: express.Response) {
  res.append('Set-Cookie', serializeCookie(bootstrapUserCookieName, '', { maxAgeMs: 0 }));
}

function getIframeSessionExpiresAt(lastSeenAtIso: string) {
  return new Date(new Date(lastSeenAtIso).getTime() + 8 * 60 * 60 * 1000).toISOString();
}

function getAppSessionIdFromRequest(req: express.Request) {
  const fromHeader = req.header('x-app-session-id')?.trim();
  if (fromHeader) return fromHeader;
  const fromQuery = typeof req.query.appSessionId === 'string' ? req.query.appSessionId.trim() : '';
  if (fromQuery) return fromQuery;
  const fromBody = typeof req.body?.appSessionId === 'string' ? req.body.appSessionId.trim() : '';
  return fromBody;
}

function isValidAppSessionId(value?: string) {
  const trimmed = value?.trim() || '';
  if (!trimmed) return false;
  return /^[A-Za-z0-9._:-]{16,128}$/.test(trimmed);
}

function getRequestAppSessionId(req: express.Request, res?: express.Response) {
  const requestState = getRequestState(req);
  if (requestState.browserSessionId) {
    if (res) setBrowserSessionCookie(res, requestState.browserSessionId);
    return requestState.browserSessionId;
  }

  const explicitSessionId = getAppSessionIdFromRequest(req);
  if (isValidAppSessionId(explicitSessionId)) {
    requestState.browserSessionId = explicitSessionId;
    if (res) setBrowserSessionCookie(res, explicitSessionId);
    return explicitSessionId;
  }

  const existing = getBrowserSessionIdFromRequest(req);
  if (existing) {
    requestState.browserSessionId = existing;
    if (res) setBrowserSessionCookie(res, existing);
    return existing;
  }

  const nextSessionId = randomUUID();
  requestState.browserSessionId = nextSessionId;
  if (res) setBrowserSessionCookie(res, nextSessionId);
  return nextSessionId;
}

function getRequestIframeSessionId(req: express.Request) {
  const headerValue = req.header('x-iframe-session-id')?.trim();
  if (headerValue) return headerValue;
  const queryValue = typeof req.query.iframeSessionId === 'string' ? req.query.iframeSessionId.trim() : '';
  if (queryValue) return queryValue;
  const bodyValue = typeof req.body?.iframeSessionId === 'string' ? req.body.iframeSessionId.trim() : '';
  if (bodyValue) return bodyValue;
  const cookies = parseCookieHeader(req.header('cookie'));
  return parseSignedBrowserSessionId(cookies[iframeSessionCookieName]) || '';
}

function getRequestState(req: express.Request) {
  return req as express.Request & { browserSessionId?: string };
}

function peekRequestAppSessionId(req: express.Request) {
  const requestState = getRequestState(req);
  if (requestState.browserSessionId) return requestState.browserSessionId;
  const explicitSessionId = getAppSessionIdFromRequest(req);
  if (isValidAppSessionId(explicitSessionId)) return explicitSessionId;
  return getBrowserSessionIdFromRequest(req) || '';
}

function getRequestOrigin(req: express.Request) {
  const origin = req.header('origin')?.trim();
  if (origin) return origin;
  const referer = req.header('referer')?.trim();
  if (!referer) return '';
  try {
    return new URL(referer).origin;
  } catch {
    return '';
  }
}

function getEmbedOriginFromRequest(req: express.Request) {
  const headerValue = req.header('x-embed-origin')?.trim();
  if (headerValue) return headerValue;
  const queryValue = typeof req.query.embedOrigin === 'string' ? req.query.embedOrigin.trim() : '';
  if (queryValue) return queryValue;
  const bodyValue = typeof req.body?.embedOrigin === 'string' ? req.body.embedOrigin.trim() : '';
  return bodyValue || '';
}

function isAllowedBrowserOrigin(_origin: string) {
  return true;
}

function isAllowedAfasEmbedOrigin(origin: string) {
  if (!origin.trim()) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function requireTrustedBrowserContext(_options?: { requireEmbedOrigin?: boolean }) {
  return (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
}

function disableSensitiveCaching(_req: express.Request, res: express.Response, next: express.NextFunction) {
  return authCore.disableSensitiveCaching(_req, res, next);
}

function paramText(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return (typeof value[0] === 'string' ? value[0] : '').trim();
  return '';
}

function getAfasAuthMode(settings: Settings): AfasWriteAuthMode {
  return settings.writeAuthMode === 'oauth_user' ? 'oauth_user' : 'classic';
}

async function buildAfasWriteAuthStatus(req: express.Request) {
  return authCore.buildAfasWriteAuthStatus(req);
}

async function buildBootstrapStatus(req: express.Request) {
  return authCore.buildBootstrapStatus(req);
}

async function exchangeAfasOAuthToken(formPayload: URLSearchParams) {
  const oauthConfig = getAfasOAuthConfig();
  if (!oauthConfig) throw new Error('AFAS OAuth is niet volledig geconfigureerd.');
  const response = await fetch(getAfasOAuthTokenUrl(afasConfig), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: formPayload.toString(),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`AFAS OAuth token request failed (${response.status}): ${responseText || response.statusText}`);
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
  } catch {
    throw new Error('AFAS OAuth token response is geen geldige JSON.');
  }
  const accessToken = String(payload.access_token ?? '').trim();
  if (!accessToken) throw new Error('AFAS OAuth response bevat geen access_token.');
  const tokenType = String(payload.token_type ?? 'Bearer').trim() || 'Bearer';
  const refreshToken = String(payload.refresh_token ?? '').trim() || undefined;
  const expiresInRaw = Number(payload.expires_in);
  const expiresInSeconds = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : 3600;
  return {
    accessToken,
    refreshToken,
    tokenType,
    scope: String(payload.scope ?? '').trim() || undefined,
    accessTokenExpiresAt: new Date(nowMs() + expiresInSeconds * 1000).toISOString(),
  };
}

async function ensureAfasOAuthAccessToken(appSessionId: string) {
  const oauthConfig = getAfasOAuthConfig();
  if (!oauthConfig) throw new Error('AFAS OAuth is niet volledig geconfigureerd.');
  const session = await oauthStore.getSession(appSessionId);
  if (!session) throw new Error('Geen AFAS OAuth-sessie gevonden voor deze browser. Meld je opnieuw aan in AFAS.');
  const expiresAtMs = new Date(session.accessTokenExpiresAt).getTime();
  if (Number.isFinite(expiresAtMs) && expiresAtMs - nowMs() > 60_000) return session;
  if (!session.refreshToken) {
    throw new Error('AFAS OAuth-sessie kan niet worden ververst. Meld je opnieuw aan in AFAS.');
  }
  const formPayload = new URLSearchParams();
  formPayload.set('grant_type', 'refresh_token');
  formPayload.set('refresh_token', session.refreshToken);
  formPayload.set('client_id', oauthConfig.clientId);
  formPayload.set('client_secret', oauthConfig.clientSecret);
  const refreshed = await exchangeAfasOAuthToken(formPayload);
  const nextSession: AfasOAuthSession = {
    ...session,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? session.refreshToken,
    tokenType: refreshed.tokenType,
    scope: refreshed.scope ?? session.scope,
    accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
    updatedAt: new Date().toISOString(),
  };
  await oauthStore.saveSession(nextSession);
  return nextSession;
}

async function resolveAfasAuth(req: express.Request): Promise<AfasRequestAuth> {
  const mode = getAfasAuthMode(normalizeSettings(appSettings));
  if (mode === 'classic') return { type: 'classic' };
  const oauthConfig = getAfasOAuthConfig();
  if (!oauthConfig) {
    throw new Error('OAuth is ingesteld, maar de backend mist AFAS_OAUTH_CLIENT_ID, AFAS_OAUTH_CLIENT_SECRET of AFAS_OAUTH_REDIRECT_URI.');
  }
  const appSessionId = getRequestAppSessionId(req);
  if (!appSessionId) {
    throw new Error('OAuth vereist een app-sessie. Laad de app opnieuw en meld je aan via AFAS.');
  }
  const session = await ensureAfasOAuthAccessToken(appSessionId);
  return {
    type: 'oauth_bearer',
    accessToken: session.accessToken,
  };
}

function renderOAuthCallbackHtml(payload: { ok: boolean; message: string; appSessionId?: string; targetOrigin?: string }) {
  const escapedMessage = payload.message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const targetOrigin = payload.targetOrigin?.trim() || '*';
  const serialized = JSON.stringify({ type: 'afas-oauth-complete', ok: payload.ok, message: payload.message, appSessionId: payload.appSessionId });
  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <title>AFAS OAuth</title>
  </head>
  <body style="font-family: Arial, sans-serif; padding: 16px;">
    <p>${escapedMessage}</p>
    <script nonce="__CSP_NONCE__">
      (function () {
        var payload = ${serialized};
        var targetOrigin = ${JSON.stringify(targetOrigin)};
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, targetOrigin);
          }
        } catch (error) {}
        window.setTimeout(function () { window.close(); }, 150);
      })();
    </script>
  </body>
</html>`;
}

function cleanupExpiredLocks() {
  const now = nowMs();
  [...quotationLocks.entries()].forEach(([key, lock]) => {
    if (new Date(lock.expiresAt).getTime() <= now) quotationLocks.delete(key);
  });
}

function toLockResponse(lock: QuotationLock) {
  return {
    projectId: lock.projectId,
    quotationId: lock.quotationId,
    ownerUserId: lock.ownerUserId,
    ownerDisplayName: lock.ownerDisplayName,
    ownerSessionId: lock.ownerSessionId,
    acquiredAt: lock.acquiredAt,
    expiresAt: lock.expiresAt,
  };
}

function toIframeSessionResponse(session: IframeSessionProfile) {
  return authCore.toIframeSessionResponse(session);
}

async function getCurrentIframeSession(req: express.Request, options?: { touch?: boolean }) {
  return authCore.getCurrentIframeSession(req, options);
}

async function getAfasUserByIframeSession(req: express.Request) {
  return authCore.getAfasUserByIframeSession(req);
}

async function userHasAfasAdminRole(userId: string, auth: AfasRequestAuth = { type: 'classic' }) {
  return authCore.userHasAfasAdminRole(userId, auth);
}

function requireKnownAfasUser() {
  return authCore.requireKnownAfasUser();
}

function requireIframeSession() {
  return authCore.requireIframeSession();
}

function requireSettingsAccess() {
  return authCore.requireSettingsAccess();
}

function requireAfasAdmin() {
  return authCore.requireAfasAdmin();
}

function resolveLockTtlSeconds(raw: unknown) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultLockTtlSeconds;
  return Math.max(30, Math.min(maxLockTtlSeconds, Math.floor(parsed)));
}

function sanitizeNumber(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function sanitizeStageChargeMode(value: unknown): StageChargeMode {
  return value === '1' || value === '2' ? value : '0';
}

function readString(row: Record<string, unknown>, fieldName?: string) {
  if (!fieldName) return undefined;
  const value = row[fieldName];
  if (value === undefined || value === null) return undefined;
  return String(value).trim() || undefined;
}

function readFirstString(row: Record<string, unknown>, fieldNames: Array<string | undefined>) {
  for (const fieldName of fieldNames) {
    const value = readString(row, fieldName);
    if (value) return value;
  }
  return undefined;
}

function readFirstNumber(row: Record<string, unknown>, fieldNames: Array<string | undefined>) {
  for (const fieldName of fieldNames) {
    const value = readNumber(row, fieldName);
    if (value !== 0) return value;
  }
  return 0;
}

function readNumber(row: Record<string, unknown>, fieldName?: string) {
  if (!fieldName) return 0;
  return sanitizeNumber(row[fieldName]);
}

function readBoolean(row: Record<string, unknown>, fieldName?: string) {
  if (!fieldName) return false;
  const value = row[fieldName];
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'ja' || normalized === 'yes';
}

function readRequiredBoolean(row: Record<string, unknown>, fieldName: string, fieldLabel: string) {
  const value = row[fieldName];
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'ja' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'nee' || normalized === 'no') return false;
  throw new Error(`Veld ${fieldLabel} (${fieldName}) bevat geen geldige boolean-waarde.`);
}

function readFirstBoolean(row: Record<string, unknown>, fieldNames: Array<string | undefined>) {
  for (const fieldName of fieldNames) {
    if (!fieldName) continue;
    const value = row[fieldName];
    if (value === undefined || value === null || String(value).trim() === '') continue;
    return readRequiredBoolean(row, fieldName, fieldName);
  }
  return undefined;
}

function normalizeProjectId(value?: string) {
  return value?.trim() ?? '';
}

function isExactProjectIdMatch(candidate: string | undefined, expected: string) {
  return normalizeProjectId(candidate) === normalizeProjectId(expected);
}

function ensureConnector(name: keyof typeof afasConfig.connectors) {
  const connector = afasConfig.connectors[name];
  if (!connector) throw new Error(`Connector voor ${name} ontbreekt in de backend .env.`);
  return connector;
}

function ensureProjectFieldMapping() {
  if (!afasConfig.fields.project.id || !afasConfig.fields.project.name) {
    throw new Error('Projectveld-mapping ontbreekt. Vul AFAS_FIELD_PROJECT_ID en AFAS_FIELD_PROJECT_NAME in.');
  }
}

function mapAfasProject(row: Record<string, unknown>): Project {
  return {
    id: readString(row, afasConfig.fields.project.id) ?? '',
    name: readString(row, afasConfig.fields.project.name) ?? '',
    projectMarkups: {},
  };
}

function mapAfasStage(row: Record<string, unknown>): ProjectStage {
  return {
    id: readString(row, afasConfig.fields.stage.id) ?? '',
    projectId: readString(row, afasConfig.fields.stage.projectId) ?? '',
    code: readString(row, afasConfig.fields.stage.code) ?? '',
    name: readString(row, afasConfig.fields.stage.name) ?? '',
    order: readNumber(row, afasConfig.fields.stage.order),
    chargeMode: '0',
    phaseMarkups: {},
  };
}

function mapAfasQuotation(row: Record<string, unknown>): Quotation {
  const quotationId = readString(row, afasConfig.fields.quotation.id) ?? readString(row, afasConfig.fields.quotation.number) ?? '';
  const quotationName = readString(row, afasConfig.fields.quotation.name) ?? quotationId;
  return {
    id: quotationId,
    projectId: readString(row, afasConfig.fields.quotation.projectId) ?? '',
    number: readString(row, afasConfig.fields.quotation.number) ?? quotationId,
    name: quotationName,
    order: readNumber(row, afasConfig.fields.quotation.order),
  };
}

function buildAppQuotationLineId(parts: {
  projectId: string;
  quotationId: string;
  stageId: string;
  rawLineId: string;
  itemCode: string;
}) {
  return [parts.projectId, parts.quotationId, parts.stageId, parts.rawLineId, parts.itemCode].join(':');
}

function parseRawLineIdFromAppId(lineId?: string) {
  if (!lineId) return undefined;
  const parts = lineId.split(':');
  if (parts.length >= 4) return parts[3]?.trim() || undefined;
  return lineId.trim() || undefined;
}

function isProbablyAfasGuid(value?: string) {
  if (!value) return false;
  return /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$/i.test(value.trim());
}

function resolveAfasQuotationLineOrder(
  row: Record<string, unknown>,
  configuredOrderFieldId?: string,
) {
  const configured = readNumber(row, configuredOrderFieldId);
  if (configured > 0) return configured;
  const order = readNumber(row, 'order');
  if (order > 0) return order;
  const configuredDefault = readNumber(row, afasConfig.fields.line.order);
  if (configuredDefault > 0) return configuredDefault;
  return readNumber(row, 'SeqNo');
}

function hasAfasQuotationLineLineNo(row: Record<string, unknown>) {
  return readNumber(row, 'order') > 0;
}

const quotationLineGetFieldAliases: Partial<Record<string, string[]>> = {
  'QL-ORDER': ['order'],
  'QL-SUPPLIER_ID': ['supplierId'],
  'QL-PURCHASE_ENABLED': ['purchaseEnabled'],
  'QL-QTY_BASE': ['baseQty'],
  'QL-UNIT_COST_BASE': ['unitCost'],
  'QL-PURCHASE_PRICE': ['purchasePrice'],
  'QL-UNIT_PRICE_BASE': ['unitPrice'],
  'QL-QTY_FORMULA_MEMO': ['qtyFormulaMemo'],
  'QL-COST_FORMULA_MEMO': ['costFormulaMemo'],
  'QL-MARKUP_FORMULA_MEMO': ['markupFormulaMemo'],
};

function getConfiguredReadCandidates(configurableFieldMap: Map<string, string> | undefined, appFieldId: string, ...fallbacks: Array<string | undefined>) {
  return [
    configurableFieldMap?.get(appFieldId),
    ...(quotationLineGetFieldAliases[appFieldId] ?? []),
    ...fallbacks,
  ];
}

function mapAfasQuotationLine(
  row: Record<string, unknown>,
  configurableFieldMap?: Map<string, string>,
): QuotationLine {
  const projectId = readString(row, afasConfig.fields.line.projectId) ?? '';
  const quotationId = readString(row, afasConfig.fields.line.quotationId) ?? '';
  const stageId = readString(row, afasConfig.fields.line.stageId) ?? 'NO_STAGE';
  const configuredOrderFieldId = configurableFieldMap?.get('QL-ORDER');
  const order = resolveAfasQuotationLineOrder(row, configuredOrderFieldId);
  const rawLineId = readString(row, afasConfig.fields.line.id);
  if (!rawLineId) {
    throw new Error(
      `Regel-ID ontbreekt op Solvaters_QuotationLines. Controleer AFAS_FIELD_LINE_ID (${afasConfig.fields.line.id ?? 'niet ingesteld'}).`,
    );
  }
  const purchaseEnabledFieldId = afasConfig.fields.line.purchaseEnabled?.trim();
  if (!purchaseEnabledFieldId) {
    throw new Error('AFAS_FIELD_LINE_PURCHASE_ENABLED ontbreekt. Stel dit in op PurchaseTrueFalse.');
  }
  const purchaseEnabled = readFirstBoolean(row, getConfiguredReadCandidates(configurableFieldMap, 'QL-PURCHASE_ENABLED', purchaseEnabledFieldId)) ?? false;
  const unit = readString(row, afasConfig.fields.line.unit);
  if (!unit) {
    throw new Error(`Eenheid ontbreekt op Solvaters_QuotationLines (${afasConfig.fields.line.unit ?? 'niet ingesteld'}).`);
  }
  const lineId = buildAppQuotationLineId({
    projectId,
    quotationId,
    stageId,
    rawLineId,
    itemCode: readString(row, afasConfig.fields.line.itemCode) ?? 'LINE',
  });
  const qtyFormulaMemo = readFirstString(row, getConfiguredReadCandidates(configurableFieldMap, 'QL-QTY_FORMULA_MEMO'));
  const costFormulaMemo = readFirstString(row, getConfiguredReadCandidates(configurableFieldMap, 'QL-COST_FORMULA_MEMO'));
  const markupFormulaMemo = readFirstString(row, getConfiguredReadCandidates(configurableFieldMap, 'QL-MARKUP_FORMULA_MEMO'));

  return {
    id: lineId,
    projectId,
    quotationId,
    stageId,
    order,
    orderHasLineNo: hasAfasQuotationLineLineNo(row),
    lineType: readString(row, afasConfig.fields.line.lineType) ?? undefined,
    itemCode: readString(row, afasConfig.fields.line.itemCode) ?? '',
    description: readString(row, afasConfig.fields.line.description) ?? '',
    supplierId: readFirstString(row, getConfiguredReadCandidates(configurableFieldMap, 'QL-SUPPLIER_ID', afasConfig.fields.line.supplier)),
    supplierName: readString(row, afasConfig.fields.line.supplierName),
    purchaseEnabled,
    baseQty: Math.max(1, readFirstNumber(row, getConfiguredReadCandidates(configurableFieldMap, 'QL-QTY_BASE', afasConfig.fields.line.baseQty, 'Qty'))),
    unit,
    unitCost: readFirstNumber(row, getConfiguredReadCandidates(configurableFieldMap, 'QL-UNIT_COST_BASE', afasConfig.fields.line.unitCost, 'CostPrice')),
    purchasePrice:
      configurableFieldMap?.get('QL-PURCHASE_PRICE') || afasConfig.fields.line.purchasePrice
        ? readFirstNumber(row, getConfiguredReadCandidates(configurableFieldMap, 'QL-PURCHASE_PRICE', afasConfig.fields.line.purchasePrice))
        : undefined,
    unitPrice: readFirstNumber(row, getConfiguredReadCandidates(configurableFieldMap, 'QL-UNIT_PRICE_BASE', afasConfig.fields.line.unitPrice, 'SalesPrice')),
    qtyFormulaMemo,
    costFormulaMemo,
    markupFormulaMemo,
  };
}

function mapAfasItem(row: Record<string, unknown>): Item {
  const supplierName = readString(row, afasConfig.fields.item.preferredSupplierName);
  const supplierId = readString(row, afasConfig.fields.item.preferredSupplierId);
  return {
    code: readString(row, afasConfig.fields.item.code) ?? '',
    description: readString(row, afasConfig.fields.item.description) ?? '',
    lineType: readString(row, afasConfig.fields.item.lineType) ?? undefined,
    defaultUnit: readString(row, afasConfig.fields.item.defaultUnit) ?? 'pst',
    fixedLength: afasConfig.fields.item.fixedLength ? readNumber(row, afasConfig.fields.item.fixedLength) : undefined,
    fixedWidth: afasConfig.fields.item.fixedWidth ? readNumber(row, afasConfig.fields.item.fixedWidth) : undefined,
    lengthWidthSpecCode: readString(row, afasConfig.fields.item.lengthWidthSpecCode),
    lengthWidthSpec: readString(row, afasConfig.fields.item.lengthWidthSpec),
    defaultPurchasePrice: afasConfig.fields.item.defaultPurchasePrice ? readNumber(row, afasConfig.fields.item.defaultPurchasePrice) : undefined,
    defaultUnitCost: readNumber(row, afasConfig.fields.item.defaultUnitCost),
    defaultUnitPrice: readNumber(row, afasConfig.fields.item.defaultUnitPrice),
    preferredSupplierId: supplierId,
    preferredSupplierName: supplierName,
  };
}

function enrichLinesWithItemProperties(lines: QuotationLine[], items: Item[]) {
  const itemByCode = new Map(items.filter((item) => item.code).map((item) => [item.code, item] as const));
  return lines.map((line) => {
    const item = itemByCode.get(line.itemCode);
    if (!item) return line;
    return {
      ...line,
      measurementFixedLength: item.fixedLength,
      measurementFixedWidth: item.fixedWidth,
      measurementSpecCode: item.lengthWidthSpecCode,
      measurementSpec: item.lengthWidthSpec,
    };
  });
}

function mapAfasCreditor(row: Record<string, unknown>): Creditor {
  return {
    id: readString(row, afasConfig.fields.creditor.id) ?? '',
    name: readString(row, afasConfig.fields.creditor.name) ?? '',
  };
}

async function fetchAfasProjects(auth: AfasRequestAuth = { type: 'classic' }) {
  ensureProjectFieldMapping();
  const rows = await fetchConnectorRows(afasConfig, ensureConnector('projects'), undefined, auth);
  return rows.map(mapAfasProject).filter((project) => project.id);
}

async function fetchAfasProject(projectId: string, auth: AfasRequestAuth = { type: 'classic' }) {
  const requestedProjectId = normalizeProjectId(projectId);
  ensureProjectFieldMapping();
  const rows = await fetchConnectorRows(afasConfig, ensureConnector('projects'), {
    filterFieldId: afasConfig.fields.project.id,
    filterValue: requestedProjectId,
  }, auth);
  const project = rows
    .map(mapAfasProject)
    .find((entry) => isExactProjectIdMatch(entry.id, requestedProjectId));
  if (!project) throw new Error(`Project ${requestedProjectId} niet gevonden in AFAS.`);
  return project;
}

async function fetchAfasStages(projectId: string, auth: AfasRequestAuth = { type: 'classic' }) {
  const requestedProjectId = normalizeProjectId(projectId);
  const rows = await fetchConnectorRows(afasConfig, ensureConnector('stages'), {
    filterFieldId: afasConfig.fields.stage.projectId,
    filterValue: requestedProjectId,
  }, auth);
  return rows
    .map(mapAfasStage)
    .filter((stage) => stage.id && isExactProjectIdMatch(stage.projectId, requestedProjectId));
}

async function fetchAfasQuotations(projectId: string, auth: AfasRequestAuth = { type: 'classic' }) {
  const requestedProjectId = normalizeProjectId(projectId);
  const rows = await fetchConnectorRows(afasConfig, ensureConnector('quotations'), {
    filterFieldId: afasConfig.fields.quotation.projectId,
    filterValue: requestedProjectId,
  }, auth);
  return rows
    .map(mapAfasQuotation)
    .filter((quotation) => quotation.id && isExactProjectIdMatch(quotation.projectId, requestedProjectId));
}

async function fetchAfasQuotationLines(projectId: string, auth: AfasRequestAuth = { type: 'classic' }) {
  const requestedProjectId = normalizeProjectId(projectId);
  const settings = normalizeSettings(appSettings);
  const mappings = buildQuotationLineFieldMappings(settings);
  const configurableFieldMap = new Map(
    mappings
      .filter((mapping) => mapping.afasMode === 'configurable' && mapping.afasFieldId?.trim())
      .map((mapping) => [mapping.appFieldId, mapping.afasFieldId!.trim()] as const),
  );
  const rows = await fetchConnectorRows(afasConfig, ensureConnector('quotationLines'), {
    filterFieldId: afasConfig.fields.line.projectId,
    filterValue: requestedProjectId,
  }, auth);
  let lines = rows
    .map((row) => mapAfasQuotationLine(row, configurableFieldMap))
    .filter((line) => line.id && isExactProjectIdMatch(line.projectId, requestedProjectId));
  try {
    const itemRows = await fetchConnectorRows(afasConfig, ensureConnector('items'), undefined, auth);
    lines = enrichLinesWithItemProperties(lines, itemRows.map(mapAfasItem).filter((item) => item.code));
  } catch {
    // Item enrichment is optional.
  }
  const supplierIds = [...new Set(lines.map((line) => line.supplierId).filter((value): value is string => Boolean(value?.trim())))];
  if (!supplierIds.length) return lines;
  try {
    const creditorRows = await fetchConnectorRows(afasConfig, ensureConnector('creditors'), undefined, auth);
    const creditorById = new Map(
      creditorRows
        .map(mapAfasCreditor)
        .filter((creditor) => creditor.id)
        .map((creditor) => [creditor.id, creditor.name] as const),
    );
    return lines.map((line) => ({
      ...line,
      supplierName: line.supplierName ?? (line.supplierId ? creditorById.get(line.supplierId) : undefined),
    }));
  } catch {
    return lines;
  }
}

async function verifyUpdatedLineOrders(projectId: string, updatedLines: QuotationLineMutation[], auth: AfasRequestAuth = { type: 'classic' }) {
  const candidates = updatedLines.filter((line) => line.id?.trim());
  if (!candidates.length) return;
  const refreshedLines = await fetchAfasQuotationLines(projectId, auth);
  const refreshedById = new Map(refreshedLines.map((line) => [line.id, line] as const));
  const mismatches = candidates
    .map((line) => {
      const refreshed = refreshedById.get(line.id!.trim());
      if (!refreshed) return { id: line.id!.trim(), expected: sanitizeNumber(line.order), actual: undefined };
      const expected = sanitizeNumber(line.order);
      if (refreshed.order === expected) return null;
      return { id: line.id!.trim(), expected, actual: refreshed.order };
    })
    .filter((entry): entry is { id: string; expected: number; actual: number | undefined } => Boolean(entry));
  if (!mismatches.length) return;
  throw new Error(
    `AFAS heeft de regelvolgorde niet verwerkt voor ${mismatches.length} regel(s): ` +
    mismatches.map((entry) => `${entry.id} (verwacht ${entry.expected}, ontvangen ${entry.actual ?? 'geen regel'})`).join('; '),
  );
}

async function fetchAfasCreditors(auth: AfasRequestAuth = { type: 'classic' }) {
  const rows = await fetchConnectorRows(afasConfig, ensureConnector('creditors'), undefined, auth);
  return rows.map(mapAfasCreditor).filter((creditor) => creditor.id);
}

type ExistingAfasLineIdentity = {
  appLineId: string;
  quotationId: string;
  stageId: string;
  order: number;
  itemCode: string;
  rawLineId?: string;
  guLi?: string;
};

type ExistingAfasLineIndex = {
  byAppId: Map<string, ExistingAfasLineIdentity>;
  byLookupKey: Map<string, ExistingAfasLineIdentity>;
};

function buildExistingLineLookupKey(input: { quotationId: string; stageId: string; order: number; itemCode: string }) {
  return `${input.quotationId}\u0000${input.stageId}\u0000${input.order}\u0000${input.itemCode}`;
}

function parseAppLineIdParts(lineId?: string) {
  if (!lineId) return null;
  const parts = lineId.split(':');
  if (parts.length < 5) return null;
  return {
    projectId: parts[0] ?? '',
    quotationId: parts[1] ?? '',
    stageId: parts[2] ?? 'NO_STAGE',
    rawLineId: parts[3] ?? '',
    itemCode: parts.slice(4).join(':') || 'LINE',
  };
}

async function fetchExistingAfasLineIdentities(projectId: string, auth: AfasRequestAuth = { type: 'classic' }): Promise<ExistingAfasLineIndex> {
  const requestedProjectId = normalizeProjectId(projectId);
  const settings = normalizeSettings(appSettings);
  const mappings = buildQuotationLineFieldMappings(settings);
  const configurableFieldMap = new Map(
    mappings
      .filter((mapping) => mapping.afasMode === 'configurable' && mapping.afasFieldId?.trim())
      .map((mapping) => [mapping.appFieldId, mapping.afasFieldId!.trim()] as const),
  );
  const configuredOrderFieldId = configurableFieldMap.get('QL-ORDER');
  const rows = await fetchConnectorRows(afasConfig, ensureConnector('quotationLines'), {
    filterFieldId: afasConfig.fields.line.projectId,
    filterValue: requestedProjectId,
  }, auth);
  return rows.reduce<ExistingAfasLineIndex>((index, row) => {
    const rowProjectId = readString(row, afasConfig.fields.line.projectId) ?? '';
    if (!isExactProjectIdMatch(rowProjectId, requestedProjectId)) return index;
    const quotationId = readString(row, afasConfig.fields.line.quotationId) ?? '';
    const stageId = readString(row, afasConfig.fields.line.stageId) ?? 'NO_STAGE';
    const order = resolveAfasQuotationLineOrder(row, configuredOrderFieldId);
    const configuredRawLineId = readString(row, afasConfig.fields.line.id);
    const guLi = readString(row, 'GuLi');
    const seqNo = readString(row, 'SeqNo');
    const rawLineId = guLi ?? configuredRawLineId;
    if (!rawLineId) return index;
    const itemCode = readString(row, afasConfig.fields.line.itemCode) ?? 'LINE';
    const appLineIdWithResolvedId = buildAppQuotationLineId({
      projectId: rowProjectId,
      quotationId,
      stageId,
      rawLineId,
      itemCode,
    });
    const identity: ExistingAfasLineIdentity = {
      appLineId: appLineIdWithResolvedId,
      quotationId,
      stageId,
      order,
      itemCode,
      rawLineId,
      guLi: guLi ?? undefined,
    };

    const aliasIds = [
      appLineIdWithResolvedId,
      configuredRawLineId
        ? buildAppQuotationLineId({
            projectId: rowProjectId,
            quotationId,
            stageId,
            rawLineId: configuredRawLineId,
            itemCode,
          })
        : undefined,
      guLi
        ? buildAppQuotationLineId({
            projectId: rowProjectId,
            quotationId,
            stageId,
            rawLineId: guLi,
            itemCode,
          })
        : undefined,
      seqNo
        ? buildAppQuotationLineId({
            projectId: rowProjectId,
            quotationId,
            stageId,
            rawLineId: seqNo,
            itemCode,
          })
        : undefined,
    ].filter((id): id is string => Boolean(id));
    aliasIds.forEach((id) => index.byAppId.set(id, identity));
    index.byLookupKey.set(buildExistingLineLookupKey({ quotationId, stageId, order, itemCode }), identity);
    return index;
  }, { byAppId: new Map<string, ExistingAfasLineIdentity>(), byLookupKey: new Map<string, ExistingAfasLineIdentity>() });
}

function resolveExistingIdentityByMutation(line: QuotationLineMutation, index: ExistingAfasLineIndex) {
  if (line.id?.trim()) {
    const byId = index.byAppId.get(line.id.trim());
    if (byId) return byId;
  }
  const lookupKey = buildExistingLineLookupKey({
    quotationId: line.quotationId?.trim() ?? '',
    stageId: line.stageId?.trim() || 'NO_STAGE',
    order: sanitizeNumber(line.order),
    itemCode: line.itemCode?.trim() || 'LINE',
  });
  return index.byLookupKey.get(lookupKey);
}

function resolveAfasGuLi(lineId: string | undefined, identity?: ExistingAfasLineIdentity) {
  const parsed = parseRawLineIdFromAppId(lineId);
  if (isProbablyAfasGuid(parsed)) return parsed?.trim();
  if (identity?.guLi && isProbablyAfasGuid(identity.guLi)) return identity.guLi.trim();
  if (identity?.rawLineId && isProbablyAfasGuid(identity.rawLineId)) return identity.rawLineId.trim();
  return undefined;
}

async function fetchItemLineTypesByCode(auth: AfasRequestAuth = { type: 'classic' }) {
  const rows = await fetchConnectorRows(afasConfig, ensureConnector('items'), undefined, auth);
  return new Map(
    rows
      .map((row) => ({
        code: readString(row, afasConfig.fields.item.code),
        lineType: readString(row, afasConfig.fields.item.lineType),
      }))
      .filter((entry): entry is { code: string; lineType: string } => Boolean(entry.code && entry.lineType))
      .map((entry) => [entry.code, entry.lineType] as const),
  );
}

function resolveLineType(line: QuotationLineMutation, itemLineTypesByCode: Map<string, string>) {
  const explicit = line.lineType?.trim();
  if (explicit) return explicit;
  const fromItem = itemLineTypesByCode.get(line.itemCode);
  if (fromItem?.trim()) return fromItem.trim();
  throw new Error(
    `LineType ontbreekt voor regel met itemCode "${line.itemCode}". ` +
    'Zorg dat LineType in Solvaters_QuotationLines staat of dat het item een LineType heeft in Solvaters_Items.',
  );
}

function toFormulaMemo(rawMemo: string | undefined, formula: unknown) {
  const memo = rawMemo?.trim();
  if (memo) return memo;
  if (!formula) return undefined;
  try {
    return JSON.stringify(formula);
  } catch {
    return undefined;
  }
}

function toAfasLineFields(
  line: QuotationLineMutation,
  resolvedLineType: string,
  mappingByFieldId: Map<string, string>,
) {
  const fields: Record<string, unknown> = {
    VaIt: resolvedLineType,
    ItCd: line.itemCode,
    Ds: line.description,
    QuUn: sanitizeNumber(line.computedQty ?? line.baseQty),
    UnId: line.unit,
    AmCo: sanitizeNumber(line.computedUnitCost ?? line.unitCost),
    Upri: sanitizeNumber(line.computedUnitPrice ?? line.unitPrice),
  };
  if (line.stageId && line.stageId !== 'NO_STAGE') fields.PrSt = line.stageId;

  const configurableAssignments: Array<[string, unknown]> = [
    ['QL-SUPPLIER_ID', line.supplierId?.trim() || undefined],
    ['QL-ORDER', sanitizeNumber(line.order)],
    ['QL-QTY_BASE', sanitizeNumber(line.baseQty)],
    ['QL-QTY_FORMULA_MEMO', toFormulaMemo(line.qtyFormulaMemo, line.qtyFormula) ?? ''],
    ['QL-COST_FORMULA_MEMO', toFormulaMemo(line.costFormulaMemo, line.costFormula) ?? ''],
    ['QL-MARKUP_FORMULA_MEMO', line.markupFormulaMemo?.trim() ?? ''],
    ['QL-UNIT_COST_BASE', sanitizeNumber(line.unitCost)],
    ['QL-PURCHASE_PRICE', line.purchasePrice === undefined ? undefined : sanitizeNumber(line.purchasePrice)],
    ['QL-UNIT_PRICE_BASE', sanitizeNumber(line.unitPrice)],
    ['QL-PURCHASE_ENABLED', line.purchaseEnabled === undefined ? undefined : line.purchaseEnabled],
  ];
  configurableAssignments.forEach(([appFieldId, value]) => {
    const afasFieldId = mappingByFieldId.get(appFieldId);
    if (!afasFieldId || value === undefined || value === null) return;
    const isFormulaMemoField = appFieldId === 'QL-QTY_FORMULA_MEMO' || appFieldId === 'QL-COST_FORMULA_MEMO' || appFieldId === 'QL-MARKUP_FORMULA_MEMO';
    if (value === '' && !isFormulaMemoField) return;
    fields[afasFieldId] = value;
  });

  allMarkups.forEach((markupType) => {
    const afasFieldId = mappingByFieldId.get(`QL-MARKUP-${markupType}`);
    if (!afasFieldId) return;
    const value = (line as unknown as Record<string, unknown>)[`markup${markupType}`];
    if (value === undefined || value === null || value === '') return;
    fields[afasFieldId] = sanitizeNumber(value);
  });
  return fields;
}

type QuotationLineMutationAction = 'insert' | 'update' | 'delete';

async function mutateAfasQuotationLine(
  quotationId: string,
  lineMutation: { action: QuotationLineMutationAction; fields: Record<string, unknown> },
  auth: AfasRequestAuth,
) {
  await callAfasRaw(afasConfig, '/connectors/KnQuotation', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': 'nl-nl',
    },
    body: JSON.stringify({
      KnQuotation: {
        Element: {
          Fields: {
            '@Action': 'update',
            QuId: quotationId,
          },
          Objects: [
            {
              KnQuotationLine: {
                Element: {
                  Fields: {
                    '@Action': lineMutation.action,
                    ...lineMutation.fields,
                  },
                },
              },
            },
          ],
        },
      },
    }),
  }, auth);
}

function afasWriteNotSupported(res: express.Response) {
  return res.status(501).send('Deze schrijfactie is nog niet aangesloten op AFAS.');
}

app.post('/api/iframe/exchange', async (req, res) => {
  try {
    const tokenurl = typeof req.body?.tokenurl === 'string' ? req.body.tokenurl.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const publickey = typeof req.body?.publickey === 'string' ? req.body.publickey.trim() : '';
    const sessionid = typeof req.body?.sessionid === 'string' ? req.body.sessionid.trim() : '';

    if (!tokenurl || !code || !publickey || !sessionid) {
      return res.status(400).json({ ok: false, error: 'tokenurl, code, publickey en sessionid zijn verplicht.' });
    }
    if (!isAllowedIframeTokenUrl(tokenurl)) {
      return res.status(400).json({ ok: false, error: 'tokenurl host is niet toegestaan.' });
    }

    const secret = iframePublicKeySecrets[publickey];
    if (!secret) {
      return res.status(400).json({ ok: false, error: 'Geen secret gevonden voor opgegeven publickey.' });
    }

    const bySessionId = iframeSessions.get(sessionid);
    if (bySessionId) {
      return res.json({ ok: true, session: toIframeSessionResponse(bySessionId) });
    }
    const cachedSessionId = iframeCodeToSessionId.get(code);
    if (cachedSessionId) {
      const byCode = iframeSessions.get(cachedSessionId);
      if (byCode) {
        return res.json({ ok: true, session: toIframeSessionResponse(byCode) });
      }
    }
    const inFlight = iframeExchangeInFlight.get(code);
    if (inFlight) {
      const profile = await inFlight;
      return res.json({ ok: true, session: toIframeSessionResponse(profile) });
    }

    const exchangePromise = (async () => {
      const formPayload = new URLSearchParams();
      formPayload.set('code', code);
      formPayload.set('secret', secret);
      const response = await fetch(tokenurl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: formPayload.toString(),
      });
      const responseText = await response.text();
      if (!response.ok) {
        if (responseText.includes('TOKEN_ALREADY_RETRIEVED')) {
          const existingBySession = iframeSessions.get(sessionid);
          if (existingBySession) return existingBySession;
        }
        throw new Error(JSON.stringify({
          ok: false,
          error: `Token exchange mislukt (${response.status}).`,
          details: responseText.slice(0, 300),
        }));
      }

      let payload: unknown = {};
      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch {
        payload = { raw: responseText };
      }

      const profile = await enrichIframeSessionProfile(pickIframeSessionProfile(payload, sessionid));
      iframeSessions.set(profile.sessionId, profile);
      iframeCodeToSessionId.set(code, profile.sessionId);
      return profile;
    })();

    iframeExchangeInFlight.set(code, exchangePromise);
    try {
      const profile = await exchangePromise;
      return res.json({ ok: true, session: toIframeSessionResponse(profile) });
    } finally {
      iframeExchangeInFlight.delete(code);
    }
  } catch (error) {
    const message = (error as Error).message;
    try {
      const parsed = JSON.parse(message) as { ok: false; error: string; details?: string };
      return res.status(502).json(parsed);
    } catch {
      // Continue with generic fallback.
    }
    return res.status(502).json({
      ok: false,
      error: message,
    });
  }
});

app.get('/api/iframe/session/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId?.trim();
  if (!sessionId) return res.status(400).json({ ok: false, error: 'sessionId ontbreekt.' });
  const session = iframeSessions.get(sessionId);
  if (!session) return res.status(404).json({ ok: false, error: 'Sessie niet gevonden.' });
  const resolvedDisplayName = await resolveAfasUserDisplayName(session.userId);
  if (resolvedDisplayName && resolvedDisplayName !== session.displayName) session.displayName = resolvedDisplayName;
  session.lastSeenAt = new Date().toISOString();
  return res.json({
    ok: true,
    session: {
      sessionId: session.sessionId,
      userId: session.userId,
      personCode: session.personCode,
      employeeId: session.employeeId,
      environmentId: session.environmentId,
      displayName: session.displayName,
      lastSeenAt: session.lastSeenAt,
    },
  });
});

app.post('/api/locks/claim', async (req, res) => {
  cleanupExpiredLocks();
  const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
  const quotationId = typeof req.body?.quotationId === 'string' ? req.body.quotationId.trim() : '';
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  if (!projectId || !quotationId || !sessionId) {
    return res.json({ ok: false, reason: 'invalid_request' });
  }
  const session = iframeSessions.get(sessionId);
  if (!session) return res.json({ ok: false, reason: 'unknown_session' });
  const resolvedDisplayName = await resolveAfasUserDisplayName(session.userId);
  const ownerDisplayName = resolvedDisplayName || session.displayName || session.userId;
  if (resolvedDisplayName) session.displayName = resolvedDisplayName;
  const key = lockKey(projectId, quotationId);
  const existing = quotationLocks.get(key);
  const now = nowMs();
  if (existing && new Date(existing.expiresAt).getTime() > now && existing.ownerUserId !== session.userId) {
    return res.json({ ok: false, reason: 'locked_by_other', lock: toLockResponse(existing) });
  }
  const ttlSeconds = resolveLockTtlSeconds(req.body?.ttlSeconds);
  const next: QuotationLock = existing && existing.ownerUserId === session.userId
    ? {
      ...existing,
      ownerDisplayName,
      ownerSessionId: session.sessionId,
      expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
    }
    : {
      key,
      projectId,
      quotationId,
      ownerUserId: session.userId,
      ownerDisplayName,
      ownerSessionId: session.sessionId,
      acquiredAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
    };
  quotationLocks.set(key, next);
  return res.json({ ok: true, lock: toLockResponse(next) });
});

app.post('/api/locks/heartbeat', async (req, res) => {
  cleanupExpiredLocks();
  const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
  const quotationId = typeof req.body?.quotationId === 'string' ? req.body.quotationId.trim() : '';
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  if (!projectId || !quotationId || !sessionId) {
    return res.json({ ok: false, reason: 'invalid_request' });
  }
  const session = iframeSessions.get(sessionId);
  if (!session) return res.json({ ok: false, reason: 'unknown_session' });
  const resolvedDisplayName = await resolveAfasUserDisplayName(session.userId);
  const ownerDisplayName = resolvedDisplayName || session.displayName || session.userId;
  if (resolvedDisplayName) session.displayName = resolvedDisplayName;
  const key = lockKey(projectId, quotationId);
  const existing = quotationLocks.get(key);
  if (!existing) return res.json({ ok: false, reason: 'lock_not_found' });
  if (existing.ownerUserId !== session.userId) {
    return res.json({ ok: false, reason: 'locked_by_other', lock: toLockResponse(existing) });
  }
  const ttlSeconds = resolveLockTtlSeconds(req.body?.ttlSeconds);
  const refreshed: QuotationLock = {
    ...existing,
    ownerSessionId: session.sessionId,
    ownerDisplayName,
    expiresAt: new Date(nowMs() + ttlSeconds * 1000).toISOString(),
  };
  quotationLocks.set(key, refreshed);
  return res.json({ ok: true, lock: toLockResponse(refreshed) });
});

app.post('/api/locks/release', (req, res) => {
  cleanupExpiredLocks();
  const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
  const quotationId = typeof req.body?.quotationId === 'string' ? req.body.quotationId.trim() : '';
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  if (!projectId || !quotationId || !sessionId) {
    return res.json({ ok: false, reason: 'invalid_request' });
  }
  const session = iframeSessions.get(sessionId);
  if (!session) return res.json({ ok: false, reason: 'unknown_session' });
  const key = lockKey(projectId, quotationId);
  const existing = quotationLocks.get(key);
  if (!existing) return res.json({ ok: false, reason: 'lock_not_found' });
  if (existing.ownerUserId !== session.userId) {
    return res.json({ ok: false, reason: 'not_lock_owner', lock: toLockResponse(existing) });
  }
  quotationLocks.delete(key);
  return res.json({ ok: true });
});

app.get('/api/locks/:projectId/:quotationId', (req, res) => {
  cleanupExpiredLocks();
  const projectId = req.params.projectId?.trim();
  const quotationId = req.params.quotationId?.trim();
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';
  if (!projectId || !quotationId) return res.json({ ok: false, reason: 'invalid_request' });
  const key = lockKey(projectId, quotationId);
  const existing = quotationLocks.get(key);
  if (!existing) return res.json({ ok: true, lock: null, mine: false });
  const session = sessionId ? iframeSessions.get(sessionId) : undefined;
  return res.json({ ok: true, lock: toLockResponse(existing), mine: Boolean(session && existing.ownerUserId === session.userId) });
});

app.get('/api/health', async (_req, res) => {
  try {
    const payload = await probeAfas(afasConfig);
    return res.json({
      ok: true,
      mode: 'afas',
      service: 'voorcalculatie-backend',
      time: new Date().toISOString(),
      afas: payload,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      mode: 'afas',
      service: 'voorcalculatie-backend',
      time: new Date().toISOString(),
      error: (error as Error).message,
    });
  }
});

registerCoreSettingsRoutes(app, {
  disableSensitiveCaching,
  requireSettingsAccess: allowAllSettingsAccess,
  requireTrustedBrowserContext,
  requireKnownAfasUser,
  buildBootstrapStatus,
  loadCoreSettings: async () => await loadCoreSettings() as any,
  persistCoreSettings: async (settings) => await persistCoreSettings(settings as any) as any,
  fetchContextRecord: async (recordId) => await fetchContextRecord(recordId),
  getAfasRequestAuthForRequest,
});

registerAppRoutes(app, {
  disableSensitiveCaching,
  requireSettingsAccess: allowAllSettingsAccess,
  requireTrustedBrowserContext,
  loadAppSettings: loadAppOnlySettings,
  persistAppSettings: persistAppOnlySettings,
});

registerAfasRoutes(app, {
  afasConfigRef: () => afasConfig,
  disableSensitiveCaching,
  requireSettingsAccess: allowAllSettingsAccess,
  requireTrustedBrowserContext,
  requireIframeSession,
  requireKnownAfasUser,
  expensiveRouteLimiter: (_req, _res, next) => next(),
  getAfasRequestAuthForRequest,
  probeAfasStatus: async (_req) => probeAfas(afasConfig),
  buildAfasConnectionConfigResponse: (config) => buildAfasConnectionConfigResponse(config as any),
  applyAfasConnectionInput,
  cleanupExpiredOAuthStates,
  getRequestAppSessionId,
  buildAfasWriteAuthStatus,
  buildAfasUserDebugStatus,
  fetchAfasGetConnectors: async () => ([
    {
      name: afasConfig.connectors.projects || 'Projects',
      label: 'Projecten',
      description: 'Huidige projectconnector van de voorcalculatie-app.',
      fields: Object.entries(afasConfig.fields.project).map(([name, fieldName]) => ({
        name,
        label: fieldName,
        type: 'string',
        required: name === 'id' || name === 'name',
      })),
      metadata: { connector: afasConfig.connectors.projects },
    },
  ]),
  fetchAfasUpdateConnectors: async () => [],
});

registerOAuthRoutes(app, {
  afasConfigRef: () => afasConfig,
  cleanupExpiredOAuthStates,
  getAfasOAuthConfig: () => getAfasOAuthConfig() ?? undefined,
  getRequestAppSessionId,
  getRequestIframeSessionId,
  peekRequestAppSessionId,
  getCurrentIframeSession,
  getRequestOrigin,
  isAllowedBrowserOrigin,
  getEmbedOriginFromRequest,
  isAllowedAfasEmbedOrigin,
  createOAuthStateValue,
  createPkceCodeVerifier,
  createPkceCodeChallenge,
  oauthStore: {
    savePendingState: (state, value) => oauthStore.savePendingState(state, value),
    getPendingState: (state) => oauthStore.getPendingState(state),
    deletePendingState: (state) => oauthStore.deletePendingState(state),
    getSession: (appSessionId) => oauthStore.getSession(appSessionId),
    saveSession: (session) => oauthStore.saveSession(session),
    deleteSession: (appSessionId) => oauthStore.deleteSession(appSessionId),
  },
  nowMs,
  getAfasOAuthAuthorizeUrl: (config) => getAfasOAuthAuthorizeUrl(config as any),
  exchangeAfasOAuthToken,
  iframeSessionStore,
  getRequestState,
  setBrowserSessionCookie,
  renderOAuthCallbackHtml,
  requireTrustedBrowserContext,
  requireIframeSession,
  requireAfasAdmin,
  clearBrowserSessionCookie,
  clearIframeSessionCookie,
  clearBootstrapUserCookie,
});

registerIframeRoutes(app, {
  expensiveRouteLimiter: (_req, _res, next) => next(),
  requireTrustedBrowserContext,
  requireIframeSession,
  cleanupExpiredIframeState,
  getRequestAppSessionId,
  isAllowedIframeTokenUrl,
  getAfasRuntimeSecretForPublicKey: async (publicKey) => iframePublicKeySecrets[publicKey],
  iframeExchangeInFlight,
  iframeSessionStore: {
    ...iframeSessionStore,
    saveSession: async (session) => {
      const enriched = await enrichIframeSessionProfile(session);
      await iframeSessionStore.saveSession(enriched);
    },
  },
  getIframeSessionExpiresAt,
  nowMs,
  iframeCodeTtlMs: 10 * 60 * 1000,
  pickIframeSessionProfile,
  toIframeSessionResponse,
  getCurrentIframeSession,
  setIframeSessionCookie,
  setBootstrapUserCookie,
});

registerVoorcalculatieRoutes(app, {
  claimLock: async (req, res) => {
    cleanupExpiredLocks();
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
    const quotationId = typeof req.body?.quotationId === 'string' ? req.body.quotationId.trim() : '';
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    if (!projectId || !quotationId || !sessionId) return res.json({ ok: false, reason: 'invalid_request' });
    const session = iframeSessions.get(sessionId);
    if (!session) return res.json({ ok: false, reason: 'unknown_session' });
    const resolvedDisplayName = await resolveAfasUserDisplayName(session.userId);
    const ownerDisplayName = resolvedDisplayName || session.displayName || session.userId;
    if (resolvedDisplayName) session.displayName = resolvedDisplayName;
    const key = lockKey(projectId, quotationId);
    const existing = quotationLocks.get(key);
    const now = nowMs();
    if (existing && new Date(existing.expiresAt).getTime() > now && existing.ownerUserId !== session.userId) {
      return res.json({ ok: false, reason: 'locked_by_other', lock: toLockResponse(existing) });
    }
    const ttlSeconds = resolveLockTtlSeconds(req.body?.ttlSeconds);
    const next: QuotationLock = existing && existing.ownerUserId === session.userId
      ? { ...existing, ownerDisplayName, ownerSessionId: session.sessionId, expiresAt: new Date(now + ttlSeconds * 1000).toISOString() }
      : { key, projectId, quotationId, ownerUserId: session.userId, ownerDisplayName, ownerSessionId: session.sessionId, acquiredAt: new Date(now).toISOString(), expiresAt: new Date(now + ttlSeconds * 1000).toISOString() };
    quotationLocks.set(key, next);
    return res.json({ ok: true, lock: toLockResponse(next) });
  },
  heartbeatLock: async (req, res) => {
    cleanupExpiredLocks();
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
    const quotationId = typeof req.body?.quotationId === 'string' ? req.body.quotationId.trim() : '';
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    if (!projectId || !quotationId || !sessionId) return res.json({ ok: false, reason: 'invalid_request' });
    const session = iframeSessions.get(sessionId);
    if (!session) return res.json({ ok: false, reason: 'unknown_session' });
    const resolvedDisplayName = await resolveAfasUserDisplayName(session.userId);
    const ownerDisplayName = resolvedDisplayName || session.displayName || session.userId;
    if (resolvedDisplayName) session.displayName = resolvedDisplayName;
    const key = lockKey(projectId, quotationId);
    const existing = quotationLocks.get(key);
    if (!existing) return res.json({ ok: false, reason: 'lock_not_found' });
    if (existing.ownerUserId !== session.userId) return res.json({ ok: false, reason: 'locked_by_other', lock: toLockResponse(existing) });
    const ttlSeconds = resolveLockTtlSeconds(req.body?.ttlSeconds);
    const refreshed: QuotationLock = { ...existing, ownerSessionId: session.sessionId, ownerDisplayName, expiresAt: new Date(nowMs() + ttlSeconds * 1000).toISOString() };
    quotationLocks.set(key, refreshed);
    return res.json({ ok: true, lock: toLockResponse(refreshed) });
  },
  releaseLock: (req, res) => {
    cleanupExpiredLocks();
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
    const quotationId = typeof req.body?.quotationId === 'string' ? req.body.quotationId.trim() : '';
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    if (!projectId || !quotationId || !sessionId) return res.json({ ok: false, reason: 'invalid_request' });
    const session = iframeSessions.get(sessionId);
    if (!session) return res.json({ ok: false, reason: 'unknown_session' });
    const key = lockKey(projectId, quotationId);
    const existing = quotationLocks.get(key);
    if (!existing) return res.json({ ok: false, reason: 'lock_not_found' });
    if (existing.ownerUserId !== session.userId) return res.json({ ok: false, reason: 'not_lock_owner', lock: toLockResponse(existing) });
    quotationLocks.delete(key);
    return res.json({ ok: true });
  },
  getLock: (req, res) => {
    cleanupExpiredLocks();
    const projectId = paramText(req.params.projectId);
    const quotationId = paramText(req.params.quotationId);
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId.trim() : '';
    if (!projectId || !quotationId) return res.json({ ok: false, reason: 'invalid_request' });
    const key = lockKey(projectId, quotationId);
    const existing = quotationLocks.get(key);
    if (!existing) return res.json({ ok: true, lock: null, mine: false });
    const session = sessionId ? iframeSessions.get(sessionId) : undefined;
    return res.json({ ok: true, lock: toLockResponse(existing), mine: Boolean(session && existing.ownerUserId === session.userId) });
  },
  getLegacySettings: (_req, res) => res.json(normalizeSettings(appSettings)),
  saveLegacySettings: (req, res) => {
    appSettings = normalizeSettings({ ...appSettings, ...(req.body as Partial<Settings>) });
    res.json(appSettings);
  },
  getQuotationLineFieldMappings: (_req, res) => res.json(buildQuotationLineFieldMappings(normalizeSettings(appSettings))),
  getProjects: async (req, res) => {
    try {
      const auth = await resolveAfasAuth(req);
      const projects = await fetchAfasProjects(auth);
      return res.json(projects.sort((a, b) => a.id.localeCompare(b.id, 'nl')));
    } catch (error) {
      return res.status(502).send((error as Error).message);
    }
  },
  getProject: async (req, res) => {
    try {
      const auth = await resolveAfasAuth(req);
      return res.json(await fetchAfasProject(paramText(req.params.projectId), auth));
    } catch (error) {
      return res.status(404).send((error as Error).message);
    }
  },
  updateProject: (req, res) => afasWriteNotSupported(res),
  getStages: async (req, res) => {
    try {
      const auth = await resolveAfasAuth(req);
      const stages = await fetchAfasStages(paramText(req.params.projectId), auth);
      return res.json(stages.sort((a, b) => a.order - b.order));
    } catch (error) {
      return res.status(502).send((error as Error).message);
    }
  },
  createStage: async (req, res) => {
    const body = (req.body ?? {}) as Partial<ProjectStage>;
    try {
      const auth = await resolveAfasAuth(req);
      const projectId = paramText(req.params.projectId);
      const existingStages = await fetchAfasStages(projectId, auth);
      const code = body.code?.trim() || `F${String(existingStages.length + 1).padStart(3, '0')}`;
      const name = body.name?.trim() || `Nieuwe fase ${existingStages.length + 1}`;
      const chargeMode = sanitizeStageChargeMode(body.chargeMode);
      await createAfasProjectStage(afasConfig, { projectId, code, name, chargeMode }, auth);
      const refreshedStages = await fetchAfasStages(projectId, auth);
      const createdStage = refreshedStages.find((stage) => stage.id === code || stage.code === code) ?? { id: code, projectId, code, name, order: Math.max(0, ...existingStages.map((stage) => stage.order)) + 1, chargeMode, phaseMarkups: {} } satisfies ProjectStage;
      return res.status(201).json({ ...createdStage, chargeMode });
    } catch (error) {
      return res.status(502).send((error as Error).message);
    }
  },
  updateStage: async (req, res) => {
    const body = (req.body ?? {}) as Partial<ProjectStage>;
    const name = body.name?.trim();
    if (!name) return res.status(400).send('Fasenaam ontbreekt.');
    const chargeMode = sanitizeStageChargeMode(body.chargeMode);
    try {
      const auth = await resolveAfasAuth(req);
      const projectId = paramText(req.params.projectId);
      const stageId = paramText(req.params.stageId);
      await updateAfasProjectStage(afasConfig, { projectId, stageCode: stageId, name, chargeMode }, auth);
      const refreshedStages = await fetchAfasStages(projectId, auth);
      const updated = refreshedStages.find((stage) => stage.id === stageId || stage.code === stageId);
      if (!updated) return res.json({ id: stageId, projectId, code: stageId, name, order: 0, chargeMode, phaseMarkups: {} } satisfies ProjectStage);
      return res.json({ ...updated, name, chargeMode });
    } catch (error) {
      return res.status(502).send((error as Error).message);
    }
  },
  getQuotations: async (req, res) => {
    try {
      const auth = await resolveAfasAuth(req);
      const quotations = await fetchAfasQuotations(paramText(req.params.projectId), auth);
      return res.json(quotations.sort((a, b) => a.order - b.order));
    } catch (error) {
      return res.status(502).send((error as Error).message);
    }
  },
  createQuotation: async (req, res) => {
    const body = (req.body ?? {}) as Partial<Quotation>;
    try {
      const auth = await resolveAfasAuth(req);
      const projectId = paramText(req.params.projectId);
      const existingQuotations = await fetchAfasQuotations(projectId, auth);
      const name = body.name?.trim() || `Voorcalculatie ${existingQuotations.length + 1}`;
      await createAfasQuotation(afasConfig, { projectId, name }, auth);
      const refreshedQuotations = await fetchAfasQuotations(projectId, auth);
      const createdQuotation = [...refreshedQuotations].reverse().find((quotation) => quotation.name === name || quotation.id === body.id || quotation.number === body.number) ?? { id: body.id?.trim() || '', projectId, number: body.number?.trim() || '', name, order: Math.max(0, ...existingQuotations.map((quotation) => quotation.order)) + 1 } satisfies Quotation;
      return res.status(201).json(createdQuotation);
    } catch (error) {
      return res.status(502).send((error as Error).message);
    }
  },
  updateQuotation: async (req, res) => {
    const body = (req.body ?? {}) as Partial<Quotation>;
    const name = body.name?.trim();
    if (!name) return res.status(400).send('Voorcalculatienaam ontbreekt.');
    try {
      const auth = await resolveAfasAuth(req);
      const projectId = paramText(req.params.projectId);
      const quotationId = paramText(req.params.quotationId);
      await updateAfasQuotation(afasConfig, { quotationId, name }, auth);
      const refreshed = await fetchAfasQuotations(projectId, auth);
      const updated = refreshed.find((quotation) => quotation.id === quotationId || quotation.number === quotationId);
      if (!updated) return res.json({ id: quotationId, projectId, number: quotationId, name, order: 0 } satisfies Quotation);
      return res.json({ ...updated, name });
    } catch (error) {
      return res.status(502).send((error as Error).message);
    }
  },
  getQuotationLines: async (req, res) => {
    try {
      const auth = await resolveAfasAuth(req);
      const lines = await fetchAfasQuotationLines(paramText(req.params.projectId), auth);
      return res.json([...lines].sort((a, b) => {
        if (a.quotationId !== b.quotationId) return a.quotationId.localeCompare(b.quotationId, 'nl');
        if (a.stageId !== b.stageId) return a.stageId.localeCompare(b.stageId, 'nl');
        if (Boolean(a.orderHasLineNo) !== Boolean(b.orderHasLineNo)) return a.orderHasLineNo ? -1 : 1;
        if (a.order !== b.order) return a.order - b.order;
        return a.id.localeCompare(b.id, 'nl');
      }));
    } catch (error) {
      return res.status(502).send((error as Error).message);
    }
  },
  saveQuotationLines: async (req, res) => {
    const projectId = paramText(req.params.projectId);
    if (!projectId) return res.status(400).send('projectId ontbreekt.');
    const body = (req.body ?? {}) as Partial<SaveQuotationLinesPayload>;
    const create = Array.isArray(body.create) ? body.create : [];
    const update = Array.isArray(body.update) ? body.update : [];
    const remove = Array.isArray(body.delete) ? body.delete : [];
    if (!create.length && !update.length && !remove.length) return res.json({ ok: true });
    try {
      const auth = await resolveAfasAuth(req);
      const settings = normalizeSettings(appSettings);
      const mappings = buildQuotationLineFieldMappings(settings);
      const mappingByFieldId = new Map(mappings.map((mapping) => [mapping.appFieldId, mapping.afasFieldId?.trim() ?? ''] as const).filter(([, afasFieldId]) => Boolean(afasFieldId)));
      const createAndUpdate = [...create, ...update];
      const hasQtyFormulaMemoData = createAndUpdate.some((line) => Boolean(toFormulaMemo(typeof line.qtyFormulaMemo === 'string' ? line.qtyFormulaMemo : undefined, (line as { qtyFormula?: unknown }).qtyFormula)));
      if (hasQtyFormulaMemoData && !mappingByFieldId.get('QL-QTY_FORMULA_MEMO')) throw new Error('Aantalformule memo aanwezig, maar AFAS veldkoppeling voor QL-QTY_FORMULA_MEMO ontbreekt. Vul deze eerst in bij Regelveld koppeling AFAS.');
      const hasCostFormulaMemoData = createAndUpdate.some((line) => Boolean(toFormulaMemo(typeof line.costFormulaMemo === 'string' ? line.costFormulaMemo : undefined, (line as { costFormula?: unknown }).costFormula)));
      if (hasCostFormulaMemoData && !mappingByFieldId.get('QL-COST_FORMULA_MEMO')) throw new Error('Kostprijscalculator memo aanwezig, maar AFAS veldkoppeling voor QL-COST_FORMULA_MEMO ontbreekt. Vul deze eerst in bij Regelveld koppeling AFAS.');
      const hasMarkupFormulaMemoData = createAndUpdate.some((line) => Boolean(line.markupFormulaMemo?.trim()));
      if (hasMarkupFormulaMemoData && !mappingByFieldId.get('QL-MARKUP_FORMULA_MEMO')) throw new Error('Opslagformule memo aanwezig, maar AFAS veldkoppeling voor QL-MARKUP_FORMULA_MEMO ontbreekt. Vul deze eerst in bij Regelveld koppeling AFAS.');
      const lineTypesByCode = await fetchItemLineTypesByCode(auth);
      const existingLines = await fetchExistingAfasLineIdentities(projectId, auth);
      const createGroups = new Map<string, Array<{ action: QuotationLineMutationAction; fields: Record<string, unknown> }>>();
      create.forEach((line) => {
        const quotationId = line.quotationId?.trim();
        if (!quotationId) throw new Error('Nieuwe regel mist quotationId.');
        const mutation = { action: 'insert' as const, fields: toAfasLineFields(line, resolveLineType(line, lineTypesByCode), mappingByFieldId) };
        const group = createGroups.get(quotationId) ?? [];
        group.push(mutation);
        createGroups.set(quotationId, group);
      });
      const updateGroups = new Map<string, Array<{ action: QuotationLineMutationAction; fields: Record<string, unknown> }>>();
      update.forEach((line) => {
        const quotationId = line.quotationId?.trim();
        if (!quotationId) throw new Error('Bijwerken van regel mist quotationId.');
        const identity = resolveExistingIdentityByMutation(line, existingLines);
        const rawLineId = resolveAfasGuLi(line.id, identity);
        if (!isProbablyAfasGuid(rawLineId)) throw new Error(`Regel ${line.id ?? '(onbekend)'} mist een geldige AFAS GuLi. Zet AFAS_FIELD_LINE_ID op GuLi en laad de regels opnieuw.`);
        const mutation = { action: 'update' as const, fields: { GuLi: rawLineId, ...toAfasLineFields(line, resolveLineType(line, lineTypesByCode), mappingByFieldId) } };
        const group = updateGroups.get(quotationId) ?? [];
        group.push(mutation);
        updateGroups.set(quotationId, group);
      });
      const deleteGroups = new Map<string, Array<{ action: QuotationLineMutationAction; fields: Record<string, unknown> }>>();
      remove.forEach((line) => {
        const identity = existingLines.byAppId.get(line.id) ?? (() => {
          const parsed = parseAppLineIdParts(line.id);
          if (!parsed) return undefined;
          return existingLines.byLookupKey.get(buildExistingLineLookupKey({ quotationId: parsed.quotationId, stageId: parsed.stageId || 'NO_STAGE', order: sanitizeNumber(parsed.rawLineId), itemCode: parsed.itemCode || 'LINE' }));
        })();
        const quotationId = identity?.quotationId?.trim();
        const rawLineId = resolveAfasGuLi(line.id, identity);
        if (!quotationId) throw new Error(`Te verwijderen regel ${line.id} is niet gevonden in AFAS.`);
        if (!isProbablyAfasGuid(rawLineId)) throw new Error(`Regel ${line.id} mist een geldige AFAS GuLi. Zet AFAS_FIELD_LINE_ID op GuLi en laad de regels opnieuw.`);
        const mutation = { action: 'delete' as const, fields: { GuLi: rawLineId } };
        const group = deleteGroups.get(quotationId) ?? [];
        group.push(mutation);
        deleteGroups.set(quotationId, group);
      });
      for (const [quotationId, mutations] of createGroups) for (const mutation of mutations) await mutateAfasQuotationLine(quotationId, mutation, auth);
      for (const [quotationId, mutations] of updateGroups) for (const mutation of mutations) await mutateAfasQuotationLine(quotationId, mutation, auth);
      for (const [quotationId, mutations] of deleteGroups) for (const mutation of mutations) await mutateAfasQuotationLine(quotationId, mutation, auth);
      await verifyUpdatedLineOrders(projectId, update, auth);
      return res.json({ ok: true });
    } catch (error) {
      return res.status(502).send((error as Error).message);
    }
  },
  getItems: async (req, res) => {
    const query = typeof req.query.query === 'string' ? req.query.query.trim().toLowerCase() : '';
    try {
      const auth = await resolveAfasAuth(req);
      const rows = await fetchConnectorRows(afasConfig, ensureConnector('items'), undefined, auth);
      const items = rows.map(mapAfasItem).filter((item) => !query || item.code.toLowerCase().includes(query) || item.description.toLowerCase().includes(query));
      return res.json(items.slice(0, 15));
    } catch (error) {
      return res.status(502).send((error as Error).message);
    }
  },
  getCreditors: async (req, res) => {
    const query = typeof req.query.query === 'string' ? req.query.query.trim().toLowerCase() : '';
    try {
      const auth = await resolveAfasAuth(req);
      const creditors = await fetchAfasCreditors(auth);
      const filtered = creditors.filter((creditor) => creditor.id && creditor.name).filter((creditor) => !query || creditor.id.toLowerCase().includes(query) || creditor.name.toLowerCase().includes(query));
      return res.json(filtered.slice(0, 20));
    } catch (error) {
      return res.status(502).send((error as Error).message);
    }
  },
  getAfasMetainfo: async (_req, res) => {
    try {
      return res.json({ ok: true, payload: await fetchAfasMetainfo(afasConfig) });
    } catch (error) {
      return res.status(502).json({ ok: false, error: (error as Error).message });
    }
  },
  getAfasGetConnectorMetainfo: async (req, res) => {
    try {
      const connector = paramText(req.params.connector);
      return res.json({ ok: true, connector, payload: await fetchAfasGetConnectorMetainfo(afasConfig, connector) });
    } catch (error) {
      return res.status(502).json({ ok: false, connector: paramText(req.params.connector), error: (error as Error).message });
    }
  },
  getAfasProjectsPreview: async (_req, res) => {
    try {
      const connector = ensureConnector('projects');
      const rows = await fetchConnectorRows(afasConfig, connector);
      const mapped = afasConfig.fields.project.id && afasConfig.fields.project.name ? rows.map(mapAfasProject) : [];
      return res.json({ ok: true, connector, configuredFields: afasConfig.fields.project, rowCount: rows.length, rawRows: rows, mappedRows: mapped });
    } catch (error) {
      return res.status(502).json({ ok: false, error: (error as Error).message, connector: afasConfig.connectors.projects, configuredFields: afasConfig.fields.project });
    }
  },
});

/* legacy inline routes retained for reference

app.get('/api/afas/status', async (_req, res) => {
  try {
    const probe = await probeAfas(afasConfig);
    return res.json({
      ok: true,
      mode: 'afas',
      environmentId: afasConfig.environmentId,
      environmentType: afasConfig.environmentType,
      connectors: afasConfig.connectors,
      probe,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      mode: 'afas',
      environmentId: afasConfig.environmentId,
      environmentType: afasConfig.environmentType,
      connectors: afasConfig.connectors,
      error: (error as Error).message,
    });
  }
});

app.get('/api/afas/config', (_req, res) => {
  res.json(buildAfasConnectionConfigResponse(afasConfig));
});

app.post('/api/afas/config', async (req, res) => {
  try {
    const payload = (req.body ?? {}) as AfasConnectionInput;
    return res.json(await applyAfasConnectionInput(payload));
  } catch (error) {
    return res.status(400).send((error as Error).message);
  }
});

app.get('/api/afas/write-auth-status', async (req, res) => {
  await cleanupExpiredOAuthStates();
  res.json(await buildAfasWriteAuthStatus(req));
});

app.get('/api/bootstrap/status', async (req, res) => {
  await cleanupExpiredOAuthStates();
  res.json(await buildBootstrapStatus(req));
});

app.get('/api/app/settings', (_req, res) => {
  res.json(coreShellAppSettings);
});

app.post('/api/app/settings', (req, res) => {
  coreShellAppSettings = normalizeAppSettings(req.body as Partial<CoreShellAppSettings>);
  res.json(coreShellAppSettings);
});

app.get('/api/context/catalog', (_req, res) => {
  res.json(PARAM_ID_CATALOG);
});

app.get('/api/afas/connectors/get', (_req, res) => {
  const fields = Object.entries(afasConfig.fields.project).map(([name, fieldName]) => ({
    name,
    label: fieldName,
    type: 'string',
    required: name === 'id' || name === 'name',
  }));
  res.json([
    {
      name: afasConfig.connectors.projects || 'Projects',
      label: 'Projecten',
      description: 'Huidige projectconnector van de voorcalculatie-app.',
      fields,
      metadata: {
        connector: afasConfig.connectors.projects,
      },
    },
  ]);
});

app.get('/api/afas/connectors/update', (_req, res) => {
  res.json([]);
});

app.get('/api/afas/oauth/start-url', async (req, res) => {
  try {
    await cleanupExpiredOAuthStates();
    const oauthConfig = getAfasOAuthConfig();
    if (!oauthConfig) return res.status(400).json({ ok: false, error: 'AFAS OAuth is niet volledig geconfigureerd.' });
    const appSessionId = getRequestAppSessionId(req);
    if (!appSessionId) return res.status(400).json({ ok: false, error: 'appSessionId ontbreekt.' });
    const iframeSessionId = getRequestIframeSessionId(req) || undefined;
    const state = createOAuthStateValue();
    const codeVerifier = createPkceCodeVerifier();
    const codeChallenge = createPkceCodeChallenge(codeVerifier);
    await oauthStore.savePendingState(state, {
      appSessionId,
      iframeSessionId,
      createdAt: nowMs(),
      codeVerifier,
    });
    const url = new URL(getAfasOAuthAuthorizeUrl(afasConfig));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', oauthConfig.clientId);
    url.searchParams.set('redirect_uri', oauthConfig.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (oauthConfig.scope) url.searchParams.set('scope', oauthConfig.scope);
    return res.json({ ok: true, url: url.toString() });
  } catch (error) {
    return res.status(400).json({ ok: false, error: (error as Error).message });
  }
});

app.get('/api/afas/oauth/start', async (req, res) => {
  try {
    await cleanupExpiredOAuthStates();
    const oauthConfig = getAfasOAuthConfig();
    if (!oauthConfig) return res.status(400).send('AFAS OAuth is niet volledig geconfigureerd.');
    const appSessionId = getRequestAppSessionId(req);
    if (!appSessionId) return res.status(400).send('appSessionId ontbreekt.');
    const iframeSessionId = getRequestIframeSessionId(req) || undefined;
    const state = createOAuthStateValue();
    const codeVerifier = createPkceCodeVerifier();
    const codeChallenge = createPkceCodeChallenge(codeVerifier);
    await oauthStore.savePendingState(state, {
      appSessionId,
      iframeSessionId,
      createdAt: nowMs(),
      codeVerifier,
    });
    const url = new URL(getAfasOAuthAuthorizeUrl(afasConfig));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', oauthConfig.clientId);
    url.searchParams.set('redirect_uri', oauthConfig.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (oauthConfig.scope) url.searchParams.set('scope', oauthConfig.scope);
    return res.redirect(url.toString());
  } catch (error) {
    return res.status(400).send((error as Error).message);
  }
});

app.get('/api/afas/oauth/callback', async (req, res) => {
  try {
    await cleanupExpiredOAuthStates();
    const oauthConfig = getAfasOAuthConfig();
    if (!oauthConfig) throw new Error('AFAS OAuth is niet volledig geconfigureerd.');
    const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';
    const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
    const errorCode = typeof req.query.error === 'string' ? req.query.error.trim() : '';
    if (errorCode) throw new Error(`AFAS OAuth autorisatie afgebroken: ${errorCode}`);
    if (!state || !code) throw new Error('AFAS OAuth callback mist state of code.');
    const pending = await oauthStore.getPendingState(state);
    await oauthStore.deletePendingState(state);
    if (!pending) throw new Error('AFAS OAuth state is verlopen of onbekend.');
    if (!pending.codeVerifier) throw new Error('AFAS OAuth PKCE verifier ontbreekt. Start de login opnieuw.');

    const formPayload = new URLSearchParams();
    formPayload.set('grant_type', 'authorization_code');
    formPayload.set('code', code);
    formPayload.set('redirect_uri', oauthConfig.redirectUri);
    formPayload.set('client_id', oauthConfig.clientId);
    formPayload.set('client_secret', oauthConfig.clientSecret);
    formPayload.set('code_verifier', pending.codeVerifier);
    const tokenPayload = await exchangeAfasOAuthToken(formPayload);
    const iframeProfile = pending.iframeSessionId ? iframeSessions.get(pending.iframeSessionId) : undefined;
    const session: AfasOAuthSession = {
      appSessionId: pending.appSessionId,
      accessToken: tokenPayload.accessToken,
      refreshToken: tokenPayload.refreshToken,
      tokenType: tokenPayload.tokenType,
      scope: tokenPayload.scope,
      accessTokenExpiresAt: tokenPayload.accessTokenExpiresAt,
      userId: iframeProfile?.userId,
      displayName: iframeProfile?.displayName ?? iframeProfile?.userId,
      iframeSessionId: pending.iframeSessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await oauthStore.saveSession(session);
    res.type('html').send(renderOAuthCallbackHtml({
      ok: true,
      appSessionId: pending.appSessionId,
      message: 'AFAS OAuth-login is gelukt. Je kunt dit venster sluiten.',
    }));
  } catch (error) {
    res.status(400).type('html').send(renderOAuthCallbackHtml({
      ok: false,
      message: (error as Error).message,
    }));
  }
});

app.post('/api/afas/oauth/logout', async (req, res) => {
  const appSessionId = getRequestAppSessionId(req);
  if (!appSessionId) return res.status(400).send('appSessionId ontbreekt.');
  await oauthStore.deleteSession(appSessionId);
  return res.json({ ok: true });
});

app.get('/api/afas/metainfo', async (_req, res) => {
  try {
    return res.json({
      ok: true,
      payload: await fetchAfasMetainfo(afasConfig),
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: (error as Error).message,
    });
  }
});

app.get('/api/afas/metainfo/get/:connector', async (req, res) => {
  try {
    return res.json({
      ok: true,
      connector: req.params.connector,
      payload: await fetchAfasGetConnectorMetainfo(afasConfig, req.params.connector),
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      connector: req.params.connector,
      error: (error as Error).message,
    });
  }
});

app.get('/api/afas/projects/preview', async (_req, res) => {
  try {
    const connector = ensureConnector('projects');
    const rows = await fetchConnectorRows(afasConfig, connector);
    const mapped =
      afasConfig.fields.project.id && afasConfig.fields.project.name
        ? rows.map(mapAfasProject)
        : [];
    return res.json({
      ok: true,
      connector,
      configuredFields: afasConfig.fields.project,
      rowCount: rows.length,
      rawRows: rows,
      mappedRows: mapped,
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: (error as Error).message,
      connector: afasConfig.connectors.projects,
      configuredFields: afasConfig.fields.project,
    });
  }
});

app.get('/api/settings', (_req, res) => {
  res.json(normalizeSettings(appSettings));
});

app.post('/api/settings', (req, res) => {
  appSettings = normalizeSettings({ ...appSettings, ...(req.body as Partial<Settings>) });
  res.json(appSettings);
});

app.get('/api/core/settings', (_req, res) => {
  res.json(buildCoreSettingsResponse(normalizeSettings(appSettings)));
});

app.post('/api/core/settings', (req, res) => {
  res.json(applyCoreSettingsPayload(req.body as CoreSettingsPayload));
});

app.get('/api/iframe/session/current', async (req, res) => {
  const sessionId = getRequestIframeSessionId(req);
  if (!sessionId) return res.status(404).json({ ok: false, error: 'Sessie niet gevonden.' });
  const session = iframeSessions.get(sessionId);
  if (!session) return res.status(404).json({ ok: false, error: 'Sessie niet gevonden.' });
  const resolvedDisplayName = await resolveAfasUserDisplayName(session.userId);
  if (resolvedDisplayName && resolvedDisplayName !== session.displayName) session.displayName = resolvedDisplayName;
  session.lastSeenAt = new Date().toISOString();
  return res.json({ ok: true, session: toIframeSessionResponse(session) });
});

app.get('/api/quotation-line-field-mappings', (_req, res) => {
  res.json(buildQuotationLineFieldMappings(normalizeSettings(appSettings)));
});

app.get('/api/projects', async (req, res) => {
  try {
    const auth = await resolveAfasAuth(req);
    const projects = await fetchAfasProjects(auth);
    return res.json(projects.sort((a, b) => a.id.localeCompare(b.id, 'nl')));
  } catch (error) {
    return res.status(502).send((error as Error).message);
  }
});

app.get('/api/projects/:projectId', async (req, res) => {
  try {
    const auth = await resolveAfasAuth(req);
    return res.json(await fetchAfasProject(req.params.projectId, auth));
  } catch (error) {
    return res.status(404).send((error as Error).message);
  }
});

app.put('/api/projects/:projectId', (req, res) => {
  return afasWriteNotSupported(res);
});

app.get('/api/projects/:projectId/stages', async (req, res) => {
  try {
    const auth = await resolveAfasAuth(req);
    const stages = await fetchAfasStages(req.params.projectId, auth);
    return res.json(stages.sort((a, b) => a.order - b.order));
  } catch (error) {
    return res.status(502).send((error as Error).message);
  }
});

app.post('/api/projects/:projectId/stages', async (req, res) => {
  const body = (req.body ?? {}) as Partial<ProjectStage>;
  try {
    const auth = await resolveAfasAuth(req);
    const existingStages = await fetchAfasStages(req.params.projectId, auth);
    const code = body.code?.trim() || `F${String(existingStages.length + 1).padStart(3, '0')}`;
    const name = body.name?.trim() || `Nieuwe fase ${existingStages.length + 1}`;
    const chargeMode = sanitizeStageChargeMode(body.chargeMode);
    await createAfasProjectStage(afasConfig, {
      projectId: req.params.projectId,
      code,
      name,
      chargeMode,
    }, auth);
    const refreshedStages = await fetchAfasStages(req.params.projectId, auth);
    const createdStage =
      refreshedStages.find((stage) => stage.id === code || stage.code === code) ??
      ({
        id: code,
        projectId: req.params.projectId,
        code,
        name,
        order: Math.max(0, ...existingStages.map((stage) => stage.order)) + 1,
        chargeMode,
        phaseMarkups: {},
      } satisfies ProjectStage);
    return res.status(201).json({ ...createdStage, chargeMode });
  } catch (error) {
    return res.status(502).send((error as Error).message);
  }
});

app.put('/api/projects/:projectId/stages/:stageId', async (req, res) => {
  const body = (req.body ?? {}) as Partial<ProjectStage>;
  const name = body.name?.trim();
  if (!name) return res.status(400).send('Fasenaam ontbreekt.');
  const chargeMode = sanitizeStageChargeMode(body.chargeMode);
  try {
    const auth = await resolveAfasAuth(req);
    await updateAfasProjectStage(afasConfig, {
      projectId: req.params.projectId,
      stageCode: req.params.stageId,
      name,
      chargeMode,
    }, auth);
    const refreshedStages = await fetchAfasStages(req.params.projectId, auth);
    const updated = refreshedStages.find((stage) => stage.id === req.params.stageId || stage.code === req.params.stageId);
    if (!updated) {
      return res.json({
        id: req.params.stageId,
        projectId: req.params.projectId,
        code: req.params.stageId,
        name,
        order: 0,
        chargeMode,
        phaseMarkups: {},
      } satisfies ProjectStage);
    }
    return res.json({ ...updated, name, chargeMode });
  } catch (error) {
    return res.status(502).send((error as Error).message);
  }
});

app.get('/api/projects/:projectId/quotations', async (req, res) => {
  try {
    const auth = await resolveAfasAuth(req);
    const quotations = await fetchAfasQuotations(req.params.projectId, auth);
    return res.json(quotations.sort((a, b) => a.order - b.order));
  } catch (error) {
    return res.status(502).send((error as Error).message);
  }
});

app.post('/api/projects/:projectId/quotations', async (req, res) => {
  const body = (req.body ?? {}) as Partial<Quotation>;
  try {
    const auth = await resolveAfasAuth(req);
    const existingQuotations = await fetchAfasQuotations(req.params.projectId, auth);
    const name = body.name?.trim() || `Voorcalculatie ${existingQuotations.length + 1}`;
    await createAfasQuotation(afasConfig, {
      projectId: req.params.projectId,
      name,
    }, auth);
    const refreshedQuotations = await fetchAfasQuotations(req.params.projectId, auth);
    const createdQuotation =
      [...refreshedQuotations]
        .reverse()
        .find((quotation) => quotation.name === name || quotation.id === body.id || quotation.number === body.number) ??
      ({
        id: body.id?.trim() || '',
        projectId: req.params.projectId,
        number: body.number?.trim() || '',
        name,
        order: Math.max(0, ...existingQuotations.map((quotation) => quotation.order)) + 1,
      } satisfies Quotation);
    return res.status(201).json(createdQuotation);
  } catch (error) {
    return res.status(502).send((error as Error).message);
  }
});

app.put('/api/projects/:projectId/quotations/:quotationId', async (req, res) => {
  const body = (req.body ?? {}) as Partial<Quotation>;
  const name = body.name?.trim();
  if (!name) return res.status(400).send('Voorcalculatienaam ontbreekt.');
  try {
    const auth = await resolveAfasAuth(req);
    await updateAfasQuotation(afasConfig, {
      quotationId: req.params.quotationId,
      name,
    }, auth);
    const refreshed = await fetchAfasQuotations(req.params.projectId, auth);
    const updated = refreshed.find((quotation) => quotation.id === req.params.quotationId || quotation.number === req.params.quotationId);
    if (!updated) {
      return res.json({
        id: req.params.quotationId,
        projectId: req.params.projectId,
        number: req.params.quotationId,
        name,
        order: 0,
      } satisfies Quotation);
    }
    return res.json({ ...updated, name });
  } catch (error) {
    return res.status(502).send((error as Error).message);
  }
});

app.get('/api/projects/:projectId/quotation-lines', async (req, res) => {
  try {
    const auth = await resolveAfasAuth(req);
    const lines = await fetchAfasQuotationLines(req.params.projectId, auth);
    return res.json(
      [...lines].sort((a, b) => {
        if (a.quotationId !== b.quotationId) return a.quotationId.localeCompare(b.quotationId, 'nl');
        if (a.stageId !== b.stageId) return a.stageId.localeCompare(b.stageId, 'nl');
        if (Boolean(a.orderHasLineNo) !== Boolean(b.orderHasLineNo)) return a.orderHasLineNo ? -1 : 1;
        if (a.order !== b.order) return a.order - b.order;
        return a.id.localeCompare(b.id, 'nl');
      }),
    );
  } catch (error) {
    return res.status(502).send((error as Error).message);
  }
});

app.post('/api/projects/:projectId/quotation-lines/save', async (req, res) => {
  const projectId = req.params.projectId?.trim();
  if (!projectId) return res.status(400).send('projectId ontbreekt.');

  const body = (req.body ?? {}) as Partial<SaveQuotationLinesPayload>;
  const create = Array.isArray(body.create) ? body.create : [];
  const update = Array.isArray(body.update) ? body.update : [];
  const remove = Array.isArray(body.delete) ? body.delete : [];
  if (!create.length && !update.length && !remove.length) return res.json({ ok: true });

  try {
    const auth = await resolveAfasAuth(req);
    const settings = normalizeSettings(appSettings);
    const mappings = buildQuotationLineFieldMappings(settings);
    const mappingByFieldId = new Map(
      mappings
        .map((mapping) => [mapping.appFieldId, mapping.afasFieldId?.trim() ?? ''] as const)
        .filter(([, afasFieldId]) => Boolean(afasFieldId)),
    );
    const createAndUpdate = [...create, ...update];
    const hasQtyFormulaMemoData = createAndUpdate.some((line) =>
      Boolean(
        toFormulaMemo(
          typeof line.qtyFormulaMemo === 'string' ? line.qtyFormulaMemo : undefined,
          (line as { qtyFormula?: unknown }).qtyFormula,
        ),
      ),
    );
    if (hasQtyFormulaMemoData && !mappingByFieldId.get('QL-QTY_FORMULA_MEMO')) {
      throw new Error('Aantalformule memo aanwezig, maar AFAS veldkoppeling voor QL-QTY_FORMULA_MEMO ontbreekt. Vul deze eerst in bij Regelveld koppeling AFAS.');
    }

    const hasCostFormulaMemoData = createAndUpdate.some((line) =>
      Boolean(
        toFormulaMemo(
          typeof line.costFormulaMemo === 'string' ? line.costFormulaMemo : undefined,
          (line as { costFormula?: unknown }).costFormula,
        ),
      ),
    );
    if (hasCostFormulaMemoData && !mappingByFieldId.get('QL-COST_FORMULA_MEMO')) {
      throw new Error('Kostprijscalculator memo aanwezig, maar AFAS veldkoppeling voor QL-COST_FORMULA_MEMO ontbreekt. Vul deze eerst in bij Regelveld koppeling AFAS.');
    }
    const hasMarkupFormulaMemoData = createAndUpdate.some((line) => Boolean(line.markupFormulaMemo?.trim()));
    if (hasMarkupFormulaMemoData && !mappingByFieldId.get('QL-MARKUP_FORMULA_MEMO')) {
      throw new Error('Opslagformule memo aanwezig, maar AFAS veldkoppeling voor QL-MARKUP_FORMULA_MEMO ontbreekt. Vul deze eerst in bij Regelveld koppeling AFAS.');
    }
    const lineTypesByCode = await fetchItemLineTypesByCode(auth);
    const existingLines = await fetchExistingAfasLineIdentities(projectId, auth);

    const createGroups = new Map<string, Array<{ action: QuotationLineMutationAction; fields: Record<string, unknown> }>>();
    create.forEach((line) => {
      const quotationId = line.quotationId?.trim();
      if (!quotationId) throw new Error('Nieuwe regel mist quotationId.');
      const mutation = {
        action: 'insert' as const,
        fields: toAfasLineFields(line, resolveLineType(line, lineTypesByCode), mappingByFieldId),
      };
      const group = createGroups.get(quotationId) ?? [];
      group.push(mutation);
      createGroups.set(quotationId, group);
    });

    const updateGroups = new Map<string, Array<{ action: QuotationLineMutationAction; fields: Record<string, unknown> }>>();
    update.forEach((line) => {
      const quotationId = line.quotationId?.trim();
      if (!quotationId) throw new Error('Bijwerken van regel mist quotationId.');
      const identity = resolveExistingIdentityByMutation(line, existingLines);
      const rawLineId = resolveAfasGuLi(line.id, identity);
      if (!isProbablyAfasGuid(rawLineId)) {
        throw new Error(`Regel ${line.id ?? '(onbekend)'} mist een geldige AFAS GuLi. Zet AFAS_FIELD_LINE_ID op GuLi en laad de regels opnieuw.`);
      }
      const mutation = {
        action: 'update' as const,
        fields: {
          GuLi: rawLineId,
          ...toAfasLineFields(line, resolveLineType(line, lineTypesByCode), mappingByFieldId),
        },
      };
      const group = updateGroups.get(quotationId) ?? [];
      group.push(mutation);
      updateGroups.set(quotationId, group);
    });

    const deleteGroups = new Map<string, Array<{ action: QuotationLineMutationAction; fields: Record<string, unknown> }>>();
    remove.forEach((line) => {
      const identity = existingLines.byAppId.get(line.id) ?? (() => {
        const parsed = parseAppLineIdParts(line.id);
        if (!parsed) return undefined;
        return existingLines.byLookupKey.get(
          buildExistingLineLookupKey({
            quotationId: parsed.quotationId,
            stageId: parsed.stageId || 'NO_STAGE',
            order: sanitizeNumber(parsed.rawLineId),
            itemCode: parsed.itemCode || 'LINE',
          }),
        );
      })();
      const quotationId = identity?.quotationId?.trim();
      const rawLineId = resolveAfasGuLi(line.id, identity);
      if (!quotationId) throw new Error(`Te verwijderen regel ${line.id} is niet gevonden in AFAS.`);
      if (!isProbablyAfasGuid(rawLineId)) {
        throw new Error(`Regel ${line.id} mist een geldige AFAS GuLi. Zet AFAS_FIELD_LINE_ID op GuLi en laad de regels opnieuw.`);
      }
      const mutation = {
        action: 'delete' as const,
        fields: {
          GuLi: rawLineId,
        },
      };
      const group = deleteGroups.get(quotationId) ?? [];
      group.push(mutation);
      deleteGroups.set(quotationId, group);
    });

    for (const [quotationId, mutations] of createGroups) {
      for (const mutation of mutations) {
        await mutateAfasQuotationLine(quotationId, mutation, auth);
      }
    }
    for (const [quotationId, mutations] of updateGroups) {
      for (const mutation of mutations) {
        await mutateAfasQuotationLine(quotationId, mutation, auth);
      }
    }
    for (const [quotationId, mutations] of deleteGroups) {
      for (const mutation of mutations) {
        await mutateAfasQuotationLine(quotationId, mutation, auth);
      }
    }

    await verifyUpdatedLineOrders(projectId, update, auth);

    return res.json({ ok: true });
  } catch (error) {
    return res.status(502).send((error as Error).message);
  }
});

app.get('/api/items', async (req, res) => {
  const query = typeof req.query.query === 'string' ? req.query.query.trim().toLowerCase() : '';
  try {
    const auth = await resolveAfasAuth(req);
    const rows = await fetchConnectorRows(afasConfig, ensureConnector('items'), undefined, auth);
    const items = rows
      .map(mapAfasItem)
      .filter((item) => !query || item.code.toLowerCase().includes(query) || item.description.toLowerCase().includes(query));
    return res.json(items.slice(0, 15));
  } catch (error) {
    return res.status(502).send((error as Error).message);
  }
});

app.get('/api/creditors', async (req, res) => {
  const query = typeof req.query.query === 'string' ? req.query.query.trim().toLowerCase() : '';
  try {
    const auth = await resolveAfasAuth(req);
    const creditors = await fetchAfasCreditors(auth);
    const filtered = creditors
      .filter((creditor) => creditor.id && creditor.name)
      .filter((creditor) => !query || creditor.id.toLowerCase().includes(query) || creditor.name.toLowerCase().includes(query));
    return res.json(filtered.slice(0, 20));
  } catch (error) {
    return res.status(502).send((error as Error).message);
  }
});
*/

async function startServer() {
  resetRuntimeSecretsFromEnvironment();
  await loadAfasConfigFromKeyVault();
  // Load persisted settings after secrets/connection strings are resolved.
  await loadCoreSettings();
  await loadAppOnlySettings();
  app.listen(port, () => {
    console.log(`API draait op http://localhost:${port} (afas, oauth-store=${oauthStore.getMode()}, settings-store=${appSettingsStore.getMode()})`);
  });
}

void startServer().catch((error) => {
  console.error('Backend startup failed:', (error as Error).message);
  process.exit(1);
});
