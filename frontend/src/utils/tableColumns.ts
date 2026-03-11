import { MarkupType, Settings } from '../types';
import { getActiveMarkupTypesByBasis, getMarkupBasis } from './markups';

export const STATIC_COLUMN_KEYS = [
  'item',
  'description',
  'purchaseEnabled',
  'supplier',
  'unit',
  'baseQty',
  'computedQty',
  'unitCost',
  'purchasePrice',
  'computedUnitCost',
  'costTotal',
  'unitPrice',
  'priceTotal',
  'actions',
] as const;

export function isColumnVisible(settings: Settings, key: string): boolean {
  const fallback = key === 'supplier' || key === 'purchasePrice' ? false : true;
  return settings.columnVisibility?.[key] ?? fallback;
}

export function getLineMarkupColumnKey(settings: Settings, type: MarkupType): string {
  const basis = getMarkupBasis(settings, 'line', type);
  if (basis === 'quantity') return `qty-${type}`;
  if (basis === 'cost') return `cost-${type}`;
  return `priceMarkup-${type}`;
}

export function buildDefaultTableColumnKeys(settings: Settings): string[] {
  const activeLineQtyMarkups = getActiveMarkupTypesByBasis(settings.lineMarkups, settings, 'line', 'quantity', settings.rwCombined, settings.uaCombined);
  const activeLineCostMarkups = getActiveMarkupTypesByBasis(settings.lineMarkups, settings, 'line', 'cost', settings.rwCombined, settings.uaCombined);
  const activeLinePriceMarkups = getActiveMarkupTypesByBasis(settings.lineMarkups, settings, 'line', 'price', settings.rwCombined, settings.uaCombined);

  const qtyKeys = activeLineQtyMarkups.map((type) => `qty-${type}`);
  const costKeys = activeLineCostMarkups.map((type) => `cost-${type}`);
  const priceKeys = activeLinePriceMarkups.map((type) => `priceMarkup-${type}`);

  return [
    ...(isColumnVisible(settings, 'item') ? ['item'] : []),
    ...(isColumnVisible(settings, 'description') ? ['description'] : []),
    ...(isColumnVisible(settings, 'purchaseEnabled') ? ['purchaseEnabled'] : []),
    ...(isColumnVisible(settings, 'supplier') ? ['supplier'] : []),
    ...(isColumnVisible(settings, 'unit') ? ['unit'] : []),
    ...(isColumnVisible(settings, 'baseQty') ? ['baseQty'] : []),
    ...qtyKeys,
    ...(isColumnVisible(settings, 'computedQty') ? ['computedQty'] : []),
    ...(isColumnVisible(settings, 'unitCost') ? ['unitCost'] : []),
    ...(isColumnVisible(settings, 'purchasePrice') ? ['purchasePrice'] : []),
    ...costKeys,
    ...(isColumnVisible(settings, 'computedUnitCost') ? ['computedUnitCost'] : []),
    ...(isColumnVisible(settings, 'costTotal') ? ['costTotal'] : []),
    ...(isColumnVisible(settings, 'unitPrice') ? ['unitPrice'] : []),
    ...priceKeys,
    ...(isColumnVisible(settings, 'priceTotal') ? ['priceTotal'] : []),
    ...(isColumnVisible(settings, 'actions') ? ['actions'] : []),
  ];
}

export function applyColumnOrder(defaultKeys: string[], preferredOrder: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  preferredOrder.forEach((key) => {
    if (!defaultKeys.includes(key)) return;
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(key);
  });
  defaultKeys.forEach((key) => {
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(key);
  });
  return ordered;
}

export function getOrderedTableColumnKeys(settings: Settings): string[] {
  const defaults = buildDefaultTableColumnKeys(settings);
  return applyColumnOrder(defaults, Array.isArray(settings.columnOrder) ? settings.columnOrder : []);
}
