import express from 'express';
import { DEFAULT_APP_SETTINGS } from '../settings.js';
import { AppSettings } from '../types.js';

type AppRouteDeps = {
  requireSettingsAccess: () => express.RequestHandler;
  requireTrustedBrowserContext: () => express.RequestHandler;
  disableSensitiveCaching: express.RequestHandler;
  loadAppSettings: () => Promise<AppSettings>;
  persistAppSettings: (settings: AppSettings) => Promise<AppSettings>;
};

export function registerAppRoutes(app: express.Express, deps: AppRouteDeps) {
  app.get('/api/app/settings', deps.disableSensitiveCaching, deps.requireSettingsAccess(), async (_req, res) => {
    res.json(await deps.loadAppSettings());
  });

  app.post(
    '/api/app/settings',
    deps.requireTrustedBrowserContext(),
    deps.requireSettingsAccess(),
    async (req, res) => res.json(await deps.persistAppSettings(req.body)),
  );

  app.get('/api/app/settings/schema', deps.requireSettingsAccess(), (_req, res) => {
    res.json({
      defaults: DEFAULT_APP_SETTINGS,
      fields: [
        {
          key: 'pageTitle',
          label: 'Paginatitel',
          type: 'text',
        },
        {
          key: 'emptyStateTitle',
          label: 'Leeg canvas titel',
          type: 'text',
        },
        {
          key: 'emptyStateDescription',
          label: 'Leeg canvas omschrijving',
          type: 'textarea',
        },
      ],
    });
  });
}
