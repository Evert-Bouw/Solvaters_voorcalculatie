import { CoreSettings, ContextEntitySettings, ThemeColors, UiThemeMode } from './types';
import { findParamIdOption } from './config/paramIdCatalog';

export const DEFAULT_CORE_SETTINGS: CoreSettings = {
  dataMode: 'afas',
  writeAuthMode: 'classic',
  contextEntity: {
    key: 'context',
    label: 'Context',
    paramId: 'PrId',
    connectorName: '',
    idField: '',
    nameField: 'Description',
    queryParamName: 'PrId',
  },
  uiThemeMode: 'standard',
  uiColors: {
    brand50: '#eff6ff',
    brand100: '#dbeafe',
    brand600: '#2563eb',
    brand700: '#1d4ed8',
    appBg: '#f1f5f9',
    panelBg: '#ffffff',
    mutedBg: '#f8fafc',
    panelBorder: '#e2e8f0',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
  },
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeCoreSettings(
  input: Partial<CoreSettings> & { contextEntity?: Partial<ContextEntitySettings> },
): CoreSettings {
  const requestedParamId =
    typeof input.contextEntity?.paramId === 'string' ? input.contextEntity.paramId.trim() : '';
  const paramIdOption =
    findParamIdOption(requestedParamId) ??
    findParamIdOption(input.contextEntity?.queryParamName) ??
    findParamIdOption(DEFAULT_CORE_SETTINGS.contextEntity.paramId);
  const label =
    typeof input.contextEntity?.label === 'string' && input.contextEntity.label.trim()
      ? input.contextEntity.label.trim()
      : paramIdOption?.description ?? DEFAULT_CORE_SETTINGS.contextEntity.label;
  const paramId = paramIdOption?.paramId ?? DEFAULT_CORE_SETTINGS.contextEntity.paramId;

  return {
    dataMode: 'afas',
    writeAuthMode: input.writeAuthMode === 'oauth_user' ? 'oauth_user' : 'classic',
    contextEntity: {
      key:
        typeof input.contextEntity?.key === 'string' && input.contextEntity.key.trim()
          ? input.contextEntity.key.trim()
          : slugify(label) || DEFAULT_CORE_SETTINGS.contextEntity.key,
      label,
      paramId,
      connectorName:
        typeof input.contextEntity?.connectorName === 'string' && input.contextEntity.connectorName.trim()
          ? input.contextEntity.connectorName.trim()
          : DEFAULT_CORE_SETTINGS.contextEntity.connectorName,
      idField:
        typeof input.contextEntity?.idField === 'string' && input.contextEntity.idField.trim()
          ? input.contextEntity.idField.trim()
          : DEFAULT_CORE_SETTINGS.contextEntity.idField,
      nameField:
        typeof input.contextEntity?.nameField === 'string' && input.contextEntity.nameField.trim()
          ? input.contextEntity.nameField.trim()
          : DEFAULT_CORE_SETTINGS.contextEntity.nameField,
      queryParamName:
        typeof input.contextEntity?.queryParamName === 'string' && input.contextEntity.queryParamName.trim()
          ? input.contextEntity.queryParamName.trim()
          : paramId,
    },
    uiThemeMode:
      input.uiThemeMode === 'standard_dark' || input.uiThemeMode === 'custom'
        ? (input.uiThemeMode as UiThemeMode)
        : 'standard',
    uiColors: {
      ...DEFAULT_CORE_SETTINGS.uiColors,
      ...(input.uiColors ?? {}),
    },
  };
}
