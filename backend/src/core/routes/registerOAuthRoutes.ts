import express from 'express';
import { AfasConfig } from '../afas.js';

type RegisterOAuthRoutesDeps = {
  afasConfigRef: () => AfasConfig;
  cleanupExpiredOAuthStates: () => Promise<void>;
  getAfasOAuthConfig: () => { clientId: string; clientSecret: string; redirectUri: string; scope?: string } | undefined;
  getRequestAppSessionId: (req: express.Request, res?: express.Response) => string;
  getRequestIframeSessionId: (req: express.Request) => string;
  peekRequestAppSessionId: (req: express.Request) => string;
  getCurrentIframeSession: (req: express.Request, options?: { touch?: boolean }) => Promise<any>;
  getRequestOrigin: (req: express.Request) => string | undefined;
  isAllowedBrowserOrigin: (origin: string) => boolean;
  getEmbedOriginFromRequest: (req: express.Request) => string | undefined;
  isAllowedAfasEmbedOrigin: (origin: string) => boolean;
  createOAuthStateValue: () => string;
  createPkceCodeVerifier: () => string;
  createPkceCodeChallenge: (codeVerifier: string) => string;
  oauthStore: {
    savePendingState: (state: string, value: any) => Promise<void>;
    getPendingState: (state: string) => Promise<any>;
    deletePendingState: (state: string) => Promise<void>;
    getSession: (appSessionId: string) => Promise<any>;
    saveSession: (session: any) => Promise<void>;
    deleteSession: (appSessionId: string) => Promise<void>;
  };
  nowMs: () => number;
  getAfasOAuthAuthorizeUrl: (config: AfasConfig) => string;
  exchangeAfasOAuthToken: (formPayload: URLSearchParams) => Promise<any>;
  iframeSessionStore: {
    getSession: (sessionId: string) => Promise<any>;
    deleteAppSessionBinding: (appSessionId: string) => Promise<void>;
  };
  getRequestState: (req: express.Request) => { browserSessionId?: string };
  setBrowserSessionCookie: (res: express.Response, sessionId: string) => void;
  renderOAuthCallbackHtml: (payload: { ok: boolean; message: string; appSessionId?: string; targetOrigin?: string }) => string;
  requireTrustedBrowserContext: (options?: { requireEmbedOrigin?: boolean }) => express.RequestHandler;
  requireIframeSession: () => express.RequestHandler;
  requireAfasAdmin: () => express.RequestHandler;
  clearBrowserSessionCookie: (res: express.Response) => void;
  clearIframeSessionCookie: (res: express.Response) => void;
  clearBootstrapUserCookie: (res: express.Response) => void;
  debugSessionFlow?: boolean;
};

export function registerOAuthRoutes(app: express.Express, deps: RegisterOAuthRoutesDeps) {
  function maskValue(value?: string) {
    const trimmed = value?.trim() || '';
    if (!trimmed) return '-';
    if (trimmed.length <= 8) return trimmed;
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }

  function debugSession(event: string, details: Record<string, unknown>) {
    if (!deps.debugSessionFlow) return;
    console.log(`[session-flow] ${event} ${JSON.stringify(details)}`);
  }

  async function createOAuthAuthorizeUrl(req: express.Request, res: express.Response) {
    await deps.cleanupExpiredOAuthStates();
    const oauthConfig = deps.getAfasOAuthConfig();
    if (!oauthConfig) throw new Error('AFAS OAuth is niet volledig geconfigureerd.');

    const appSessionId = deps.getRequestAppSessionId(req, res);
    const explicitIframeSessionId = deps.getRequestIframeSessionId(req);
    const iframeSession =
      (explicitIframeSessionId ? await deps.iframeSessionStore.getSession(explicitIframeSessionId) : undefined) ??
      res.locals.currentIframeSession ??
      (await deps.getCurrentIframeSession(req, { touch: true }));
    if (!iframeSession?.userId) {
      throw new Error('Geen actieve iFrame-sessie gevonden voor AFAS OAuth.');
    }
    const requestOrigin = deps.getRequestOrigin(req);
    if (requestOrigin && !deps.isAllowedBrowserOrigin(requestOrigin)) {
      throw new Error('Request origin niet toegestaan.');
    }
    const embedOrigin = deps.getEmbedOriginFromRequest(req);
    if (!embedOrigin || !deps.isAllowedAfasEmbedOrigin(embedOrigin)) {
      throw new Error('Embed origin niet toegestaan.');
    }
    const state = deps.createOAuthStateValue();
    const codeVerifier = deps.createPkceCodeVerifier();
    const codeChallenge = deps.createPkceCodeChallenge(codeVerifier);

    await deps.oauthStore.savePendingState(state, {
        appSessionId,
        iframeSessionId: iframeSession.sessionId,
        embedOrigin,
        browserOrigin: requestOrigin,
        createdAt: deps.nowMs(),
        codeVerifier,
      });
    debugSession('oauth.pending.save', {
      appSessionId: maskValue(appSessionId),
      iframeSessionId: maskValue(iframeSession.sessionId),
      iframeUserId: iframeSession.userId || '-',
      browserOrigin: requestOrigin || '-',
      embedOrigin: embedOrigin || '-',
    });

    const url = new URL(deps.getAfasOAuthAuthorizeUrl(deps.afasConfigRef()));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', oauthConfig.clientId);
    url.searchParams.set('redirect_uri', oauthConfig.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (oauthConfig.scope) url.searchParams.set('scope', oauthConfig.scope);
    return url.toString();
  }

  app.get('/api/afas/oauth/start-url', async (req, res) => {
    try {
      const url = await createOAuthAuthorizeUrl(req, res);
      return res.json({ ok: true, url });
    } catch (error) {
      return res.status(400).json({ ok: false, error: (error as Error).message });
    }
  });

  app.get('/api/afas/oauth/start', async (req, res) => {
    try {
      const url = await createOAuthAuthorizeUrl(req, res);
      return res.redirect(url);
    } catch (error) {
      return res.status(400).send((error as Error).message);
    }
  });

  app.get('/api/afas/oauth/callback', async (req, res) => {
    try {
      await deps.cleanupExpiredOAuthStates();
      const oauthConfig = deps.getAfasOAuthConfig();
      if (!oauthConfig) throw new Error('AFAS OAuth is niet volledig geconfigureerd.');

      const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';
      const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
      const errorCode = typeof req.query.error === 'string' ? req.query.error.trim() : '';
      debugSession('oauth.callback.enter', {
        state: maskValue(state),
        hasCode: Boolean(code),
        errorCode: errorCode || '-',
      });
      if (errorCode) throw new Error(`AFAS OAuth autorisatie afgebroken: ${errorCode}`);
      if (!state || !code) throw new Error('AFAS OAuth callback mist state of code.');

      const pending = await deps.oauthStore.getPendingState(state);
      debugSession(pending ? 'oauth.callback.pending.hit' : 'oauth.callback.pending.miss', {
        state: maskValue(state),
        appSessionId: maskValue(pending?.appSessionId),
        iframeSessionId: maskValue(pending?.iframeSessionId),
      });
      await deps.oauthStore.deletePendingState(state);
      if (!pending?.codeVerifier) {
        const existingAppSessionId = deps.peekRequestAppSessionId(req);
        const existingSession = existingAppSessionId
          ? await deps.oauthStore.getSession(existingAppSessionId)
          : undefined;
        debugSession(existingSession ? 'oauth.callback.recover.hit' : 'oauth.callback.recover.miss', {
          state: maskValue(state),
          appSessionId: maskValue(existingAppSessionId),
          oauthUserId: existingSession?.userId || '-',
          iframeSessionId: maskValue(existingSession?.iframeSessionId),
        });
        if (existingSession?.userId) {
          return res
            .set('Cache-Control', 'no-store')
            .type('html')
            .send(
              deps.renderOAuthCallbackHtml({
                ok: true,
                appSessionId: existingSession.appSessionId,
                message: 'AFAS OAuth-login is al actief. Je kunt dit venster sluiten.',
                targetOrigin: existingSession.browserOrigin,
              }).replace('__CSP_NONCE__', String(res.locals.cspNonce)),
            );
        }
        throw new Error('AFAS OAuth state is verlopen of onbekend.');
      }
      if (pending.embedOrigin && !deps.isAllowedAfasEmbedOrigin(pending.embedOrigin)) {
        throw new Error('AFAS OAuth state bevat een ongeldige embed origin.');
      }
      deps.getRequestState(req).browserSessionId = pending.appSessionId;
      deps.setBrowserSessionCookie(res, pending.appSessionId);

      const formPayload = new URLSearchParams();
      formPayload.set('grant_type', 'authorization_code');
      formPayload.set('code', code);
      formPayload.set('redirect_uri', oauthConfig.redirectUri);
      formPayload.set('client_id', oauthConfig.clientId);
      formPayload.set('client_secret', oauthConfig.clientSecret);
      formPayload.set('code_verifier', pending.codeVerifier);
      const tokenPayload = await deps.exchangeAfasOAuthToken(formPayload);

      const iframeProfile = pending.iframeSessionId ? await deps.iframeSessionStore.getSession(pending.iframeSessionId) : undefined;
      if (!iframeProfile?.userId) {
        throw new Error('AFAS OAuth callback mist een geldige iFrame-sessie.');
      }
      const nextSession = {
        appSessionId: pending.appSessionId,
        accessToken: tokenPayload.accessToken,
        refreshToken: tokenPayload.refreshToken,
        accessTokenExpiresAt: tokenPayload.accessTokenExpiresAt,
        tokenType: tokenPayload.tokenType,
        scope: tokenPayload.scope,
        userId: iframeProfile.userId,
        displayName: iframeProfile.displayName ?? iframeProfile.userId,
        iframeSessionId: pending.iframeSessionId,
        browserOrigin: pending.browserOrigin,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      debugSession('oauth.callback.saveSession', {
        appSessionId: maskValue(nextSession.appSessionId),
        iframeSessionId: maskValue(nextSession.iframeSessionId),
        iframeUserId: iframeProfile.userId || '-',
      });
      await deps.oauthStore.saveSession(nextSession);
      const persistedSession = await deps.oauthStore.getSession(pending.appSessionId);
      debugSession(persistedSession ? 'oauth.callback.persisted.hit' : 'oauth.callback.persisted.miss', {
        appSessionId: maskValue(pending.appSessionId),
        oauthUserId: persistedSession?.userId || '-',
        iframeSessionId: maskValue(persistedSession?.iframeSessionId),
      });

      return res
        .set('Cache-Control', 'no-store')
        .type('html')
        .send(
          deps.renderOAuthCallbackHtml({
            ok: true,
            appSessionId: pending.appSessionId,
            message: 'AFAS OAuth-login is gelukt. Je kunt dit venster sluiten.',
            targetOrigin: pending.browserOrigin,
          }).replace('__CSP_NONCE__', String(res.locals.cspNonce)),
        );
    } catch (error) {
      return res
        .status(400)
        .set('Cache-Control', 'no-store')
        .type('html')
        .send(
          deps.renderOAuthCallbackHtml({
            ok: false,
            message: (error as Error).message,
            targetOrigin: undefined,
          }).replace('__CSP_NONCE__', String(res.locals.cspNonce)),
        );
    }
  });

  app.post('/api/afas/oauth/logout', deps.requireTrustedBrowserContext(), deps.requireAfasAdmin(), async (req, res) => {
    const appSessionId = deps.getRequestAppSessionId(req);
    debugSession('iframe.binding.delete.oauth-logout', {
      appSessionId: maskValue(appSessionId),
    });
    await deps.oauthStore.deleteSession(appSessionId);
    await deps.iframeSessionStore.deleteAppSessionBinding(appSessionId);
    deps.clearBrowserSessionCookie(res);
    deps.clearIframeSessionCookie(res);
    deps.clearBootstrapUserCookie(res);
    res.json({ ok: true });
  });
}
