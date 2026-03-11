export type LengthWidthSpecCode = '0' | '1' | '2';

const SPEC_LABELS: Record<LengthWidthSpecCode, string> = {
  '0': 'mm',
  '1': 'cm',
  '2': 'm',
};

const SPEC_TO_METER_FACTOR: Record<LengthWidthSpecCode, number> = {
  '0': 0.001,
  '1': 0.01,
  '2': 1,
};

export function normalizeLengthWidthSpecCode(value?: string) {
  const normalized = value?.trim();
  if (normalized === '0' || normalized === '1' || normalized === '2') return normalized;
  return undefined;
}

export function getLengthWidthSpecLabel(code?: string, fallback?: string) {
  const normalized = normalizeLengthWidthSpecCode(code);
  if (normalized) return SPEC_LABELS[normalized];
  const trimmedFallback = fallback?.trim();
  return trimmedFallback || 'm';
}

export function getLengthWidthToMeterFactor(code?: string) {
  const normalized = normalizeLengthWidthSpecCode(code);
  if (!normalized) return 1;
  return SPEC_TO_METER_FACTOR[normalized];
}

export function getLengthWidthDecimals(code?: string) {
  const normalized = normalizeLengthWidthSpecCode(code);
  if (!normalized) return 2;
  return Number(normalized);
}

export function roundByLengthWidthSpec(value: number, code?: string) {
  const decimals = getLengthWidthDecimals(code);
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
