import { AppSettings } from './types';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  pageTitle: 'App',
  emptyStateTitle: 'Leeg canvas',
  emptyStateDescription:
    'Deze pagina is bewust leeg. De app leest alleen de ingestelde context uit de URL en toont in de kop de code en naam van het gekozen record.',
  useContextFromParamId: true,
};

export function normalizeAppSettings(input?: Partial<AppSettings>): AppSettings {
  return {
    pageTitle:
      typeof input?.pageTitle === 'string' && input.pageTitle.trim()
        ? input.pageTitle.trim()
        : DEFAULT_APP_SETTINGS.pageTitle,
    emptyStateTitle:
      typeof input?.emptyStateTitle === 'string' && input.emptyStateTitle.trim()
        ? input.emptyStateTitle.trim()
        : DEFAULT_APP_SETTINGS.emptyStateTitle,
    emptyStateDescription:
      typeof input?.emptyStateDescription === 'string' && input.emptyStateDescription.trim()
        ? input.emptyStateDescription.trim()
        : DEFAULT_APP_SETTINGS.emptyStateDescription,
    useContextFromParamId:
      typeof input?.useContextFromParamId === 'boolean'
        ? input.useContextFromParamId
        : DEFAULT_APP_SETTINGS.useContextFromParamId,
  };
}
