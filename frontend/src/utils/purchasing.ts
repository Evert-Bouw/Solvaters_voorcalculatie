import { QuotationLine } from '../types';
import { toNonNegative } from './calculations';
import { getLengthWidthDecimals, getLengthWidthSpecLabel, getLengthWidthToMeterFactor, roundByLengthWidthSpec } from './itemMeasurementSpec';
import { getLineMeasurementMode, normalizeMeasurementLine } from './measurement';

export interface PurchaseSpecGroup {
  key: string;
  label: string;
  subLabel?: string;
  totalQty: number;
  totalPieces: number;
  lineCount: number;
}

export interface PurchaseRow {
  key: string;
  sourceLineIds: string[];
  itemCode: string;
  description: string;
  unit: string;
  orderUnit: string;
  hasMeasurement: boolean;
  standardSpecLabel?: string;
  totalQty: number;
  lineCount: number;
  specGroups: PurchaseSpecGroup[];
  theoreticalPieces?: number;
  theoreticalStockLabel?: string;
  optimization?: PurchaseOptimization;
}

export interface PurchaseOptimization {
  mode: 'm1' | 'm2';
  stockLabel: string;
  orderedPieces: number;
  utilizationPct: number;
  wasteQty: number;
  planLines: string[];
}

type OptimizationSeed =
  | { mode: 'm1'; stockLength: number; totalQty: number; requests: number[] }
  | { mode: 'm2'; stockLength: number; stockWidth: number; totalQty: number; requests: Array<{ length: number; width: number }> };

const MEASURE_UNITS = new Set(['m1', 'm2']);

function normalizeUnit(unit: string) {
  return unit.trim().toLowerCase();
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatDimensionValue(value: number, decimals = 2) {
  return toNonNegative(value).toLocaleString('nl-NL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getStandardMeasurementText(line: QuotationLine, mode: 'm1' | 'm2') {
  const specLabel = getLengthWidthSpecLabel(line.measurementSpecCode, line.measurementSpec);
  const specDecimals = getLengthWidthDecimals(line.measurementSpecCode);
  const fixedLength = toNonNegative(line.measurementFixedLength ?? 0);
  const fixedWidth = toNonNegative(line.measurementFixedWidth ?? 0);
  const fixedLengthRounded = roundByLengthWidthSpec(fixedLength, line.measurementSpecCode);
  const fixedWidthRounded = roundByLengthWidthSpec(fixedWidth, line.measurementSpecCode);
  if (mode === 'm1' && fixedLength > 0) {
    return `${formatDimensionValue(fixedLengthRounded, specDecimals)} ${specLabel}`;
  }
  if (mode === 'm2' && (fixedLength > 0 || fixedWidth > 0)) {
    if (fixedLength > 0 && fixedWidth > 0) {
      return `${formatDimensionValue(fixedLengthRounded, specDecimals)} x ${formatDimensionValue(fixedWidthRounded, specDecimals)} ${specLabel}`;
    }
    if (fixedLength > 0) return `L ${formatDimensionValue(fixedLengthRounded, specDecimals)} ${specLabel}`;
    return `B ${formatDimensionValue(fixedWidthRounded, specDecimals)} ${specLabel}`;
  }
  return '';
}

function parseQtyFormula(line: QuotationLine): { mode: 'm1' | 'm2' | 'm3'; length: number; width: number; height?: number; rows?: Array<{ id: string; length: number; width?: number }> } | null {
  const normalizeRows = (mode: 'm1' | 'm2' | 'm3', rows?: Array<{ id?: string; length?: number; width?: number }>) => {
    if (mode !== 'm1' && mode !== 'm2') return undefined;
    if (!Array.isArray(rows) || !rows.length) return undefined;
    const normalized = rows.map((row, index) => ({
      id: typeof row.id === 'string' && row.id.trim() ? row.id : `${mode}-${index + 1}`,
      length: toNonNegative(Number(row.length) || 0),
      width: mode === 'm2' ? toNonNegative(Number(row.width) || 0) : 0,
    }));
    return normalized.length ? normalized : undefined;
  };
  const direct = line.qtyFormula;
  if (direct?.mode === 'm1' || direct?.mode === 'm2' || direct?.mode === 'm3') {
    return {
      mode: direct.mode,
      length: toNonNegative(Number(direct.length) || 0),
      width: toNonNegative(Number(direct.width) || 0),
      height: direct.mode === 'm3' ? toNonNegative(Number(direct.height) || 0) : undefined,
      rows: normalizeRows(direct.mode, direct.rows),
    };
  }
  const memo = line.qtyFormulaMemo?.trim();
  if (!memo) return null;
  try {
    const parsed = JSON.parse(memo) as Partial<{ mode: 'm1' | 'm2' | 'm3'; length: number; width: number; height?: number; rows?: Array<{ id?: string; length?: number; width?: number }> }>;
    if (parsed.mode !== 'm1' && parsed.mode !== 'm2' && parsed.mode !== 'm3') return null;
    return {
      mode: parsed.mode,
      length: toNonNegative(Number(parsed.length) || 0),
      width: toNonNegative(Number(parsed.width) || 0),
      height: parsed.mode === 'm3' ? toNonNegative(Number(parsed.height) || 0) : undefined,
      rows:
        parsed.mode === 'm1' || parsed.mode === 'm2'
          ? (parsed.rows ?? []).map((row, index) => ({
              id: (row?.id ?? `${parsed.mode}-${index + 1}`).toString(),
              length: toNonNegative(Number(row?.length) || 0),
              width: parsed.mode === 'm2' ? toNonNegative(Number(row?.width) || 0) : 0,
            }))
          : undefined,
    };
  } catch {
    return null;
  }
}

function getStockDimensionsInMeters(line: QuotationLine, mode: 'm1' | 'm2') {
  const factor = getLengthWidthToMeterFactor(line.measurementSpecCode);
  const length = round2(toNonNegative(line.measurementFixedLength ?? 0) * factor);
  const width = round2(toNonNegative(line.measurementFixedWidth ?? 0) * factor);
  if (mode === 'm1' && length > 0) return { length };
  if (mode === 'm2' && length > 0 && width > 0) return { length, width };
  return null;
}

function formatMeters(value: number) {
  return `${formatDimensionValue(round2(value), 2)} m`;
}

function optimizeLinearCuts(requests: number[], stockLength: number): PurchaseOptimization | undefined {
  const normalized = requests.map((value) => round2(toNonNegative(value))).filter((value) => value > 0 && value <= stockLength);
  if (!normalized.length || stockLength <= 0) return undefined;
  const bins: Array<{ remaining: number; cuts: number[] }> = [];
  [...normalized].sort((a, b) => b - a).forEach((cut) => {
    let bestBinIndex = -1;
    let bestRemaining = Number.POSITIVE_INFINITY;
    bins.forEach((bin, index) => {
      if (bin.remaining + 0.0001 < cut) return;
      const remaining = round2(bin.remaining - cut);
      if (remaining < bestRemaining) {
        bestRemaining = remaining;
        bestBinIndex = index;
      }
    });
    if (bestBinIndex >= 0) {
      bins[bestBinIndex].cuts.push(cut);
      bins[bestBinIndex].remaining = round2(bins[bestBinIndex].remaining - cut);
      return;
    }
    bins.push({ remaining: round2(stockLength - cut), cuts: [cut] });
  });
  const totalRequested = round2(normalized.reduce((sum, value) => sum + value, 0));
  const totalStock = round2(bins.length * stockLength);
  return {
    mode: 'm1',
    stockLabel: formatMeters(stockLength),
    orderedPieces: bins.length,
    utilizationPct: totalStock > 0 ? round2((totalRequested / totalStock) * 100) : 0,
    wasteQty: round2(totalStock - totalRequested),
    planLines: bins.map((bin, index) => `Lengte ${index + 1}: ${bin.cuts.map(formatMeters).join(' + ')} | rest ${formatMeters(bin.remaining)}`),
  };
}

type RectPlacement = { width: number; height: number };
type Shelf = { height: number; usedWidth: number; pieces: RectPlacement[] };
type Sheet = { usedHeight: number; shelves: Shelf[] };

function tryPlaceOnShelf(piece: RectPlacement, shelf: Shelf, stockWidth: number) {
  if (piece.height - shelf.height > 0.0001) return false;
  if (shelf.usedWidth + piece.width - stockWidth > 0.0001) return false;
  shelf.pieces.push(piece);
  shelf.usedWidth = round2(shelf.usedWidth + piece.width);
  return true;
}

function tryPlaceOnSheet(piece: RectPlacement, sheet: Sheet, stockWidth: number, stockHeight: number) {
  for (const shelf of sheet.shelves) {
    if (tryPlaceOnShelf(piece, shelf, stockWidth)) return true;
  }
  if (sheet.usedHeight + piece.height - stockHeight > 0.0001) return false;
  sheet.shelves.push({ height: piece.height, usedWidth: piece.width, pieces: [piece] });
  sheet.usedHeight = round2(sheet.usedHeight + piece.height);
  return true;
}

function optimizeSheetCuts(requests: Array<{ length: number; width: number }>, stockLength: number, stockWidth: number): PurchaseOptimization | undefined {
  const normalized = requests
    .map((request) => ({
      length: round2(toNonNegative(request.length)),
      width: round2(toNonNegative(request.width)),
    }))
    .filter((request) => request.length > 0 && request.width > 0);
  if (!normalized.length || stockLength <= 0 || stockWidth <= 0) return undefined;
  const sheets: Sheet[] = [];
  const sheetArea = round2(stockLength * stockWidth);
  const pieces = normalized
    .map((request) => {
      const normal = { width: request.length, height: request.width };
      const rotated = { width: request.width, height: request.length };
      const normalFits = normal.width <= stockLength + 0.0001 && normal.height <= stockWidth + 0.0001;
      const rotatedFits = rotated.width <= stockLength + 0.0001 && rotated.height <= stockWidth + 0.0001;
      if (!normalFits && !rotatedFits) return null;
      if (!normalFits) return rotated;
      if (!rotatedFits) return normal;
      return normal.height >= rotated.height ? normal : rotated;
    })
    .filter((piece): piece is RectPlacement => Boolean(piece))
    .sort((a, b) => (b.height - a.height) || (b.width - a.width));
  if (!pieces.length) return undefined;
  pieces.forEach((piece) => {
    let placed = false;
    for (const sheet of sheets) {
      if (tryPlaceOnSheet(piece, sheet, stockLength, stockWidth)) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      const nextSheet: Sheet = { usedHeight: 0, shelves: [] };
      if (tryPlaceOnSheet(piece, nextSheet, stockLength, stockWidth)) sheets.push(nextSheet);
    }
  });
  const totalRequestedArea = round2(normalized.reduce((sum, request) => sum + (request.length * request.width), 0));
  const totalStockArea = round2(sheets.length * sheetArea);
  return {
    mode: 'm2',
    stockLabel: `${formatMeters(stockLength)} x ${formatMeters(stockWidth)}`,
    orderedPieces: sheets.length,
    utilizationPct: totalStockArea > 0 ? round2((totalRequestedArea / totalStockArea) * 100) : 0,
    wasteQty: round2(totalStockArea - totalRequestedArea),
    planLines: sheets.map((sheet, index) => {
      const parts = sheet.shelves.flatMap((shelf) => shelf.pieces.map((piece) => `${formatMeters(piece.width)} x ${formatMeters(piece.height)}`));
      return `Plaat ${index + 1}: ${parts.join(', ')}`;
    }),
  };
}

function buildOptimizationSeed(line: QuotationLine, qty: number): OptimizationSeed | undefined {
  const mode = getLineMeasurementMode(line);
  if (mode !== 'm1' && mode !== 'm2') return undefined;
  const stock = getStockDimensionsInMeters(line, mode);
  if (!stock) return undefined;
  const qtyFormula = parseQtyFormula(line);
  if (mode === 'm1') {
    return {
      mode: 'm1',
      stockLength: stock.length,
      totalQty: qty,
      requests: qtyFormula?.mode === 'm1' ? (qtyFormula.rows ?? []).map((row) => row.length) : [],
    };
  }
  return {
    mode: 'm2',
    stockLength: stock.length,
    stockWidth: Number(('width' in stock ? stock.width : 0) ?? 0),
    totalQty: qty,
    requests: qtyFormula?.mode === 'm2' ? (qtyFormula.rows ?? []).map((row) => ({ length: row.length, width: row.width ?? 0 })) : [],
  };
}

function mergeOptimizationSeed(target: OptimizationSeed | undefined, next: OptimizationSeed | undefined) {
  if (!next) return target;
  if (!target) return next;
  if (target.mode !== next.mode) return target;
  if (target.mode === 'm1' && next.mode === 'm1' && Math.abs(target.stockLength - next.stockLength) < 0.0001) {
    target.totalQty = round2(target.totalQty + next.totalQty);
    target.requests.push(...next.requests);
  }
  if (target.mode === 'm2' && next.mode === 'm2' && Math.abs(target.stockLength - next.stockLength) < 0.0001 && Math.abs(target.stockWidth - next.stockWidth) < 0.0001) {
    target.totalQty = round2(target.totalQty + next.totalQty);
    target.requests.push(...next.requests);
  }
  return target;
}

function buildOptimization(seed?: OptimizationSeed): PurchaseOptimization | undefined {
  if (!seed) return undefined;
  if (seed.mode === 'm1') {
    if (seed.requests.length) return optimizeLinearCuts(seed.requests, seed.stockLength);
    const orderedPieces = Math.ceil(seed.totalQty / seed.stockLength);
    return {
      mode: 'm1',
      stockLabel: formatMeters(seed.stockLength),
      orderedPieces,
      utilizationPct: seed.totalQty > 0 ? round2((seed.totalQty / (orderedPieces * seed.stockLength)) * 100) : 0,
      wasteQty: round2((orderedPieces * seed.stockLength) - seed.totalQty),
      planLines: [`Totaal ${formatMeters(seed.totalQty)} verdeeld over ${orderedPieces} lengte(s) van ${formatMeters(seed.stockLength)}.`],
    };
  }
  if (seed.requests.length) return optimizeSheetCuts(seed.requests, seed.stockLength, seed.stockWidth);
  const stockArea = round2(seed.stockLength * seed.stockWidth);
  const orderedPieces = stockArea > 0 ? Math.ceil(seed.totalQty / stockArea) : 0;
  if (!orderedPieces) return undefined;
  return {
    mode: 'm2',
    stockLabel: `${formatMeters(seed.stockLength)} x ${formatMeters(seed.stockWidth)}`,
    orderedPieces,
    utilizationPct: seed.totalQty > 0 ? round2((seed.totalQty / (orderedPieces * stockArea)) * 100) : 0,
    wasteQty: round2((orderedPieces * stockArea) - seed.totalQty),
    planLines: [`Totaal ${formatDimensionValue(seed.totalQty, 2)} m2 verdeeld over ${orderedPieces} plaat/platen van ${formatMeters(seed.stockLength)} x ${formatMeters(seed.stockWidth)}.`],
  };
}

function getPieceSpecifications(line: QuotationLine, qty: number): Array<{ key: string; label: string; subLabel?: string; pieces: number; qty: number }> {
  const mode = getLineMeasurementMode(line);
  const qtyFormula = parseQtyFormula(line);
  const specs: Array<{ key: string; label: string; subLabel?: string; pieces: number; qty: number }> = [];

  // If the user entered dimensions in the qty calculator, those are leading.
  // They are stored in meters in qtyFormula/qtyFormulaMemo.
  if (qtyFormula && qtyFormula.mode === mode) {
    const formulaRows = (qtyFormula.rows ?? []).filter((row) => toNonNegative(row.length) > 0 || (mode === 'm2' && toNonNegative(row.width ?? 0) > 0));
    if (mode === 'm1' && formulaRows.length) {
      formulaRows.forEach((row) => {
        const length = round2(toNonNegative(row.length));
        if (length <= 0) return;
        specs.push({
          key: `m1:formula:row:${length}`,
          label: `Ingevoerd L ${formatDimensionValue(length, 2)} m`,
          pieces: 1,
          qty: length,
        });
      });
      if (specs.length) return specs;
    }
    if (mode === 'm2' && formulaRows.length) {
      formulaRows.forEach((row) => {
        const length = round2(toNonNegative(row.length));
        const width = round2(toNonNegative(row.width ?? 0));
        const area = round2(length * width);
        if (area <= 0) return;
        specs.push({
          key: `m2:formula:row:${length}:${width}`,
          label: `Ingevoerd L ${formatDimensionValue(length, 2)} m x B ${formatDimensionValue(width, 2)} m`,
          pieces: 1,
          qty: area,
        });
      });
      if (specs.length) return specs;
    }
    if (mode === 'm1' && qtyFormula.length > 0) {
      const standardText = getStandardMeasurementText(line, 'm1');
      specs.push({
        key: `m1:formula:${round2(qtyFormula.length)}`,
        label: `Ingevoerd L ${formatDimensionValue(round2(qtyFormula.length), 2)} m`,
        subLabel: standardText || undefined,
        pieces: round2(qty / qtyFormula.length),
        qty,
      });
      return specs;
    }
    if (mode === 'm2' && (qtyFormula.length > 0 || qtyFormula.width > 0)) {
      const divisor = (qtyFormula.length > 0 ? qtyFormula.length : 1) * (qtyFormula.width > 0 ? qtyFormula.width : 1);
      const label =
        qtyFormula.length > 0 && qtyFormula.width > 0
          ? `Ingevoerd L ${formatDimensionValue(round2(qtyFormula.length), 2)} m x B ${formatDimensionValue(round2(qtyFormula.width), 2)} m`
          : qtyFormula.length > 0
            ? `Ingevoerd L ${formatDimensionValue(round2(qtyFormula.length), 2)} m`
            : `Ingevoerd B ${formatDimensionValue(round2(qtyFormula.width), 2)} m`;
      const standardText = getStandardMeasurementText(line, 'm2');
      specs.push({
        key: `m2:formula:${round2(qtyFormula.length)}:${round2(qtyFormula.width)}`,
        label,
        subLabel: standardText || undefined,
        pieces: round2(qty / divisor),
        qty,
      });
      return specs;
    }
  }

  const specLabel = getLengthWidthSpecLabel(line.measurementSpecCode, line.measurementSpec);
  const specDecimals = getLengthWidthDecimals(line.measurementSpecCode);
  const toMeterFactor = getLengthWidthToMeterFactor(line.measurementSpecCode);
  const fixedLength = toNonNegative(line.measurementFixedLength ?? 0);
  const fixedWidth = toNonNegative(line.measurementFixedWidth ?? 0);
  const fixedLengthM = round2(fixedLength * toMeterFactor);
  const fixedWidthM = round2(fixedWidth * toMeterFactor);
  const fixedLengthRounded = roundByLengthWidthSpec(fixedLength, line.measurementSpecCode);
  const fixedWidthRounded = roundByLengthWidthSpec(fixedWidth, line.measurementSpecCode);

  if (mode === 'm1' && fixedLengthM > 0) {
    specs.push({
      key: `m1:${fixedLengthRounded}:${specLabel}:${specDecimals}`,
      label: `Standaard L ${formatDimensionValue(fixedLengthRounded, specDecimals)} ${specLabel}`,
      pieces: round2(qty / fixedLengthM),
      qty,
    });
    return specs;
  }

  if (mode === 'm2' && (fixedLengthM > 0 || fixedWidthM > 0)) {
    const divisor = (fixedLengthM > 0 ? fixedLengthM : 1) * (fixedWidthM > 0 ? fixedWidthM : 1);
    const label =
      fixedLength > 0 && fixedWidth > 0
        ? `Standaard L ${formatDimensionValue(fixedLengthRounded, specDecimals)} ${specLabel} x B ${formatDimensionValue(fixedWidthRounded, specDecimals)} ${specLabel}`
        : fixedLength > 0
          ? `Standaard L ${formatDimensionValue(fixedLengthRounded, specDecimals)} ${specLabel}`
          : `Standaard B ${formatDimensionValue(fixedWidthRounded, specDecimals)} ${specLabel}`;
    specs.push({
      key: `m2:${fixedLengthRounded}:${fixedWidthRounded}:${specLabel}:${specDecimals}`,
      label,
      pieces: round2(qty / divisor),
      qty,
    });
    return specs;
  }

  return specs;
}

export function aggregatePurchaseLines(lines: QuotationLine[]): PurchaseRow[] {
  const itemMap = new Map<string, PurchaseRow>();
  const specMaps = new Map<string, Map<string, PurchaseSpecGroup>>();
  const optimizationSeeds = new Map<string, OptimizationSeed>();

  lines.forEach((sourceLine) => {
    const line = normalizeMeasurementLine(sourceLine);
    const qty = round2(toNonNegative(line.baseQty));
    const unit = line.unit.trim();
    const measurementMode = getLineMeasurementMode(line) ?? null;
    const orderUnit = measurementMode ?? line.unit.trim();
    const key = [line.itemCode.trim(), line.description.trim(), orderUnit, measurementMode ?? 'none'].join('\u0000');
    const measuredUnit = measurementMode !== null || MEASURE_UNITS.has(normalizeUnit(unit));
    const standardSpecLabel = measurementMode ? getStandardMeasurementText(line, measurementMode) : '';
    const existing =
      itemMap.get(key) ??
      {
        key,
        sourceLineIds: [],
        itemCode: line.itemCode.trim(),
        description: line.description.trim(),
        unit: orderUnit,
        orderUnit,
        hasMeasurement: measuredUnit,
        standardSpecLabel: standardSpecLabel || undefined,
        totalQty: 0,
        lineCount: 0,
        specGroups: [],
        optimization: undefined,
      };
    if (!existing.standardSpecLabel && standardSpecLabel) existing.standardSpecLabel = standardSpecLabel;

    existing.totalQty = round2(existing.totalQty + qty);
    existing.lineCount += 1;
    existing.sourceLineIds.push(line.id);

    const pieceSpecs = getPieceSpecifications(line, qty);
    if (pieceSpecs.length) {
      const itemSpecMap = specMaps.get(key) ?? new Map<string, PurchaseSpecGroup>();
      pieceSpecs.forEach((pieceSpec) => {
        const specGroup =
          itemSpecMap.get(pieceSpec.key) ??
          {
            key: pieceSpec.key,
            label: pieceSpec.label,
            subLabel: pieceSpec.subLabel,
            totalQty: 0,
            totalPieces: 0,
            lineCount: 0,
          };
        specGroup.totalQty = round2(specGroup.totalQty + pieceSpec.qty);
        specGroup.totalPieces = round2(specGroup.totalPieces + pieceSpec.pieces);
        specGroup.lineCount += 1;
        itemSpecMap.set(pieceSpec.key, specGroup);
      });
      specMaps.set(key, itemSpecMap);
    }

    itemMap.set(key, existing);
    optimizationSeeds.set(key, mergeOptimizationSeed(optimizationSeeds.get(key), buildOptimizationSeed(line, qty)) as OptimizationSeed);
  });

  return [...itemMap.values()]
    .map((row) => ({
      ...row,
      specGroups: [...(specMaps.get(row.key)?.values() ?? [])].sort((a, b) => a.label.localeCompare(b.label, 'nl')),
      theoreticalPieces: (() => {
        const seed = optimizationSeeds.get(row.key);
        if (!seed) return undefined;
        if (seed.mode === 'm1') {
          return seed.stockLength > 0 ? round2(seed.totalQty / seed.stockLength) : undefined;
        }
        const stockArea = round2(seed.stockLength * seed.stockWidth);
        return stockArea > 0 ? round2(seed.totalQty / stockArea) : undefined;
      })(),
      theoreticalStockLabel: (() => {
        const seed = optimizationSeeds.get(row.key);
        if (!seed) return undefined;
        if (seed.mode === 'm1') return formatMeters(seed.stockLength);
        return `${formatMeters(seed.stockLength)} x ${formatMeters(seed.stockWidth)}`;
      })(),
      optimization: buildOptimization(optimizationSeeds.get(row.key)),
    }))
    .sort((a, b) => {
      const codeCompare = a.itemCode.localeCompare(b.itemCode, 'nl');
      if (codeCompare !== 0) return codeCompare;
      const descriptionCompare = a.description.localeCompare(b.description, 'nl');
      if (descriptionCompare !== 0) return descriptionCompare;
      return a.unit.localeCompare(b.unit, 'nl');
    });
}
