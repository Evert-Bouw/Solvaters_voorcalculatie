import express from 'express';
import { AfasConfig, AfasRequestAuth } from '../afas.js';
import {
  AfasOAuthSession,
  OAuthStore,
} from '../stores/oauthStore.js';
import {
  AfasUserDebugStatus,
  AfasWriteAuthStatus,
  BootstrapStatus,
  CoreSettings,
  IframeSessionProfile,
} from '../types/index.js';

type CurrentAfasUser = {
  iframeSession: IframeSessionProfile;
  userId: string;
  row: Record<string, unknown>;
  displayName: string;
};

type AuthCoreDeps = {
  coreSettingsRef: () => CoreSettings;
  afasConfigRef: () => AfasConfig;
  oauthStore: OAuthStore;
  iframeSessionStore: {
    getSessionIdByAppSession: (appSessionId: string) => Promise<string | undefined>;
    getSession: (sessionId: string) => Promise<IframeSessionProfile | undefined>;
    deleteAppSessionBinding: (appSessionId: string) => Promise<void>;
    saveSession: (session: IframeSessionProfile) => Promise<void>;
    saveAppSessionBinding: (appSessionId: string, sessionId: string, expiresAt: string) => Promise<void>;
  };
  getRequestAppSessionId: (req: express.Request, res?: express.Response) => string;
  peekRequestAppSessionId: (req: express.Request) => string | undefined;
  peekRequestIframeSessionId: (req: express.Request) => string | undefined;
  peekRequestBootstrapUserId: (req: express.Request) => string | undefined;
  getIframeSessionExpiresAt: (lastSeenAtIso: string) => string;
  userGroupsConnectorName: string;
  afasAdminRoleCode: string;
  normalizeTokenValue: (token?: string) => string | undefined;
  getAfasOAuthConfig: () => { clientId: string; clientSecret: string; redirectUri: string; scope?: string } | undefined;
  getAfasOAuthConfigState: () => Promise<{
    oauthClientIdConfigured: boolean;
    oauthClientSecretConfigured: boolean;
    keyVaultConfigured: boolean;
  }>;
  exchangeAfasOAuthToken: (formPayload: URLSearchParams) => Promise<{
    accessToken: string;
    refreshToken?: string;
    tokenType: string;
    scope?: string;
    accessTokenExpiresAt: string;
  }>;
  fetchConnectorRows: (
    config: AfasConfig,
    connector: string,
    options: {
      filterFieldId?: string;
      filterValue?: string;
      operatorType?: number;
      take?: number;
      skip?: number;
    },
    auth?: AfasRequestAuth,
  ) => Promise<Array<Record<string, unknown>>>;
  nowMs: () => number;
  iframeTokenAllowedHostSuffixes: string[];
  getBootstrapAdminUserIds: () => string[];
  debugSessionFlow: boolean;
};

function readLooseString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return undefined;
}

function normalizeComparableValue(value: string) {
  return value.trim().toLowerCase();
}

function rowContainsValue(record: Record<string, unknown>, expectedValue: string, preferredKeys?: string[]) {
  const normalizedExpected = normalizeComparableValue(expectedValue);
  if (preferredKeys?.length) {
    const preferredValue = readLooseString(record, preferredKeys);
    if (preferredValue && normalizeComparableValue(preferredValue) === normalizedExpected) {
      return true;
    }
  }

  return Object.values(record).some((value) => {
    if (value === null || value === undefined) return false;
    return normalizeComparableValue(String(value)) === normalizedExpected;
  });
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

export function createAuthCore(deps: AuthCoreDeps) {
  type RequestWithIframeCache = express.Request & {
    currentIframeSessionCache?: {
      resolved: boolean;
      session?: IframeSessionProfile;
      touched: boolean;
    };
  };

  function maskValue(value?: string) {
    const trimmed = value?.trim() || '';
    if (!trimmed) return '-';
    if (trimmed.length <= 8) return trimmed;
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }

  function debugSession(event: string, details: Record<string, unknown>) {
    if (!deps.debugSessionFlow) return;
    console.log(
      `[session-flow] ${event} ${JSON.stringify(details)}`,
    );
  }

  async function ensureAfasOAuthAccessToken(appSessionId: string) {
    const oauthConfig = deps.getAfasOAuthConfig();
    if (!oauthConfig) throw new Error('AFAS OAuth is niet volledig geconfigureerd.');
    const session = await deps.oauthStore.getSession(appSessionId);
    if (!session) throw new Error('Geen AFAS OAuth-sessie gevonden voor deze browser.');

    const expiresAtMs = new Date(session.accessTokenExpiresAt).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs - deps.nowMs() > 60_000) return session;
    if (!session.refreshToken) throw new Error('AFAS OAuth-sessie kan niet worden ververst.');

    const formPayload = new URLSearchParams();
    formPayload.set('grant_type', 'refresh_token');
    formPayload.set('refresh_token', session.refreshToken);
    formPayload.set('client_id', oauthConfig.clientId);
    formPayload.set('client_secret', oauthConfig.clientSecret);
    const refreshed = await deps.exchangeAfasOAuthToken(formPayload);

    const nextSession: AfasOAuthSession = {
      ...session,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? session.refreshToken,
      tokenType: refreshed.tokenType,
      scope: refreshed.scope ?? session.scope,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      updatedAt: new Date().toISOString(),
    };
    await deps.oauthStore.saveSession(nextSession);
    return nextSession;
  }

  async function getCurrentIframeSession(req: express.Request, options?: { touch?: boolean }) {
    const requestWithCache = req as RequestWithIframeCache;
    const cached = requestWithCache.currentIframeSessionCache;
    if (cached?.resolved) {
      if (cached.session && options?.touch && !cached.touched) {
        cached.session.lastSeenAt = new Date().toISOString();
        await deps.iframeSessionStore.saveSession(cached.session);
        const appSessionIdForTouch = deps.peekRequestAppSessionId(req);
        if (appSessionIdForTouch) {
          await deps.iframeSessionStore.saveAppSessionBinding(
            appSessionIdForTouch,
            cached.session.sessionId,
            deps.getIframeSessionExpiresAt(cached.session.lastSeenAt),
          );
        }
        cached.touched = true;
      }
      debugSession(cached.session ? 'iframe.lookup.cache-hit' : 'iframe.lookup.cache-miss', {
        appSessionId: maskValue(deps.peekRequestAppSessionId(req)),
        iframeSessionId: maskValue(cached.session?.sessionId),
        iframeUserId: cached.session?.userId || '-',
        touch: Boolean(options?.touch),
      });
      return cached.session;
    }

    const appSessionId = deps.peekRequestAppSessionId(req);
    const explicitIframeSessionId = deps.peekRequestIframeSessionId(req);
    if (explicitIframeSessionId) {
      const explicitSession = await deps.iframeSessionStore.getSession(explicitIframeSessionId);
      if (explicitSession) {
        if (appSessionId) {
          await deps.iframeSessionStore.saveAppSessionBinding(
            appSessionId,
            explicitSession.sessionId,
            deps.getIframeSessionExpiresAt(explicitSession.lastSeenAt),
          );
        }
        debugSession('iframe.lookup.explicit-hit', {
          appSessionId: maskValue(appSessionId),
          iframeSessionId: maskValue(explicitSession.sessionId),
          iframeUserId: explicitSession.userId || '-',
          touch: Boolean(options?.touch),
        });
        if (options?.touch) {
          explicitSession.lastSeenAt = new Date().toISOString();
          await deps.iframeSessionStore.saveSession(explicitSession);
          if (appSessionId) {
            await deps.iframeSessionStore.saveAppSessionBinding(
              appSessionId,
              explicitSession.sessionId,
              deps.getIframeSessionExpiresAt(explicitSession.lastSeenAt),
            );
          }
        }
        requestWithCache.currentIframeSessionCache = {
          resolved: true,
          session: explicitSession,
          touched: Boolean(options?.touch),
        };
        return explicitSession;
      }
      debugSession('iframe.lookup.explicit-miss', {
        appSessionId: maskValue(appSessionId),
        iframeSessionId: maskValue(explicitIframeSessionId),
      });
    }

    if (!appSessionId) {
      debugSession('iframe.lookup.no-app-session', {});
      requestWithCache.currentIframeSessionCache = { resolved: true, session: undefined, touched: false };
      return undefined;
    }
    let iframeSessionId = await deps.iframeSessionStore.getSessionIdByAppSession(appSessionId);
    if (!iframeSessionId) {
      const cookieIframeSessionId = deps.peekRequestIframeSessionId(req);
      if (cookieIframeSessionId) {
        const cookieSession = await deps.iframeSessionStore.getSession(cookieIframeSessionId);
        if (cookieSession) {
          await deps.iframeSessionStore.saveAppSessionBinding(
            appSessionId,
            cookieSession.sessionId,
            deps.getIframeSessionExpiresAt(cookieSession.lastSeenAt),
          );
          debugSession('iframe.binding.restore.cookie', {
            appSessionId: maskValue(appSessionId),
            iframeSessionId: maskValue(cookieSession.sessionId),
            iframeUserId: cookieSession.userId || '-',
          });
          iframeSessionId = cookieSession.sessionId;
        }
      }
    }
    if (!iframeSessionId) {
      debugSession('iframe.lookup.no-binding', {
        appSessionId: maskValue(appSessionId),
      });
      requestWithCache.currentIframeSessionCache = { resolved: true, session: undefined, touched: false };
      return undefined;
    }
    const session = await deps.iframeSessionStore.getSession(iframeSessionId);
    if (!session) {
      debugSession('iframe.binding.delete.missing-session', {
        appSessionId: maskValue(appSessionId),
        iframeSessionId: maskValue(iframeSessionId),
      });
      await deps.iframeSessionStore.deleteAppSessionBinding(appSessionId);
      requestWithCache.currentIframeSessionCache = { resolved: true, session: undefined, touched: false };
      return undefined;
    }
    debugSession('iframe.lookup.hit', {
      appSessionId: maskValue(appSessionId),
      iframeSessionId: maskValue(session.sessionId),
      iframeUserId: session.userId || '-',
      touch: Boolean(options?.touch),
    });
    if (options?.touch) {
      session.lastSeenAt = new Date().toISOString();
      await deps.iframeSessionStore.saveSession(session);
      await deps.iframeSessionStore.saveAppSessionBinding(
        appSessionId,
        session.sessionId,
        deps.getIframeSessionExpiresAt(session.lastSeenAt),
      );
    }
    requestWithCache.currentIframeSessionCache = {
      resolved: true,
      session,
      touched: Boolean(options?.touch),
    };
    return session;
  }

  async function getAfasRequestAuthForRequest(
    req: express.Request,
    options?: { iframeSession?: IframeSessionProfile; allowOAuthWithoutIframe?: boolean },
  ): Promise<AfasRequestAuth> {
    if (deps.coreSettingsRef().writeAuthMode !== 'oauth_user') {
      return { type: 'classic' };
    }

    const iframeSession = options?.iframeSession ?? (await getCurrentIframeSession(req, { touch: true }));
    const iframeUserId = iframeSession?.userId?.trim();
    if ((!iframeSession || !iframeUserId) && !options?.allowOAuthWithoutIframe) {
      throw new Error('Geen actieve iFrame-gebruiker gevonden voor AFAS OAuth.');
    }

    const appSessionId = deps.peekRequestAppSessionId(req);
    if (!appSessionId) {
      throw new Error('Geen browser-sessie gevonden voor AFAS OAuth.');
    }

    const session = await ensureAfasOAuthAccessToken(appSessionId);
    const oauthUserId = session.userId?.trim();
    if (!oauthUserId) {
      throw new Error('AFAS OAuth-sessie is niet gekoppeld aan een gebruiker.');
    }
    if (iframeUserId && normalizeComparableValue(oauthUserId) !== normalizeComparableValue(iframeUserId)) {
      throw new Error('AFAS OAuth-sessie hoort niet bij de huidige iFrame-gebruiker.');
    }

    return {
      type: 'oauth_bearer',
      accessToken: session.accessToken,
    };
  }

  async function getAfasUserByIframeSession(req: express.Request): Promise<CurrentAfasUser | undefined> {
    const iframeSession = await getCurrentIframeSession(req, { touch: true });
    const userId = iframeSession?.userId?.trim();
    if (!iframeSession || !userId) return undefined;
    let auth: AfasRequestAuth;
    try {
      auth = await getAfasRequestAuthForRequest(req, { iframeSession });
    } catch {
      return {
        iframeSession,
        userId,
        row: {},
        displayName: iframeSession.displayName || userId,
      };
    }

    const afasConfig = deps.afasConfigRef();
    let rows: Array<Record<string, unknown>>;
    try {
      rows = await deps.fetchConnectorRows(
        afasConfig,
        afasConfig.usersConnector || 'Profit_Users',
        {
          filterFieldId: afasConfig.userIdField || 'UserId',
          filterValue: userId,
          operatorType: 1,
          take: 10,
        },
        auth,
      );
    } catch {
      return {
        iframeSession,
        userId,
        row: {},
        displayName: iframeSession.displayName || userId,
      };
    }

    const userRow = rows.find((row) =>
      rowContainsValue(row, userId, [
        afasConfig.userIdField || 'UserId',
        'UserId',
        'userid',
        'usercode',
        'Gebruiker',
      ]),
    );
    if (!userRow) return undefined;

    return {
      iframeSession,
      userId,
      row: userRow,
      displayName:
        readLooseString(userRow, [
          afasConfig.userNameField || 'Description',
          'Description',
          'description',
          'Name',
          'name',
        ]) || iframeSession.displayName || userId,
    };
  }

  async function userHasAfasAdminRole(userId: string, auth: AfasRequestAuth = { type: 'classic' }) {
    const afasConfig = deps.afasConfigRef();
    const rows = await deps.fetchConnectorRows(
      afasConfig,
      deps.userGroupsConnectorName,
      {
        filterFieldId: afasConfig.userIdField || 'UserId',
        filterValue: userId,
        operatorType: 1,
        take: 200,
      },
      auth,
    );

    return rows.some((row) =>
      rowContainsValue(row, deps.afasAdminRoleCode, [
        'RoleId',
        'roleId',
        'RoleCode',
        'roleCode',
        'UserGroupId',
        'userGroupId',
        'Code',
        'code',
        'Id',
        'id',
      ]),
    );
  }

  async function buildAfasWriteAuthStatus(req: express.Request): Promise<AfasWriteAuthStatus> {
    const mode = deps.coreSettingsRef().writeAuthMode;
    const oauthConfig = deps.getAfasOAuthConfig();
    const oauthConfigState = await deps.getAfasOAuthConfigState();
    if (mode === 'classic') {
      return {
        mode,
        oauthConfigured: Boolean(oauthConfig),
        oauthClientIdConfigured: oauthConfigState.oauthClientIdConfigured,
        oauthClientSecretConfigured: oauthConfigState.oauthClientSecretConfigured,
        keyVaultConfigured: oauthConfigState.keyVaultConfigured,
        authenticated: Boolean(deps.normalizeTokenValue(deps.afasConfigRef().token)),
        message: deps.normalizeTokenValue(deps.afasConfigRef().token)
          ? 'Lezen en toekomstige mutaties kunnen via het classic token verlopen.'
          : 'Classic token ontbreekt.',
      };
    }

    const appSessionId = deps.getRequestAppSessionId(req);
    const session = appSessionId ? await deps.oauthStore.getSession(appSessionId) : undefined;
    if (!oauthConfig) {
      return {
        mode,
        oauthConfigured: false,
        oauthClientIdConfigured: oauthConfigState.oauthClientIdConfigured,
        oauthClientSecretConfigured: oauthConfigState.oauthClientSecretConfigured,
        keyVaultConfigured: oauthConfigState.keyVaultConfigured,
        authenticated: false,
        message: 'OAuth namens gebruiker is geselecteerd, maar de OAuth-configuratie is niet volledig.',
      };
    }
    if (!session) {
      return {
        mode,
        oauthConfigured: true,
        oauthClientIdConfigured: oauthConfigState.oauthClientIdConfigured,
        oauthClientSecretConfigured: oauthConfigState.oauthClientSecretConfigured,
        keyVaultConfigured: oauthConfigState.keyVaultConfigured,
        authenticated: false,
        message: 'Nog geen AFAS OAuth-sessie gekoppeld aan deze browser.',
      };
    }
    return {
      mode,
      oauthConfigured: true,
      oauthClientIdConfigured: oauthConfigState.oauthClientIdConfigured,
      oauthClientSecretConfigured: oauthConfigState.oauthClientSecretConfigured,
      keyVaultConfigured: oauthConfigState.keyVaultConfigured,
      authenticated: true,
      displayName: session.displayName,
      userId: session.userId,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      message: 'OAuth-sessie is actief.',
    };
  }

  async function getCurrentOAuthSession(req: express.Request) {
    const appSessionId = deps.peekRequestAppSessionId(req);
    if (!appSessionId) {
      debugSession('oauth.lookup.no-app-session', {});
      return undefined;
    }
    const session = await deps.oauthStore.getSession(appSessionId);
    debugSession(session ? 'oauth.lookup.hit' : 'oauth.lookup.miss', {
      appSessionId: maskValue(appSessionId),
      oauthUserId: session?.userId || '-',
      iframeSessionId: maskValue(session?.iframeSessionId),
    });
    return session;
  }

  function isBootstrapAdminUserId(userId?: string) {
    const normalizedUserId = userId?.trim().toLowerCase();
    if (!normalizedUserId) return false;
    return deps.getBootstrapAdminUserIds().includes(normalizedUserId);
  }

  async function resolveBlockedSettingsAccess(args: {
    req: express.Request;
    hasIframeSession: boolean;
    bootstrapAllowed: boolean;
  }) {
    if (args.bootstrapAllowed) return true;
    if (!args.hasIframeSession) return false;

    const user = await getAfasUserByIframeSession(args.req);
    if (!user?.userId) return false;

    try {
      return await userHasAfasAdminRole(user.userId, { type: 'classic' });
    } catch {
      return false;
    }
  }

  async function buildBootstrapStatus(req: express.Request): Promise<BootstrapStatus> {
    const writeAuthStatus = await buildAfasWriteAuthStatus(req);
    const iframeSession = await getCurrentIframeSession(req, { touch: true });
    const iframeUserId = iframeSession?.userId?.trim() || '';
    const oauthSession = await getCurrentOAuthSession(req);
    const oauthUserId = oauthSession?.userId?.trim() || '';
    const bootstrapCookieUserId = deps.peekRequestBootstrapUserId(req)?.trim() || '';
    const hasIframeSession = Boolean(iframeUserId);
    const bootstrapAllowed =
      isBootstrapAdminUserId(iframeUserId) ||
      isBootstrapAdminUserId(oauthUserId) ||
      isBootstrapAdminUserId(bootstrapCookieUserId);
    const classicConfigured = Boolean(deps.normalizeTokenValue(deps.afasConfigRef().token));
    const oauthConfigured = writeAuthStatus.oauthConfigured;
    const oauthAuthenticated = writeAuthStatus.authenticated;
    const writeAuthMode = deps.coreSettingsRef().writeAuthMode;
    const bootstrapRequired =
      (writeAuthMode === 'classic' && !classicConfigured) ||
      (writeAuthMode === 'oauth_user' && !oauthConfigured);

    debugSession('bootstrap.status', {
      appSessionId: maskValue(deps.peekRequestAppSessionId(req)),
      hasIframeSession,
      iframeUserId: iframeUserId || '-',
      oauthUserId: oauthUserId || '-',
      bootstrapCookieUserId: bootstrapCookieUserId || '-',
      writeAuthMode,
      classicConfigured,
      oauthConfigured,
      oauthAuthenticated,
      bootstrapRequired,
      bootstrapAllowed,
    });

    if (!hasIframeSession) {
      const settingsAllowed = await resolveBlockedSettingsAccess({
        req,
        hasIframeSession: false,
        bootstrapAllowed,
      });
      return {
        ready: false,
        writeAuthMode,
        blockReason: 'iframe_required',
        message: 'Deze app kan alleen vanuit een geldige AFAS iFrame-sessie worden gebruikt.',
        hasIframeSession: false,
        classicConfigured,
        oauthConfigured,
        oauthAuthenticated,
        settingsAllowed,
        bootstrapRequired,
        bootstrapAllowed,
      };
    }

    if (bootstrapRequired) {
      const settingsAllowed = await resolveBlockedSettingsAccess({
        req,
        hasIframeSession: true,
        bootstrapAllowed,
      });
      return {
        ready: false,
        writeAuthMode,
        blockReason: writeAuthMode === 'classic' ? 'classic_token_missing' : 'oauth_config_missing',
        message:
          writeAuthMode === 'classic'
            ? 'Classic authenticatie is geselecteerd, maar er is nog geen classic token actief.'
            : 'OAuth namens gebruiker is geselecteerd, maar de OAuth-configuratie is nog niet compleet.',
        hasIframeSession: true,
        iframeUserId,
        classicConfigured,
        oauthConfigured,
        oauthAuthenticated,
        settingsAllowed,
        bootstrapRequired: true,
        bootstrapAllowed,
      };
    }

    if (writeAuthMode === 'oauth_user' && !oauthAuthenticated) {
      const settingsAllowed = await resolveBlockedSettingsAccess({
        req,
        hasIframeSession: true,
        bootstrapAllowed,
      });
      return {
        ready: false,
        writeAuthMode,
        blockReason: 'oauth_login_required',
        message: 'Aanmelden via AFAS is vereist voordat deze app gebruikt kan worden.',
        hasIframeSession: true,
        iframeUserId,
        classicConfigured,
        oauthConfigured,
        oauthAuthenticated: false,
        settingsAllowed,
        bootstrapRequired: false,
        bootstrapAllowed,
      };
    }

    let settingsAllowed = bootstrapAllowed;
    try {
      const user = await getAfasUserByIframeSession(req);
      if (user) {
        const auth = await getAfasRequestAuthForRequest(req, { iframeSession: user.iframeSession });
        settingsAllowed = settingsAllowed || (await userHasAfasAdminRole(user.userId, auth));
      }
    } catch {
      settingsAllowed = settingsAllowed || false;
    }

    return {
      ready: true,
      writeAuthMode,
      blockReason: 'ready',
      message: 'De app is klaar voor gebruik.',
      hasIframeSession: true,
      iframeUserId,
      classicConfigured,
      oauthConfigured,
      oauthAuthenticated,
      settingsAllowed,
      bootstrapRequired: false,
      bootstrapAllowed,
    };
  }

  function requireKnownAfasUser() {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        const user = await getAfasUserByIframeSession(req);
        if (!user) {
          return res.status(401).json({ ok: false, error: 'Geen geldige AFAS-gebruiker gevonden voor deze sessie.' });
        }
        res.locals.currentAfasUser = user;
        return next();
      } catch (error) {
        return res.status(502).json({ ok: false, error: (error as Error).message });
      }
    };
  }

  function requireIframeSession() {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        const iframeSession = await getCurrentIframeSession(req, { touch: true });
        if (!iframeSession?.userId) {
          return res.status(401).json({ ok: false, error: 'Geen actieve iFrame-sessie gevonden.' });
        }
        res.locals.currentIframeSession = iframeSession;
        return next();
      } catch (error) {
        return res.status(502).json({ ok: false, error: (error as Error).message });
      }
    };
  }

  function requireSettingsAccess() {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        const status = await buildBootstrapStatus(req);
        if (status.settingsAllowed) {
          res.locals.bootstrapStatus = status;
          return next();
        }
        if (!status.hasIframeSession) {
          return res.status(401).json({ ok: false, error: status.message });
        }
        if (status.bootstrapRequired) {
          if (!status.bootstrapAllowed) {
            return res.status(403).json({
              ok: false,
              error: 'Deze app wacht op bootstrap-configuratie. Alleen aangewezen bootstrap-beheerders hebben toegang.',
            });
          }
          res.locals.bootstrapStatus = status;
          return next();
        }
        if (!status.settingsAllowed) {
          return res.status(403).json({ ok: false, error: 'Alleen AFAS-beheerders met rol PR-001 hebben toegang.' });
        }
        res.locals.bootstrapStatus = status;
        return next();
      } catch (error) {
        return res.status(502).json({ ok: false, error: (error as Error).message });
      }
    };
  }

  function requireAfasAdmin() {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      try {
        const user = (res.locals.currentAfasUser as CurrentAfasUser | undefined) ?? (await getAfasUserByIframeSession(req));
        if (!user) {
          return res.status(401).json({ ok: false, error: 'Geen geldige AFAS-gebruiker gevonden voor deze sessie.' });
        }
        const auth = await getAfasRequestAuthForRequest(req, { iframeSession: user.iframeSession });
        if (!(await userHasAfasAdminRole(user.userId, auth))) {
          return res.status(403).json({ ok: false, error: 'Alleen AFAS-beheerders met rol PR-001 hebben toegang.' });
        }
        res.locals.currentAfasUser = user;
        return next();
      } catch (error) {
        return res.status(502).json({ ok: false, error: (error as Error).message });
      }
    };
  }

  function disableSensitiveCaching(_req: express.Request, res: express.Response, next: express.NextFunction) {
    res.set('Cache-Control', 'no-store');
    next();
  }

  async function buildAfasUserDebugStatus(req: express.Request): Promise<AfasUserDebugStatus> {
    const knownUser = await getAfasUserByIframeSession(req);
    const iframeSession = await getCurrentIframeSession(req);
    if (!iframeSession?.userId) {
      throw new Error('Geen actieve iFrame-gebruiker gevonden.');
    }
    const auth = await getAfasRequestAuthForRequest(req, { iframeSession });

    return {
      iframeSessionId: iframeSession.sessionId,
      userId: iframeSession.userId,
      displayName: knownUser?.displayName || iframeSession.displayName || iframeSession.userId,
      existsInProfitUsers: Boolean(knownUser),
      hasAdminRole: knownUser ? await userHasAfasAdminRole(knownUser.userId, auth) : false,
      adminRoleCode: deps.afasAdminRoleCode,
      checkedAt: new Date().toISOString(),
    };
  }

  function isAllowedIframeTokenUrl(tokenUrl: string) {
    try {
      const url = new URL(tokenUrl);
      if (url.protocol !== 'https:') return false;
      const host = url.hostname.toLowerCase();
      return deps.iframeTokenAllowedHostSuffixes.some(
        (suffix) => host === suffix.slice(1) || host.endsWith(suffix),
      );
    } catch {
      return false;
    }
  }

  function pickIframeSessionProfile(payload: unknown, fallbackSessionId: string): IframeSessionProfile {
    const sessionId =
      readNestedStringByKey(payload, 'sessionid') ??
      readNestedStringByKey(payload, 'sessionId') ??
      fallbackSessionId;
    const userId =
      readNestedStringByKey(payload, 'userId') ??
      readNestedStringByKey(payload, 'userid') ??
      readNestedStringByKey(payload, 'usercode');
    if (!userId) throw new Error('AFAS sessieprofiel bevat geen userId.');

    const personCode = readNestedStringByKey(payload, 'personCode') ?? readNestedStringByKey(payload, 'personcode');
    const employeeId = readNestedStringByKey(payload, 'employeeId') ?? readNestedStringByKey(payload, 'employeeid');
    const environmentId =
      readNestedStringByKey(payload, 'environmentId') ?? readNestedStringByKey(payload, 'environmentid');
    return {
      sessionId,
      userId,
      personCode,
      employeeId,
      environmentId,
      displayName: employeeId || personCode || userId,
      lastSeenAt: new Date().toISOString(),
      raw: payload,
    };
  }

  function toIframeSessionResponse(session: IframeSessionProfile) {
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      personCode: session.personCode,
      employeeId: session.employeeId,
      environmentId: session.environmentId,
      displayName: session.displayName,
      lastSeenAt: session.lastSeenAt,
    };
  }

  return {
    getCurrentIframeSession,
    getAfasRequestAuthForRequest,
    getAfasUserByIframeSession,
    userHasAfasAdminRole,
    buildAfasWriteAuthStatus,
    buildBootstrapStatus,
    requireKnownAfasUser,
    requireIframeSession,
    requireSettingsAccess,
    requireAfasAdmin,
    disableSensitiveCaching,
    buildAfasUserDebugStatus,
    isAllowedIframeTokenUrl,
    pickIframeSessionProfile,
    toIframeSessionResponse,
  };
}
