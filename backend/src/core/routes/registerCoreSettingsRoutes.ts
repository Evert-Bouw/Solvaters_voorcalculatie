import express from 'express';
import { PARAM_ID_CATALOG } from '../config/paramIdCatalog.js';
import { CoreSettings } from '../types/index.js';

type CoreSettingsRouteDeps = {
  disableSensitiveCaching: express.RequestHandler;
  requireSettingsAccess: () => express.RequestHandler;
  requireTrustedBrowserContext: () => express.RequestHandler;
  requireKnownAfasUser: () => express.RequestHandler;
  buildBootstrapStatus: (req: express.Request) => Promise<unknown>;
  loadCoreSettings: () => Promise<CoreSettings>;
  persistCoreSettings: (settings: CoreSettings) => Promise<CoreSettings>;
  fetchContextRecord: (recordId: string, auth: any) => Promise<unknown>;
  getAfasRequestAuthForRequest: (req: express.Request) => Promise<any>;
};

export function registerCoreSettingsRoutes(app: express.Express, deps: CoreSettingsRouteDeps) {
  app.get('/api/bootstrap/status', deps.disableSensitiveCaching, async (req, res) => {
    res.json(await deps.buildBootstrapStatus(req));
  });

  app.get('/api/core/settings', deps.disableSensitiveCaching, deps.requireSettingsAccess(), async (_req, res) => {
    res.json(await deps.loadCoreSettings());
  });

  app.post(
    '/api/core/settings',
    deps.requireTrustedBrowserContext(),
    deps.requireSettingsAccess(),
    async (req, res) => res.json(await deps.persistCoreSettings(req.body)),
  );

  app.get('/api/context/catalog', deps.requireSettingsAccess(), (_req, res) => {
    res.json(PARAM_ID_CATALOG);
  });

  app.get('/api/context/:recordId', deps.requireKnownAfasUser(), async (req, res) => {
    try {
      const recordId = typeof req.params.recordId === 'string' ? req.params.recordId : '';
      const record = await deps.fetchContextRecord(recordId, await deps.getAfasRequestAuthForRequest(req));
      return res.json(record);
    } catch (error) {
      return res.status(404).send((error as Error).message);
    }
  });
}
