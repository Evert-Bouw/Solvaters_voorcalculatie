import express from 'express';
import { AfasConfig } from '../afas.js';
import { AfasConnectionInput } from '../types/index.js';

type RegisterAfasRoutesDeps = {
  afasConfigRef: () => AfasConfig;
  disableSensitiveCaching: express.RequestHandler;
  requireSettingsAccess: () => express.RequestHandler;
  requireTrustedBrowserContext: (options?: { requireEmbedOrigin?: boolean }) => express.RequestHandler;
  requireIframeSession: () => express.RequestHandler;
  requireKnownAfasUser: () => express.RequestHandler;
  expensiveRouteLimiter: express.RequestHandler;
  getAfasRequestAuthForRequest: (req: express.Request, options?: { allowOAuthWithoutIframe?: boolean }) => Promise<any>;
  probeAfasStatus: (req: express.Request) => Promise<unknown>;
  buildAfasConnectionConfigResponse: (config: AfasConfig) => unknown;
  applyAfasConnectionInput: (input: AfasConnectionInput) => Promise<unknown>;
  cleanupExpiredOAuthStates: () => Promise<void>;
  getRequestAppSessionId: (req: express.Request, res?: express.Response) => string;
  buildAfasWriteAuthStatus: (req: express.Request) => Promise<unknown>;
  buildAfasUserDebugStatus: (req: express.Request) => Promise<unknown>;
  fetchAfasGetConnectors: (config: AfasConfig, auth: any) => Promise<unknown>;
  fetchAfasUpdateConnectors: (config: AfasConfig, auth: any) => Promise<unknown>;
};

export function registerAfasRoutes(app: express.Express, deps: RegisterAfasRoutesDeps) {
  app.get('/api/afas/status', deps.disableSensitiveCaching, deps.requireSettingsAccess(), async (req, res) => {
    try {
      return res.json({
        ok: true,
        environmentId: deps.afasConfigRef().environmentId,
        environmentType: deps.afasConfigRef().environmentType,
        probe: await deps.probeAfasStatus(req),
      });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        environmentId: deps.afasConfigRef().environmentId,
        environmentType: deps.afasConfigRef().environmentType,
        error: (error as Error).message,
      });
    }
  });

  app.get('/api/afas/config', deps.disableSensitiveCaching, deps.requireSettingsAccess(), (_req, res) => {
    res.json(deps.buildAfasConnectionConfigResponse(deps.afasConfigRef()));
  });

  app.post('/api/afas/config', deps.requireTrustedBrowserContext(), deps.requireSettingsAccess(), async (req, res) => {
    try {
      return res.json(await deps.applyAfasConnectionInput((req.body ?? {}) as AfasConnectionInput));
    } catch (error) {
      return res.status(400).send((error as Error).message);
    }
  });

  app.get('/api/afas/write-auth-status', deps.disableSensitiveCaching, async (req, res) => {
    await deps.cleanupExpiredOAuthStates();
    deps.getRequestAppSessionId(req, res);
    res.json(await deps.buildAfasWriteAuthStatus(req));
  });

  app.get('/api/auth/debug', deps.disableSensitiveCaching, deps.requireKnownAfasUser(), async (req, res) => {
    try {
      return res.json(await deps.buildAfasUserDebugStatus(req));
    } catch (error) {
      return res.status(502).json({ ok: false, error: (error as Error).message });
    }
  });

  app.use('/api/afas/connectors/get', deps.expensiveRouteLimiter);
  app.get('/api/afas/connectors/get', deps.requireSettingsAccess(), async (req, res) => {
    try {
      return res.json(
        await deps.fetchAfasGetConnectors(
          deps.afasConfigRef(),
          await deps.getAfasRequestAuthForRequest(req, { allowOAuthWithoutIframe: true }),
        ),
      );
    } catch (error) {
      return res.status(502).send((error as Error).message);
    }
  });

  app.use('/api/afas/connectors/update', deps.expensiveRouteLimiter);
  app.get('/api/afas/connectors/update', deps.requireSettingsAccess(), async (req, res) => {
    try {
      return res.json(
        await deps.fetchAfasUpdateConnectors(
          deps.afasConfigRef(),
          await deps.getAfasRequestAuthForRequest(req, { allowOAuthWithoutIframe: true }),
        ),
      );
    } catch (error) {
      return res.status(502).send((error as Error).message);
    }
  });
}
