import { normalizeAppSettings } from '../app/settings.js';
import { DEFAULT_CORE_SETTINGS, normalizeCoreSettings } from '../core/settings.js';
import { CoreSettings, ContextEntitySettings } from '../core/types/index.js';
import { Settings } from './types.js';
import { AppSettings } from '../app/types.js';

export const DEFAULT_SETTINGS: Settings = {
  core: { ...DEFAULT_CORE_SETTINGS },
  app: normalizeAppSettings(),
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeSettings(input: unknown): Settings {
  const inputRecord = isPlainObject(input) ? input : {};
  const rawCore = (isPlainObject(inputRecord.core) ? inputRecord.core : inputRecord) as Partial<CoreSettings> & {
    contextEntity?: Partial<ContextEntitySettings>;
  };
  const rawApp = (isPlainObject(inputRecord.app) ? inputRecord.app : {}) as Partial<Settings['app']>;

  return {
    core: normalizeCoreSettings(rawCore),
    app: normalizeAppSettings(rawApp),
  };
}

export function mergeSettings(currentSettings: Settings, incoming: unknown): Settings {
  const inputRecord = isPlainObject(incoming) ? incoming : {};

  return normalizeSettings({
    ...currentSettings,
    ...inputRecord,
    core: {
      ...currentSettings.core,
      ...(isPlainObject(inputRecord.core) ? inputRecord.core : {}),
    },
    app: {
      ...currentSettings.app,
      ...(isPlainObject(inputRecord.app) ? inputRecord.app : {}),
    },
  });
}

export function getCoreSettings(settings: Settings): CoreSettings {
  return normalizeCoreSettings(settings.core);
}

export function getAppSettings(settings: Settings): AppSettings {
  return normalizeAppSettings(settings.app);
}

export function mergeCoreSettings(currentSettings: Settings, incoming: unknown): Settings {
  const inputRecord = isPlainObject(incoming) ? incoming : {};
  const rawCore = (isPlainObject(inputRecord.core) ? inputRecord.core : inputRecord) as Partial<CoreSettings> & {
    contextEntity?: Partial<ContextEntitySettings>;
  };

  return {
    ...currentSettings,
    core: normalizeCoreSettings({
      ...currentSettings.core,
      ...rawCore,
      contextEntity: {
        ...currentSettings.core.contextEntity,
        ...(isPlainObject(rawCore.contextEntity) ? rawCore.contextEntity : {}),
      },
    }),
  };
}

export function mergeAppSettings(currentSettings: Settings, incoming: unknown): Settings {
  const inputRecord = isPlainObject(incoming) ? incoming : {};
  const rawApp = (isPlainObject(inputRecord.app) ? inputRecord.app : inputRecord) as Partial<AppSettings>;

  return {
    ...currentSettings,
    app: normalizeAppSettings({
      ...currentSettings.app,
      ...rawApp,
    }),
  };
}
