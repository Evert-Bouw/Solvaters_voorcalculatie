import { TableClient } from '@azure/data-tables';
import { createHash } from 'crypto';
import { AfasRuntimeConfig, CoreSettings, IframeSessionProfile } from '../types/index.js';
import { AppSettings } from '../../app/types.js';

export type IframeSessionStore = {
  getMode(): 'memory' | 'table';
  getSession(sessionId: string): Promise<IframeSessionProfile | undefined>;
  saveSession(session: IframeSessionProfile): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  getSessionIdByAppSession(appSessionId: string): Promise<string | undefined>;
  saveAppSessionBinding(appSessionId: string, sessionId: string, expiresAt: string): Promise<void>;
  deleteAppSessionBinding(appSessionId: string): Promise<void>;
  getSessionIdByCode(code: string): Promise<string | undefined>;
  saveCodeMapping(code: string, sessionId: string, expiresAt: string): Promise<void>;
  deleteCodeMapping(code: string): Promise<void>;
  cleanupExpired(nowMs: number): Promise<void>;
};

export type AppSettingsStore = {
  getMode(): 'memory' | 'table';
  getCoreSettings(scopeKey: string): Promise<CoreSettings | undefined>;
  saveCoreSettings(scopeKey: string, settings: CoreSettings): Promise<void>;
  getAppSettings(scopeKey: string): Promise<AppSettings | undefined>;
  saveAppSettings(scopeKey: string, settings: AppSettings): Promise<void>;
  getAfasRuntimeConfig(scopeKey: string): Promise<AfasRuntimeConfig | undefined>;
  saveAfasRuntimeConfig(scopeKey: string, config: AfasRuntimeConfig): Promise<void>;
};

type IframeSessionEntity = {
  partitionKey: string;
  rowKey: string;
  userId: string;
  personCode?: string;
  employeeId?: string;
  environmentId?: string;
  displayName?: string;
  lastSeenAt: string;
  expiresAt: string;
};

type IframeCodeEntity = {
  partitionKey: string;
  rowKey: string;
  sessionId: string;
  expiresAt: string;
};

type IframeAppSessionBindingEntity = {
  partitionKey: string;
  rowKey: string;
  sessionId: string;
  expiresAt: string;
};

type AppSettingsEntity = {
  partitionKey: string;
  rowKey: string;
  settingsJson: string;
  updatedAt: string;
};

const DEFAULT_IFRAME_TABLE_NAME = 'AfasIframeState';
const DEFAULT_SETTINGS_TABLE_NAME = 'AfasAppSettings';
const TABLE_READ_RETRY_DELAYS_MS = [30, 120];
const TABLE_CACHE_TTL_MS = 5 * 60 * 1000;

function resolveTableName(configuredName: string | undefined, defaultName: string) {
  const trimmedConfiguredName = configuredName?.trim() || '';
  return trimmedConfiguredName || defaultName;
}

function getCodeRowKey(code: string) {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { statusCode?: number; code?: string };
  return candidate.statusCode === 404 || candidate.code === 'ResourceNotFound';
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function withTableReadRetry<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; notFound: true } | { ok: false; notFound: false; error: unknown }> {
  for (let attempt = 0; attempt <= TABLE_READ_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { ok: false, notFound: true };
      }
      const delayMs = TABLE_READ_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined) {
        console.warn(`[iframe-store] ${label} failed after retries: ${formatError(error)}`);
        return { ok: false, notFound: false, error };
      }
      console.warn(`[iframe-store] ${label} transient read error, retry in ${delayMs}ms: ${formatError(error)}`);
      await sleep(delayMs);
    }
  }

  return { ok: false, notFound: false, error: new Error(`${label} failed unexpectedly`) };
}

function createMemoryIframeSessionStore(sessionTtlMs: number): IframeSessionStore {
  const sessions = new Map<string, IframeSessionProfile>();
  const appSessionToIframeSession = new Map<string, { sessionId: string; expiresAtMs: number }>();
  const codeToSession = new Map<string, { sessionId: string; expiresAtMs: number }>();

  return {
    getMode() {
      return 'memory';
    },
    async getSession(sessionId) {
      const session = sessions.get(sessionId);
      if (!session) return undefined;
      if (new Date(session.lastSeenAt).getTime() + sessionTtlMs <= Date.now()) {
        sessions.delete(sessionId);
        return undefined;
      }
      return session;
    },
    async saveSession(session) {
      sessions.set(session.sessionId, session);
    },
    async deleteSession(sessionId) {
      sessions.delete(sessionId);
    },
    async getSessionIdByAppSession(appSessionId) {
      const mapped = appSessionToIframeSession.get(appSessionId);
      if (!mapped) return undefined;
      if (mapped.expiresAtMs <= Date.now()) {
        appSessionToIframeSession.delete(appSessionId);
        return undefined;
      }
      return mapped.sessionId;
    },
    async saveAppSessionBinding(appSessionId, sessionId, expiresAt) {
      appSessionToIframeSession.set(appSessionId, {
        sessionId,
        expiresAtMs: new Date(expiresAt).getTime(),
      });
    },
    async deleteAppSessionBinding(appSessionId) {
      appSessionToIframeSession.delete(appSessionId);
    },
    async getSessionIdByCode(code) {
      const mapped = codeToSession.get(code);
      if (!mapped) return undefined;
      if (mapped.expiresAtMs <= Date.now()) {
        codeToSession.delete(code);
        return undefined;
      }
      return mapped.sessionId;
    },
    async saveCodeMapping(code, sessionId, expiresAt) {
      codeToSession.set(code, { sessionId, expiresAtMs: new Date(expiresAt).getTime() });
    },
    async deleteCodeMapping(code) {
      codeToSession.delete(code);
    },
    async cleanupExpired(nowMs) {
      for (const [sessionId, session] of sessions.entries()) {
        if (new Date(session.lastSeenAt).getTime() + sessionTtlMs <= nowMs) {
          sessions.delete(sessionId);
        }
      }
      for (const [appSessionId, mapped] of appSessionToIframeSession.entries()) {
        if (mapped.expiresAtMs <= nowMs) {
          appSessionToIframeSession.delete(appSessionId);
        }
      }
      for (const [code, mapped] of codeToSession.entries()) {
        if (mapped.expiresAtMs <= nowMs) {
          codeToSession.delete(code);
        }
      }
    },
  };
}

function createMemoryAppSettingsStore(): AppSettingsStore {
  const coreSettingsByScope = new Map<string, CoreSettings>();
  const appSettingsByScope = new Map<string, AppSettings>();
  const afasConfigByScope = new Map<string, AfasRuntimeConfig>();

  return {
    getMode() {
      return 'memory';
    },
    async getCoreSettings(scopeKey) {
      return coreSettingsByScope.get(scopeKey);
    },
    async saveCoreSettings(scopeKey, settings) {
      coreSettingsByScope.set(scopeKey, settings);
    },
    async getAppSettings(scopeKey) {
      return appSettingsByScope.get(scopeKey);
    },
    async saveAppSettings(scopeKey, settings) {
      appSettingsByScope.set(scopeKey, settings);
    },
    async getAfasRuntimeConfig(scopeKey) {
      return afasConfigByScope.get(scopeKey);
    },
    async saveAfasRuntimeConfig(scopeKey, config) {
      afasConfigByScope.set(scopeKey, config);
    },
  };
}

function createTableIframeSessionStore(
  connectionString: string,
  sessionTtlMs: number,
  tableName: string,
): IframeSessionStore {
  const table = TableClient.fromConnectionString(connectionString, tableName);
  let ensureTablePromise: Promise<void> | null = null;
  const sessionCache = new Map<string, { session: IframeSessionProfile; expiresAtMs: number }>();
  const appBindingCache = new Map<string, { sessionId: string; expiresAtMs: number }>();

  function ensureTable() {
    if (!ensureTablePromise) {
      ensureTablePromise = table.createTable().catch(() => undefined).then(() => undefined);
    }
    return ensureTablePromise;
  }

  function getCachedSession(sessionId: string) {
    const cached = sessionCache.get(sessionId);
    if (!cached) return undefined;
    if (cached.expiresAtMs <= Date.now()) {
      sessionCache.delete(sessionId);
      return undefined;
    }
    return cached.session;
  }

  function cacheSession(session: IframeSessionProfile) {
    sessionCache.set(session.sessionId, {
      session,
      expiresAtMs: new Date(session.lastSeenAt).getTime() + sessionTtlMs + TABLE_CACHE_TTL_MS,
    });
  }

  function getCachedAppBinding(appSessionId: string) {
    const cached = appBindingCache.get(appSessionId);
    if (!cached) return undefined;
    if (cached.expiresAtMs <= Date.now()) {
      appBindingCache.delete(appSessionId);
      return undefined;
    }
    return cached.sessionId;
  }

  function cacheAppBinding(appSessionId: string, sessionId: string, expiresAt: string) {
    appBindingCache.set(appSessionId, {
      sessionId,
      expiresAtMs: new Date(expiresAt).getTime() + TABLE_CACHE_TTL_MS,
    });
  }

  return {
    getMode() {
      return 'table';
    },
    async getSession(sessionId) {
      await ensureTable();
      const result = await withTableReadRetry(`getSession(${sessionId})`, () =>
        table.getEntity<IframeSessionEntity>('session', sessionId),
      );
      if (result.ok) {
        const entity = result.value;
        if (new Date(entity.expiresAt).getTime() <= Date.now()) {
          await table.deleteEntity(entity.partitionKey, entity.rowKey).catch(() => undefined);
          sessionCache.delete(sessionId);
          return undefined;
        }
        const session = {
          sessionId: entity.rowKey,
          userId: entity.userId,
          personCode: entity.personCode,
          employeeId: entity.employeeId,
          environmentId: entity.environmentId,
          displayName: entity.displayName,
          lastSeenAt: entity.lastSeenAt,
        };
        cacheSession(session);
        return session;
      }
      if (result.notFound) {
        sessionCache.delete(sessionId);
        return undefined;
      }
      const cached = getCachedSession(sessionId);
      if (cached) {
        console.warn(`[iframe-store] getSession(${sessionId}) falling back to cache.`);
        return cached;
      }
      return undefined;
    },
    async saveSession(session) {
      await ensureTable();
      const expiresAt = new Date(new Date(session.lastSeenAt).getTime() + sessionTtlMs).toISOString();
      await table.upsertEntity<IframeSessionEntity>(
        {
          partitionKey: 'session',
          rowKey: session.sessionId,
          userId: session.userId,
          personCode: session.personCode,
          employeeId: session.employeeId,
          environmentId: session.environmentId,
          displayName: session.displayName,
          lastSeenAt: session.lastSeenAt,
          expiresAt,
        },
        'Replace',
      );
      cacheSession(session);
    },
    async deleteSession(sessionId) {
      await ensureTable();
      await table.deleteEntity('session', sessionId).catch(() => undefined);
      sessionCache.delete(sessionId);
    },
    async getSessionIdByAppSession(appSessionId) {
      await ensureTable();
      const result = await withTableReadRetry(`getSessionIdByAppSession(${appSessionId})`, () =>
        table.getEntity<IframeAppSessionBindingEntity>('app', appSessionId),
      );
      if (result.ok) {
        const entity = result.value;
        if (new Date(entity.expiresAt).getTime() <= Date.now()) {
          await table.deleteEntity(entity.partitionKey, entity.rowKey).catch(() => undefined);
          appBindingCache.delete(appSessionId);
          return undefined;
        }
        const sessionId = entity.sessionId?.trim() || undefined;
        if (sessionId) {
          cacheAppBinding(appSessionId, sessionId, entity.expiresAt);
        }
        return sessionId;
      }
      if (result.notFound) {
        appBindingCache.delete(appSessionId);
        return undefined;
      }
      const cached = getCachedAppBinding(appSessionId);
      if (cached) {
        console.warn(`[iframe-store] getSessionIdByAppSession(${appSessionId}) falling back to cache.`);
        return cached;
      }
      return undefined;
    },
    async saveAppSessionBinding(appSessionId, sessionId, expiresAt) {
      await ensureTable();
      await table.upsertEntity<IframeAppSessionBindingEntity>(
        {
          partitionKey: 'app',
          rowKey: appSessionId,
          sessionId,
          expiresAt,
        },
        'Replace',
      );
      cacheAppBinding(appSessionId, sessionId, expiresAt);
    },
    async deleteAppSessionBinding(appSessionId) {
      await ensureTable();
      await table.deleteEntity('app', appSessionId).catch(() => undefined);
      appBindingCache.delete(appSessionId);
    },
    async getSessionIdByCode(code) {
      await ensureTable();
      const result = await withTableReadRetry(`getSessionIdByCode(${code})`, () =>
        table.getEntity<IframeCodeEntity>('code', getCodeRowKey(code)),
      );
      if (result.ok) {
        const entity = result.value;
        if (new Date(entity.expiresAt).getTime() <= Date.now()) {
          await table.deleteEntity(entity.partitionKey, entity.rowKey).catch(() => undefined);
          return undefined;
        }
        return entity.sessionId?.trim() || undefined;
      }
      if (result.notFound) {
        return undefined;
      }
      return undefined;
    },
    async saveCodeMapping(code, sessionId, expiresAt) {
      await ensureTable();
      await table.upsertEntity<IframeCodeEntity>(
        {
          partitionKey: 'code',
          rowKey: getCodeRowKey(code),
          sessionId,
          expiresAt,
        },
        'Replace',
      );
    },
    async deleteCodeMapping(code) {
      await ensureTable();
      await table.deleteEntity('code', getCodeRowKey(code)).catch(() => undefined);
    },
    async cleanupExpired(nowMs) {
      await ensureTable();
      const nowIso = new Date(nowMs).toISOString();
      for await (const entity of table.listEntities<
        IframeSessionEntity | IframeCodeEntity | IframeAppSessionBindingEntity
      >()) {
        if ('expiresAt' in entity && entity.expiresAt && entity.expiresAt <= nowIso) {
          await table.deleteEntity(entity.partitionKey, entity.rowKey).catch(() => undefined);
        }
      }
      for (const [sessionId, cached] of sessionCache.entries()) {
        if (cached.expiresAtMs <= nowMs) {
          sessionCache.delete(sessionId);
        }
      }
      for (const [appSessionId, cached] of appBindingCache.entries()) {
        if (cached.expiresAtMs <= nowMs) {
          appBindingCache.delete(appSessionId);
        }
      }
    },
  };
}

function createTableAppSettingsStore(connectionString: string, tableName: string): AppSettingsStore {
  const table = TableClient.fromConnectionString(connectionString, tableName);
  let ensureTablePromise: Promise<void> | null = null;

  function ensureTable() {
    if (!ensureTablePromise) {
      ensureTablePromise = table.createTable().catch(() => undefined).then(() => undefined);
    }
    return ensureTablePromise;
  }

  return {
    getMode() {
      return 'table';
    },
    async getCoreSettings(scopeKey) {
      await ensureTable();
      try {
        const entity = await table.getEntity<AppSettingsEntity>('core-settings', scopeKey);
        return JSON.parse(entity.settingsJson) as CoreSettings;
      } catch {
        return undefined;
      }
    },
    async saveCoreSettings(scopeKey, settings) {
      await ensureTable();
      await table.upsertEntity<AppSettingsEntity>(
        {
          partitionKey: 'core-settings',
          rowKey: scopeKey,
          settingsJson: JSON.stringify(settings),
          updatedAt: new Date().toISOString(),
        },
        'Replace',
      );
    },
    async getAppSettings(scopeKey) {
      await ensureTable();
      try {
        const entity = await table.getEntity<AppSettingsEntity>('app-settings', scopeKey);
        return JSON.parse(entity.settingsJson) as AppSettings;
      } catch {
        return undefined;
      }
    },
    async saveAppSettings(scopeKey, settings) {
      await ensureTable();
      await table.upsertEntity<AppSettingsEntity>(
        {
          partitionKey: 'app-settings',
          rowKey: scopeKey,
          settingsJson: JSON.stringify(settings),
          updatedAt: new Date().toISOString(),
        },
        'Replace',
      );
    },
    async getAfasRuntimeConfig(scopeKey) {
      await ensureTable();
      try {
        const entity = await table.getEntity<AppSettingsEntity>('afas-config', scopeKey);
        return JSON.parse(entity.settingsJson) as AfasRuntimeConfig;
      } catch {
        return undefined;
      }
    },
    async saveAfasRuntimeConfig(scopeKey, config) {
      await ensureTable();
      await table.upsertEntity<AppSettingsEntity>(
        {
          partitionKey: 'afas-config',
          rowKey: scopeKey,
          settingsJson: JSON.stringify(config),
          updatedAt: new Date().toISOString(),
        },
        'Replace',
      );
    },
  };
}

export function createIframeSessionStore(
  sessionTtlMs: number,
  options?: {
    connectionString?: string;
    tableName?: string;
  },
): IframeSessionStore {
  const connectionString = options?.connectionString?.trim() || process.env.AZURE_TABLE_STORAGE_CONNECTION_STRING?.trim() || '';
  if (!connectionString) return createMemoryIframeSessionStore(sessionTtlMs);

  const tableName = resolveTableName(options?.tableName || process.env.AZURE_TABLE_STORAGE_IFRAME_TABLE, DEFAULT_IFRAME_TABLE_NAME);
  return createTableIframeSessionStore(connectionString, sessionTtlMs, tableName);
}

export function createAppSettingsStore(options?: {
  connectionString?: string;
  tableName?: string;
}): AppSettingsStore {
  const connectionString = options?.connectionString?.trim() || process.env.AZURE_TABLE_STORAGE_CONNECTION_STRING?.trim() || '';
  if (!connectionString) return createMemoryAppSettingsStore();

  const tableName = resolveTableName(options?.tableName || process.env.AZURE_TABLE_STORAGE_APP_SETTINGS_TABLE, DEFAULT_SETTINGS_TABLE_NAME);
  return createTableAppSettingsStore(connectionString, tableName);
}
