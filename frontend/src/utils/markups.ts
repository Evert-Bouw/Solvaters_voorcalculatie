import { MarkupBasis, MarkupType, MarkupValueType, Settings } from '../types';

export const ALL_MARKUPS: MarkupType[] = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'];
export const MAX_MARKUPS = 10;

const LEGACY_MARKUP_KEY_MAP: Record<string, MarkupType> = {
  UITVAL: 'M1',
  AFVAL: 'M2',
  UA: 'M3',
  Q1: 'M4',
  Q2: 'M5',
  Q3: 'M6',
  OH: 'M7',
  R: 'M8',
  W: 'M9',
  RW: 'M10',
};

export const MARKUP_LABELS: Record<MarkupType, string> = {
  M1: 'V1',
  M2: 'V2',
  M3: 'V3',
  M4: 'V4',
  M5: 'V5',
  M6: 'V6',
  M7: 'V7',
  M8: 'V8',
  M9: 'V9',
  M10: 'V10',
};

export const MARKUP_DESCRIPTIONS: Record<MarkupType, string> = {
  M1: 'Vrije opslag type 1',
  M2: 'Vrije opslag type 2',
  M3: 'Vrije opslag type 3',
  M4: 'Vrije opslag type 4',
  M5: 'Vrije opslag type 5',
  M6: 'Vrije opslag type 6',
  M7: 'Vrije opslag type 7',
  M8: 'Vrije opslag type 8',
  M9: 'Vrije opslag type 9',
  M10: 'Vrije opslag type 10',
};

export const DEFAULT_MARKUP_BASES: Record<MarkupType, MarkupBasis> = {
  M1: 'cost',
  M2: 'cost',
  M3: 'cost',
  M4: 'cost',
  M5: 'cost',
  M6: 'cost',
  M7: 'cost',
  M8: 'cost',
  M9: 'cost',
  M10: 'cost',
};

export const DEFAULT_MARKUP_VALUE_TYPES: Record<MarkupType, MarkupValueType> = {
  M1: 'percentage',
  M2: 'percentage',
  M3: 'percentage',
  M4: 'percentage',
  M5: 'percentage',
  M6: 'percentage',
  M7: 'percentage',
  M8: 'percentage',
  M9: 'percentage',
  M10: 'percentage',
};

export type ActiveMarkupConfig = {
  type: MarkupType;
  basis: MarkupBasis;
  valueType: MarkupValueType;
};

function isValidMarkupValueTypeForBasis(basis: MarkupBasis, valueType: MarkupValueType): boolean {
  if (basis === 'quantity') return valueType === 'percentage' || valueType === 'quantity';
  return valueType === 'percentage' || valueType === 'amount';
}

export function getMarkupValueTypeSuffix(valueType: MarkupValueType): string {
  if (valueType === 'percentage') return '%';
  if (valueType === 'quantity') return '#';
  return 'EUR';
}

export function getUniversalMarkupName(type: MarkupType, scope: 'line' | 'phase' | 'generic'): string {
  const idx = ALL_MARKUPS.indexOf(type) + 1;
  if (scope === 'line') return `Vrije opslag kolom ${idx}`;
  if (scope === 'phase') return `Vrije opslag regel ${idx}`;
  return `Vrije opslag type ${idx}`;
}

function normalizeMarkupType(value: unknown): MarkupType | null {
  if (typeof value !== 'string') return null;
  const normalized = ALL_MARKUPS.includes(value as MarkupType)
    ? (value as MarkupType)
    : LEGACY_MARKUP_KEY_MAP[value];
  return normalized ?? null;
}

export function normalizeMarkupOrder(order: unknown): MarkupType[] {
  const input = Array.isArray(order) ? order : [];
  const seen = new Set<MarkupType>();
  const normalized: MarkupType[] = [];
  input.forEach((entry) => {
    const type = normalizeMarkupType(entry);
    if (!type) return;
    if (seen.has(type)) return;
    seen.add(type);
    normalized.push(type);
  });
  ALL_MARKUPS.forEach((type) => {
    if (!seen.has(type)) normalized.push(type);
  });
  return normalized;
}

export function getOrderedMarkupTypes(settings: Settings): MarkupType[] {
  return normalizeMarkupOrder(settings.markupOrder);
}

export function getMarkupBasis(settings: Settings, scope: 'line' | 'phase', type: MarkupType): MarkupBasis {
  const map = scope === 'line' ? settings.lineMarkupBases : settings.phaseMarkupBases;
  return map[type] ?? DEFAULT_MARKUP_BASES[type];
}

export function getMarkupValueType(settings: Settings, scope: 'line' | 'phase', type: MarkupType): MarkupValueType {
  const basis = getMarkupBasis(settings, scope, type);
  const map = scope === 'line' ? settings.lineMarkupValueTypes : settings.phaseMarkupValueTypes;
  const configured = map[type] ?? DEFAULT_MARKUP_VALUE_TYPES[type];
  return isValidMarkupValueTypeForBasis(basis, configured) ? configured : 'percentage';
}

export function getActiveMarkupTypes(
  map: Record<MarkupType, boolean>,
  settings: Settings,
  rwCombined: boolean,
  uaCombined: boolean,
): MarkupType[] {
  return getOrderedMarkupTypes(settings).filter((type) => {
    if (!map[type]) return false;
    if (rwCombined && (type === 'M8' || type === 'M9')) return false;
    if (uaCombined && (type === 'M1' || type === 'M2')) return false;
    return true;
  });
}

export function getActiveMarkupConfigs(
  map: Record<MarkupType, boolean>,
  settings: Settings,
  scope: 'line' | 'phase',
  rwCombined: boolean,
  uaCombined: boolean,
): ActiveMarkupConfig[] {
  return getActiveMarkupTypes(map, settings, rwCombined, uaCombined).map((type) => ({
    type,
    basis: getMarkupBasis(settings, scope, type),
    valueType: getMarkupValueType(settings, scope, type),
  }));
}

export function getActiveMarkupTypesByBasis(
  map: Record<MarkupType, boolean>,
  settings: Settings,
  scope: 'line' | 'phase',
  basis: MarkupBasis,
  rwCombined: boolean,
  uaCombined: boolean,
): MarkupType[] {
  return getActiveMarkupConfigs(map, settings, scope, rwCombined, uaCombined)
    .filter((x) => x.basis === basis)
    .map((x) => x.type);
}

export function sanitizeSettings(settings: Settings): Settings {
  const normalizedOrder = normalizeMarkupOrder(settings.markupOrder);
  const lineCountRaw = Number(settings.lineMarkupCount);
  const phaseCountRaw = Number(settings.phaseMarkupCount);
  const lineMarkupCount = Number.isFinite(lineCountRaw) ? Math.max(0, Math.min(MAX_MARKUPS, Math.round(lineCountRaw))) : 0;
  const phaseMarkupCount = Number.isFinite(phaseCountRaw) ? Math.max(0, Math.min(MAX_MARKUPS, Math.round(phaseCountRaw))) : 0;

  const next: Settings = {
    ...settings,
    writeAuthMode: settings.writeAuthMode === 'oauth_user' ? 'oauth_user' : 'classic',
    columnVisibility: { ...(settings.columnVisibility ?? {}) },
    supplierColumnEnabled: Boolean(settings.supplierColumnEnabled),
    purchasePriceColumnEnabled: Boolean(settings.purchasePriceColumnEnabled),
    lineMarkupCount,
    phaseMarkupCount,
    lineMarkups: { ...settings.lineMarkups },
    phaseMarkups: { ...settings.phaseMarkups },
    markupOrder: normalizedOrder,
    lineMarkupBases: { ...DEFAULT_MARKUP_BASES, ...(settings.lineMarkupBases ?? {}) },
    lineMarkupValueTypes: { ...DEFAULT_MARKUP_VALUE_TYPES, ...(settings.lineMarkupValueTypes ?? {}) },
    phaseMarkupBases: { ...DEFAULT_MARKUP_BASES, ...(settings.phaseMarkupBases ?? {}) },
    phaseMarkupValueTypes: { ...DEFAULT_MARKUP_VALUE_TYPES, ...(settings.phaseMarkupValueTypes ?? {}) },
    lineMarkupItemCodes: { ...(settings.lineMarkupItemCodes ?? {}) },
    lineMarkupDescriptions: { ...(settings.lineMarkupDescriptions ?? {}) },
    lineMarkupAfasIds: { ...(settings.lineMarkupAfasIds ?? {}) },
    lineMarkupPreferenceValues: { ...(settings.lineMarkupPreferenceValues ?? {}) },
    quotationLineConfigurableAfasIds: { ...(settings.quotationLineConfigurableAfasIds ?? {}) },
    phaseMarkupItemCodes: { ...(settings.phaseMarkupItemCodes ?? {}) },
    phaseMarkupDescriptions: { ...(settings.phaseMarkupDescriptions ?? {}) },
    phaseMarkupAfasIds: { ...(settings.phaseMarkupAfasIds ?? {}) },
    phaseMarkupPreferenceValues: { ...(settings.phaseMarkupPreferenceValues ?? {}) },
  };

  if (next.rwCombined) {
    next.lineMarkups.M8 = false;
    next.lineMarkups.M9 = false;
    next.phaseMarkups.M8 = false;
    next.phaseMarkups.M9 = false;
  }
  if (next.uaCombined) {
    next.lineMarkups.M1 = false;
    next.lineMarkups.M2 = false;
    next.phaseMarkups.M1 = false;
    next.phaseMarkups.M2 = false;
  }

  ALL_MARKUPS.forEach((type) => {
    const lineBasis = next.lineMarkupBases[type] ?? DEFAULT_MARKUP_BASES[type];
    const lineValueType = next.lineMarkupValueTypes[type] ?? DEFAULT_MARKUP_VALUE_TYPES[type];
    const phaseBasisRaw = next.phaseMarkupBases[type] ?? DEFAULT_MARKUP_BASES[type];
    const phaseBasis = phaseBasisRaw === 'quantity' ? 'cost' : phaseBasisRaw;
    const phaseValueType = next.phaseMarkupValueTypes[type] ?? DEFAULT_MARKUP_VALUE_TYPES[type];
    if (!isValidMarkupValueTypeForBasis(lineBasis, lineValueType)) next.lineMarkupValueTypes[type] = 'percentage';
    if (phaseBasisRaw === 'quantity') next.phaseMarkupBases[type] = phaseBasis;
    if (!isValidMarkupValueTypeForBasis(phaseBasis, phaseValueType)) next.phaseMarkupValueTypes[type] = 'percentage';
    if (!next.lineMarkupItemCodes[type]?.trim()) next.lineMarkupItemCodes[type] = MARKUP_LABELS[type];
    if (!next.phaseMarkupItemCodes[type]?.trim()) next.phaseMarkupItemCodes[type] = MARKUP_LABELS[type];
    if (!next.lineMarkupDescriptions[type]?.trim()) next.lineMarkupDescriptions[type] = getUniversalMarkupName(type, 'line');
    if (!next.phaseMarkupDescriptions[type]?.trim()) next.phaseMarkupDescriptions[type] = getUniversalMarkupName(type, 'phase');
    next.lineMarkupPreferenceValues[type] = Number.isFinite(Number(next.lineMarkupPreferenceValues[type])) ? Number(next.lineMarkupPreferenceValues[type]) : 0;
    next.phaseMarkupPreferenceValues[type] = Number.isFinite(Number(next.phaseMarkupPreferenceValues[type])) ? Number(next.phaseMarkupPreferenceValues[type]) : 0;
  });
  next.lineMarkupCount = normalizedOrder.filter((type) => next.lineMarkups[type]).length;
  next.phaseMarkupCount = normalizedOrder.filter((type) => next.phaseMarkups[type]).length;
  next.columnVisibility.supplier = next.supplierColumnEnabled;
  next.columnVisibility.purchasePrice = next.purchasePriceColumnEnabled;
  return next;
}
