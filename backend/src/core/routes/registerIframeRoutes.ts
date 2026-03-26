import express from 'express';

type RegisterIframeRoutesDeps = {
  expensiveRouteLimiter: express.RequestHandler;
  requireTrustedBrowserContext: (options?: { requireEmbedOrigin?: boolean }) => express.RequestHandler;
  requireIframeSession: () => express.RequestHandler;
  cleanupExpiredIframeState: () => Promise<void>;
  getRequestAppSessionId: (req: express.Request, res?: express.Response) => string;
  isAllowedIframeTokenUrl: (tokenUrl: string) => boolean;
  getAfasRuntimeSecretForPublicKey: (publicKey: string) => Promise<string | undefined>;
  iframeExchangeInFlight: Map<string, Promise<any>>;
  iframeSessionStore: {
    saveSession: (session: any) => Promise<void>;
    saveAppSessionBinding: (appSessionId: string, sessionId: string, expiresAt: string) => Promise<void>;
    saveCodeMapping: (code: string, sessionId: string, expiresAt: string) => Promise<void>;
    getSession: (sessionId: string) => Promise<any>;
  };
  getIframeSessionExpiresAt: (lastSeenAtIso: string) => string;
  nowMs: () => number;
  iframeCodeTtlMs: number;
  pickIframeSessionProfile: (payload: unknown, fallbackSessionId: string) => any;
  toIframeSessionResponse: (session: any) => unknown;
  getCurrentIframeSession: (req: express.Request, options?: { touch?: boolean }) => Promise<any>;
  setIframeSessionCookie: (res: express.Response, sessionId: string) => void;
  setBootstrapUserCookie: (res: express.Response, userId: string) => void;
  debugSessionFlow?: boolean;
};

export function registerIframeRoutes(app: express.Express, deps: RegisterIframeRoutesDeps) {
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

  app.use('/api/iframe/exchange', deps.expensiveRouteLimiter);
  app.post('/api/iframe/exchange', deps.requireTrustedBrowserContext({ requireEmbedOrigin: true }), async (req, res) => {
    try {
      await deps.cleanupExpiredIframeState();
      const appSessionId = deps.getRequestAppSessionId(req, res);
      const tokenUrl = typeof req.body?.tokenurl === 'string' ? req.body.tokenurl.trim() : '';
      const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
      const publicKey = typeof req.body?.publickey === 'string' ? req.body.publickey.trim() : '';
      const sessionId = typeof req.body?.sessionid === 'string' ? req.body.sessionid.trim() : '';

      if (!tokenUrl || !code || !publicKey || !sessionId) {
        return res.status(400).json({ ok: false, error: 'tokenurl, code, publickey en sessionid zijn verplicht.' });
      }
      if (!deps.isAllowedIframeTokenUrl(tokenUrl)) {
        return res.status(400).json({ ok: false, error: 'tokenurl host is niet toegestaan.' });
      }

      const secret = await deps.getAfasRuntimeSecretForPublicKey(publicKey);
      if (!secret) {
        return res.status(400).json({ ok: false, error: 'Geen secret gevonden voor opgegeven publickey.' });
      }

      const inFlight = deps.iframeExchangeInFlight.get(code);
      if (inFlight) {
        const profile = await inFlight;
        await deps.iframeSessionStore.saveAppSessionBinding(
          appSessionId,
          profile.sessionId,
          deps.getIframeSessionExpiresAt(profile.lastSeenAt),
        );
        deps.setIframeSessionCookie(res, profile.sessionId);
        deps.setBootstrapUserCookie(res, profile.userId);
        debugSession('iframe.binding.save.exchange-inflight', {
          appSessionId: maskValue(appSessionId),
          iframeSessionId: maskValue(profile.sessionId),
          iframeUserId: profile.userId || '-',
        });
        return res.json({ ok: true, session: deps.toIframeSessionResponse(profile) });
      }

      const exchangePromise = (async () => {
        const formPayload = new URLSearchParams();
        formPayload.set('code', code);
        formPayload.set('secret', secret);
        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: formPayload.toString(),
        });
        const responseText = await response.text();
        if (!response.ok) {
          throw new Error(responseText || `Token exchange mislukt (${response.status}).`);
        }

        let payload: unknown = {};
        try {
          payload = responseText ? JSON.parse(responseText) : {};
        } catch {
          payload = { raw: responseText };
        }

        const profile = deps.pickIframeSessionProfile(payload, sessionId);
        await deps.iframeSessionStore.saveSession(profile);
        await deps.iframeSessionStore.saveAppSessionBinding(
          appSessionId,
          profile.sessionId,
          deps.getIframeSessionExpiresAt(profile.lastSeenAt),
        );
        deps.setIframeSessionCookie(res, profile.sessionId);
        deps.setBootstrapUserCookie(res, profile.userId);
        debugSession('iframe.binding.save.exchange', {
          appSessionId: maskValue(appSessionId),
          iframeSessionId: maskValue(profile.sessionId),
          iframeUserId: profile.userId || '-',
        });
        await deps.iframeSessionStore.saveCodeMapping(
          code,
          profile.sessionId,
          new Date(deps.nowMs() + deps.iframeCodeTtlMs).toISOString(),
        );
        return profile;
      })();

      deps.iframeExchangeInFlight.set(code, exchangePromise);
      try {
        const profile = await exchangePromise;
        return res.json({ ok: true, session: deps.toIframeSessionResponse(profile) });
      } finally {
        deps.iframeExchangeInFlight.delete(code);
      }
    } catch (error) {
      return res.status(502).json({
        ok: false,
        error: (error as Error).message,
      });
    }
  });

  app.get('/api/iframe/session/current', deps.requireTrustedBrowserContext(), async (req, res) => {
    await deps.cleanupExpiredIframeState();
    const session = res.locals.currentIframeSession ?? (await deps.getCurrentIframeSession(req, { touch: true }));
    if (!session) return res.status(404).json({ ok: false, error: 'Sessie niet gevonden.' });
    return res.json({
      ok: true,
      session: deps.toIframeSessionResponse(session),
    });
  });

  app.get('/api/iframe/session/:sessionId', deps.requireTrustedBrowserContext(), async (req, res) => {
    const sessionId = typeof req.params.sessionId === 'string' ? req.params.sessionId.trim() : '';
    if (!sessionId) return res.status(400).json({ ok: false, error: 'sessionId ontbreekt.' });
    await deps.cleanupExpiredIframeState();
    const session = await deps.iframeSessionStore.getSession(sessionId);
    if (!session) return res.status(404).json({ ok: false, error: 'Sessie niet gevonden.' });
    return res.json({
      ok: true,
      session: deps.toIframeSessionResponse(session),
    });
  });
}
