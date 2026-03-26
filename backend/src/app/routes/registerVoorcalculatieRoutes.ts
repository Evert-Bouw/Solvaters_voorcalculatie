import express from 'express';

type VoorcalculatieRouteDeps = {
  claimLock: express.RequestHandler;
  heartbeatLock: express.RequestHandler;
  releaseLock: express.RequestHandler;
  getLock: express.RequestHandler;
  getLegacySettings: express.RequestHandler;
  saveLegacySettings: express.RequestHandler;
  getQuotationLineFieldMappings: express.RequestHandler;
  getProjects: express.RequestHandler;
  getProject: express.RequestHandler;
  updateProject: express.RequestHandler;
  getStages: express.RequestHandler;
  createStage: express.RequestHandler;
  updateStage: express.RequestHandler;
  getQuotations: express.RequestHandler;
  createQuotation: express.RequestHandler;
  updateQuotation: express.RequestHandler;
  getQuotationLines: express.RequestHandler;
  saveQuotationLines: express.RequestHandler;
  getItems: express.RequestHandler;
  getCreditors: express.RequestHandler;
  getAfasMetainfo: express.RequestHandler;
  getAfasGetConnectorMetainfo: express.RequestHandler;
  getAfasProjectsPreview: express.RequestHandler;
};

export function registerVoorcalculatieRoutes(app: express.Express, deps: VoorcalculatieRouteDeps) {
  app.post('/api/locks/claim', deps.claimLock);
  app.post('/api/locks/heartbeat', deps.heartbeatLock);
  app.post('/api/locks/release', deps.releaseLock);
  app.get('/api/locks/:projectId/:quotationId', deps.getLock);

  app.get('/api/settings', deps.getLegacySettings);
  app.post('/api/settings', deps.saveLegacySettings);
  app.get('/api/quotation-line-field-mappings', deps.getQuotationLineFieldMappings);

  app.get('/api/projects', deps.getProjects);
  app.get('/api/projects/:projectId', deps.getProject);
  app.put('/api/projects/:projectId', deps.updateProject);
  app.get('/api/projects/:projectId/stages', deps.getStages);
  app.post('/api/projects/:projectId/stages', deps.createStage);
  app.put('/api/projects/:projectId/stages/:stageId', deps.updateStage);
  app.get('/api/projects/:projectId/quotations', deps.getQuotations);
  app.post('/api/projects/:projectId/quotations', deps.createQuotation);
  app.put('/api/projects/:projectId/quotations/:quotationId', deps.updateQuotation);
  app.get('/api/projects/:projectId/quotation-lines', deps.getQuotationLines);
  app.post('/api/projects/:projectId/quotation-lines/save', deps.saveQuotationLines);

  app.get('/api/items', deps.getItems);
  app.get('/api/creditors', deps.getCreditors);

  app.get('/api/afas/metainfo', deps.getAfasMetainfo);
  app.get('/api/afas/metainfo/get/:connector', deps.getAfasGetConnectorMetainfo);
  app.get('/api/afas/projects/preview', deps.getAfasProjectsPreview);
}
