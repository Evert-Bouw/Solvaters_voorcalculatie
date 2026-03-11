type MeasurementLineLike = {
  unit: string;
  qtyFormula?: { mode: 'm1' | 'm2' | 'm3' };
};

export const SELECTED_PROJECT_STORAGE_KEY = 'voorcalc_selected_project';

export function getLegacyMeasurementMode(unit: string): 'm1' | 'm2' | undefined {
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'm1') return 'm1';
  if (normalized === 'm2') return 'm2';
  return undefined;
}

export function getLineMeasurementMode(line: MeasurementLineLike): 'm1' | 'm2' | undefined {
  const unitMode = getLegacyMeasurementMode(line.unit);
  if (unitMode) return unitMode;
  if (line.qtyFormula?.mode === 'm1' || line.qtyFormula?.mode === 'm2') return line.qtyFormula.mode;
  return undefined;
}

export function normalizeMeasurementLine<T extends MeasurementLineLike>(line: T): T {
  const mode = getLineMeasurementMode(line);
  if (!mode) return line;
  return {
    ...line,
    unit: mode,
  };
}
