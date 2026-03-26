import { DEFAULT_CORE_SETTINGS, normalizeCoreSettings } from '../core/settings';
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from '../app/settings/defaults';
import { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  core: { ...DEFAULT_CORE_SETTINGS },
  app: { ...DEFAULT_APP_SETTINGS },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeSettings(input: unknown): Settings {
  const inputRecord = isPlainObject(input) ? input : {};
  const rawCore = isPlainObject(inputRecord.core) ? inputRecord.core : inputRecord;
  const rawApp = isPlainObject(inputRecord.app) ? inputRecord.app : {};

  return {
    core: normalizeCoreSettings(rawCore),
    app: normalizeAppSettings(rawApp),
  };
}
