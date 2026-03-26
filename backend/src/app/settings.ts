import { AppSettings } from './types.js';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  pageTitle: 'Solvaters Voorcalculatie',
  emptyStateTitle: 'Voorcalculatie',
  emptyStateDescription:
    'Deze app gebruikt de gedeelde core-basis en bouwt daar de voorcalculatie-functionaliteit bovenop.',
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
