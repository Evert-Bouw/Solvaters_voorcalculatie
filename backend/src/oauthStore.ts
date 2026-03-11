import { TableClient } from '@azure/data-tables';

export type PendingAfasOAuthState = {
  appSessionId: string;
  iframeSessionId?: string;
  createdAt: number;
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
  createdAt: string;
  updatedAt: string;
};

type PendingStateEntity = {
  partitionKey: string;
  rowKey: string;
  appSessionId: string;
  iframeSessionId?: string;
  createdAt: string;
  expiresAt: string;
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
  createdAt: string;
  updatedAt: string;
};

type OAuthStore = {
  getMode(): 'memory' | 'table';
  savePendingState(state: string, pending: PendingAfasOAuthState): Promise<void>;
  getPendingState(state: string): Promise<PendingAfasOAuthState | undefined>;
  deletePendingState(state: string): Promise<void>;
  cleanupExpiredPendingStates(nowMs: number): Promise<void>;
  getSession(appSessionId: string): Promise<AfasOAuthSession | undefined>;
  saveSession(session: AfasOAuthSession): Promise<void>;
  deleteSession(appSessionId: string): Promise<void>;
};

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

function createTableOAuthStore(
  connectionString: string,
  oauthStateTtlMs: number,
  stateTableName: string,
  sessionTableName: string,
): OAuthStore {
  const stateTable = TableClient.fromConnectionString(connectionString, stateTableName);
  const sessionTable = TableClient.fromConnectionString(connectionString, sessionTableName);
  let ensureTablesPromise: Promise<void> | null = null;

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
      createdAt: Number(entity.createdAt),
    };
  }

  function mapSessionEntity(entity: OAuthSessionEntity): AfasOAuthSession {
    return {
      appSessionId: entity.rowKey,
      accessToken: entity.accessToken,
      refreshToken: entity.refreshToken,
      accessTokenExpiresAt: entity.accessTokenExpiresAt,
      tokenType: entity.tokenType,
      scope: entity.scope,
      userId: entity.userId,
      displayName: entity.displayName,
      iframeSessionId: entity.iframeSessionId,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
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
        createdAt: String(pending.createdAt),
        expiresAt,
      }, 'Replace');
    },
    async getPendingState(state) {
      await ensureTables();
      try {
        const entity = await stateTable.getEntity<PendingStateEntity>('state', state);
        if (new Date(entity.expiresAt).getTime() <= Date.now()) {
          await stateTable.deleteEntity('state', state).catch(() => undefined);
          return undefined;
        }
        return mapPendingEntity(entity);
      } catch {
        return undefined;
      }
    },
    async deletePendingState(state) {
      await ensureTables();
      await stateTable.deleteEntity('state', state).catch(() => undefined);
    },
    async cleanupExpiredPendingStates(nowMs) {
      await ensureTables();
      const nowIso = new Date(nowMs).toISOString();
      for await (const entity of stateTable.listEntities<PendingStateEntity>()) {
        if (entity.expiresAt && entity.expiresAt <= nowIso) {
          await stateTable.deleteEntity(entity.partitionKey, entity.rowKey).catch(() => undefined);
        }
      }
    },
    async getSession(appSessionId) {
      await ensureTables();
      try {
        const entity = await sessionTable.getEntity<OAuthSessionEntity>('app', appSessionId);
        return mapSessionEntity(entity);
      } catch {
        return undefined;
      }
    },
    async saveSession(session) {
      await ensureTables();
      await sessionTable.upsertEntity<OAuthSessionEntity>({
        partitionKey: 'app',
        rowKey: session.appSessionId,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        accessTokenExpiresAt: session.accessTokenExpiresAt,
        tokenType: session.tokenType,
        scope: session.scope,
        userId: session.userId,
        displayName: session.displayName,
        iframeSessionId: session.iframeSessionId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }, 'Replace');
    },
    async deleteSession(appSessionId) {
      await ensureTables();
      await sessionTable.deleteEntity('app', appSessionId).catch(() => undefined);
    },
  };
}

export function createOAuthStore(oauthStateTtlMs: number): OAuthStore {
  const connectionString = process.env.AZURE_TABLE_STORAGE_CONNECTION_STRING?.trim() || '';
  const stateTableName = process.env.AZURE_TABLE_STORAGE_OAUTH_STATE_TABLE?.trim() || 'AfasOAuthState';
  const sessionTableName = process.env.AZURE_TABLE_STORAGE_OAUTH_SESSION_TABLE?.trim() || 'AfasOAuthSession';
  if (!connectionString) return createMemoryOAuthStore(oauthStateTtlMs);
  return createTableOAuthStore(connectionString, oauthStateTtlMs, stateTableName, sessionTableName);
}
