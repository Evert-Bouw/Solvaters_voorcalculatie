import { TableClient } from '@azure/data-tables';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export type PendingAfasOAuthState = {
  appSessionId: string;
  iframeSessionId?: string;
  embedOrigin?: string;
  browserOrigin?: string;
  createdAt: number;
  codeVerifier?: string;
};

export type AfasOAuthSession = {
  appSessionId: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  tokenType: string;
  scope?: string;
  userId?: string;
  displayName?: string;
  iframeSessionId?: string;
  browserOrigin?: string;
  createdAt: string;
  updatedAt: string;
};

type PendingStateEntity = {
  partitionKey: string;
  rowKey: string;
  appSessionId: string;
  iframeSessionId?: string;
  embedOrigin?: string;
  browserOrigin?: string;
  createdAt: string;
  expiresAt: string;
  codeVerifier?: string;
};

type OAuthSessionEntity = {
  partitionKey: string;
  rowKey: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  tokenType: string;
  scope?: string;
  userId?: string;
  displayName?: string;
  iframeSessionId?: string;
  browserOrigin?: string;
  createdAt: string;
  updatedAt: string;
};

export type OAuthStore = {
  getMode(): 'memory' | 'table';
  savePendingState(state: string, pending: PendingAfasOAuthState): Promise<void>;
  getPendingState(state: string): Promise<PendingAfasOAuthState | undefined>;
  deletePendingState(state: string): Promise<void>;
  cleanupExpiredPendingStates(nowMs: number): Promise<void>;
  getSession(appSessionId: string): Promise<AfasOAuthSession | undefined>;
  saveSession(session: AfasOAuthSession): Promise<void>;
  deleteSession(appSessionId: string): Promise<void>;
};

type TokenCipher = {
  encrypt(plainText: string): string;
  decrypt(cipherText: string): string;
};

const DEFAULT_STATE_TABLE_NAME = 'AfasOAuthState';
const DEFAULT_SESSION_TABLE_NAME = 'AfasOAuthSession';
const OAUTH_TABLE_READ_RETRY_DELAYS_MS = [30, 120];
const OAUTH_CACHE_TTL_MS = 5 * 60 * 1000;

function resolveOAuthTableName(configuredName: string | undefined, defaultName: string): string {
  const trimmedConfiguredName = configuredName?.trim() || '';
  return trimmedConfiguredName || defaultName;
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
  for (let attempt = 0; attempt <= OAUTH_TABLE_READ_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { ok: false, notFound: true };
      }
      const delayMs = OAUTH_TABLE_READ_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined) {
        console.warn(`[oauth-store] ${label} failed after retries: ${formatError(error)}`);
        return { ok: false, notFound: false, error };
      }
      console.warn(`[oauth-store] ${label} transient read error, retry in ${delayMs}ms: ${formatError(error)}`);
      await sleep(delayMs);
    }
  }

  return { ok: false, notFound: false, error: new Error(`${label} failed unexpectedly`) };
}

function createMemoryOAuthStore(oauthStateTtlMs: number): OAuthStore {
  const pendingStates = new Map<string, PendingAfasOAuthState>();
  const sessions = new Map<string, AfasOAuthSession>();

  return {
    getMode() {
      return 'memory';
    },
    async savePendingState(state, pending) {
      pendingStates.set(state, pending);
    },
    async getPendingState(state) {
      const pending = pendingStates.get(state);
      if (!pending) return undefined;
      if (Date.now() - pending.createdAt > oauthStateTtlMs) {
        pendingStates.delete(state);
        return undefined;
      }
      return pending;
    },
    async deletePendingState(state) {
      pendingStates.delete(state);
    },
    async cleanupExpiredPendingStates(nowMs) {
      [...pendingStates.entries()].forEach(([state, pending]) => {
        if (nowMs - pending.createdAt > oauthStateTtlMs) pendingStates.delete(state);
      });
    },
    async getSession(appSessionId) {
      return sessions.get(appSessionId);
    },
    async saveSession(session) {
      sessions.set(session.appSessionId, session);
    },
    async deleteSession(appSessionId) {
      sessions.delete(appSessionId);
    },
  };
}

function createTokenCipher(secret: string): TokenCipher {
  const key = createHash('sha256').update(secret, 'utf8').digest();

  return {
    encrypt(plainText: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
    },
    decrypt(cipherText: string) {
      const [ivBase64, tagBase64, encryptedBase64] = cipherText.split('.');
      if (!ivBase64 || !tagBase64 || !encryptedBase64) throw new Error('Ongeldig versleuteld tokenformaat.');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivBase64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedBase64, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    },
  };
}

function createTableOAuthStore(
  connectionString: string,
  oauthStateTtlMs: number,
  stateTableName: string,
  sessionTableName: string,
  tokenCipher: TokenCipher,
): OAuthStore {
  const stateTable = TableClient.fromConnectionString(connectionString, stateTableName);
  const sessionTable = TableClient.fromConnectionString(connectionString, sessionTableName);
  let ensureTablesPromise: Promise<void> | null = null;
  const pendingStateCache = new Map<string, { value: PendingAfasOAuthState; expiresAtMs: number }>();
  const sessionCache = new Map<string, { value: AfasOAuthSession; expiresAtMs: number }>();

  function ensureTables() {
    if (!ensureTablesPromise) {
      ensureTablesPromise = Promise.all([stateTable.createTable().catch(() => undefined), sessionTable.createTable().catch(() => undefined)]).then(() => undefined);
    }
    return ensureTablesPromise;
  }

  function mapPendingEntity(entity: PendingStateEntity): PendingAfasOAuthState {
    return {
      appSessionId: entity.appSessionId,
      iframeSessionId: entity.iframeSessionId,
      embedOrigin: entity.embedOrigin,
      browserOrigin: entity.browserOrigin,
      createdAt: Number(entity.createdAt),
      codeVerifier: entity.codeVerifier,
    };
  }

  function mapSessionEntity(entity: OAuthSessionEntity): AfasOAuthSession {
    return {
      appSessionId: entity.rowKey,
      accessToken: tokenCipher.decrypt(entity.accessToken),
      refreshToken: entity.refreshToken ? tokenCipher.decrypt(entity.refreshToken) : undefined,
      accessTokenExpiresAt: entity.accessTokenExpiresAt,
      tokenType: entity.tokenType,
      scope: entity.scope,
      userId: entity.userId,
      displayName: entity.displayName,
      iframeSessionId: entity.iframeSessionId,
      browserOrigin: entity.browserOrigin,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  function getCachedPendingState(state: string) {
    const cached = pendingStateCache.get(state);
    if (!cached) return undefined;
    if (cached.expiresAtMs <= Date.now()) {
      pendingStateCache.delete(state);
      return undefined;
    }
    return cached.value;
  }

  function cachePendingState(state: string, pending: PendingAfasOAuthState) {
    pendingStateCache.set(state, {
      value: pending,
      expiresAtMs: pending.createdAt + oauthStateTtlMs + OAUTH_CACHE_TTL_MS,
    });
  }

  function getCachedSession(appSessionId: string) {
    const cached = sessionCache.get(appSessionId);
    if (!cached) return undefined;
    if (cached.expiresAtMs <= Date.now()) {
      sessionCache.delete(appSessionId);
      return undefined;
    }
    return cached.value;
  }

  function cacheSession(session: AfasOAuthSession) {
    const expiresAtMs = new Date(session.accessTokenExpiresAt).getTime();
    sessionCache.set(session.appSessionId, {
      value: session,
      expiresAtMs: (Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now()) + OAUTH_CACHE_TTL_MS,
    });
  }

  return {
    getMode() {
      return 'table';
    },
    async savePendingState(state, pending) {
      await ensureTables();
      const expiresAt = new Date(pending.createdAt + oauthStateTtlMs).toISOString();
      await stateTable.upsertEntity<PendingStateEntity>({
        partitionKey: 'state',
        rowKey: state,
        appSessionId: pending.appSessionId,
        iframeSessionId: pending.iframeSessionId,
        embedOrigin: pending.embedOrigin,
        browserOrigin: pending.browserOrigin,
        createdAt: String(pending.createdAt),
        expiresAt,
        codeVerifier: pending.codeVerifier,
      }, 'Replace');
      cachePendingState(state, pending);
    },
    async getPendingState(state) {
      await ensureTables();
      const result = await withTableReadRetry(`getPendingState(${state})`, () =>
        stateTable.getEntity<PendingStateEntity>('state', state),
      );
      if (result.ok) {
        const entity = result.value;
        if (new Date(entity.expiresAt).getTime() <= Date.now()) {
          await stateTable.deleteEntity('state', state).catch(() => undefined);
          pendingStateCache.delete(state);
          return undefined;
        }
        const pending = mapPendingEntity(entity);
        cachePendingState(state, pending);
        return pending;
      }
      if (result.notFound) {
        pendingStateCache.delete(state);
        return undefined;
      }
      const cached = getCachedPendingState(state);
      if (cached) {
        console.warn(`[oauth-store] getPendingState(${state}) falling back to cache.`);
        return cached;
      }
      return undefined;
    },
    async deletePendingState(state) {
      await ensureTables();
      await stateTable.deleteEntity('state', state).catch(() => undefined);
      pendingStateCache.delete(state);
    },
    async cleanupExpiredPendingStates(nowMs) {
      await ensureTables();
      const nowIso = new Date(nowMs).toISOString();
      for await (const entity of stateTable.listEntities<PendingStateEntity>()) {
        if (entity.expiresAt && entity.expiresAt <= nowIso) {
          await stateTable.deleteEntity(entity.partitionKey, entity.rowKey).catch(() => undefined);
        }
      }
      for (const [state, cached] of pendingStateCache.entries()) {
        if (cached.expiresAtMs <= nowMs) {
          pendingStateCache.delete(state);
        }
      }
    },
    async getSession(appSessionId) {
      await ensureTables();
      const result = await withTableReadRetry(`getSession(${appSessionId})`, () =>
        sessionTable.getEntity<OAuthSessionEntity>('app', appSessionId),
      );
      if (result.ok) {
        const session = mapSessionEntity(result.value);
        cacheSession(session);
        return session;
      }
      if (result.notFound) {
        sessionCache.delete(appSessionId);
        return undefined;
      }
      const cached = getCachedSession(appSessionId);
      if (cached) {
        console.warn(`[oauth-store] getSession(${appSessionId}) falling back to cache.`);
        return cached;
      }
      return undefined;
    },
    async saveSession(session) {
      await ensureTables();
      await sessionTable.upsertEntity<OAuthSessionEntity>({
        partitionKey: 'app',
        rowKey: session.appSessionId,
        accessToken: tokenCipher.encrypt(session.accessToken),
        refreshToken: session.refreshToken ? tokenCipher.encrypt(session.refreshToken) : undefined,
        accessTokenExpiresAt: session.accessTokenExpiresAt,
        tokenType: session.tokenType,
        scope: session.scope,
        userId: session.userId,
        displayName: session.displayName,
        iframeSessionId: session.iframeSessionId,
        browserOrigin: session.browserOrigin,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }, 'Replace');
      cacheSession(session);
    },
    async deleteSession(appSessionId) {
      await ensureTables();
      await sessionTable.deleteEntity('app', appSessionId).catch(() => undefined);
      sessionCache.delete(appSessionId);
    },
  };
}

export function createOAuthStore(
  oauthStateTtlMs: number,
  options?: {
    connectionString?: string;
    encryptionKey?: string;
    stateTableName?: string;
    sessionTableName?: string;
  },
): OAuthStore {
  const connectionString = options?.connectionString?.trim() || process.env.AZURE_TABLE_STORAGE_CONNECTION_STRING?.trim() || '';
  const stateTableName = resolveOAuthTableName(
    options?.stateTableName || process.env.AZURE_TABLE_STORAGE_OAUTH_STATE_TABLE,
    DEFAULT_STATE_TABLE_NAME,
  );
  const sessionTableName = resolveOAuthTableName(
    options?.sessionTableName || process.env.AZURE_TABLE_STORAGE_OAUTH_SESSION_TABLE,
    DEFAULT_SESSION_TABLE_NAME,
  );
  if (!connectionString) return createMemoryOAuthStore(oauthStateTtlMs);
  const encryptionKey = options?.encryptionKey?.trim() || process.env.AFAS_ENCRYPTION_KEY?.trim() || '';
  if (!encryptionKey) {
    throw new Error('AFAS_ENCRYPTION_KEY ontbreekt. Deze is verplicht zodra Azure Table Storage voor AFAS OAuth wordt gebruikt.');
  }
  return createTableOAuthStore(
    connectionString,
    oauthStateTtlMs,
    stateTableName,
    sessionTableName,
    createTokenCipher(encryptionKey),
  );
}
