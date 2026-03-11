import { Line, MarkupType } from '../types';
import { ActiveMarkupConfig } from './markups';
import { getLineMarkupValue } from './lineMarkups';

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const toNonNegative = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value;
};

function getMarkupValue(markups: Partial<Record<MarkupType, number>>, type: MarkupType) {
  const val = Number(markups[type] ?? 0);
  return Number.isFinite(val) ? toNonNegative(val) : 0;
}

export function calcLine(line: Line, markupConfigs: ActiveMarkupConfig[]) {
  let computedQty = round2(toNonNegative(line.baseQty));
  const unitCostBefore = round2(toNonNegative(line.unitCost));
  let computedUnitCost = unitCostBefore;
  let computedUnitPrice = round2(toNonNegative(line.unitPrice));

  markupConfigs.forEach((config) => {
    const value = toNonNegative(getLineMarkupValue(line, config.type));
    if (config.valueType === 'percentage') {
      const factor = 1 + value / 100;
      if (config.basis === 'quantity') computedQty = round2(computedQty * factor);
      if (config.basis === 'cost') computedUnitCost = round2(computedUnitCost * factor);
      if (config.basis === 'price') computedUnitPrice = round2(computedUnitPrice * factor);
      return;
    }
    if (config.valueType === 'quantity' && config.basis === 'quantity') {
      computedQty = round2(computedQty + value);
      return;
    }
    if (config.valueType === 'amount') {
      if (config.basis === 'cost') computedUnitCost = round2(computedUnitCost + value);
      if (config.basis === 'price') computedUnitPrice = round2(computedUnitPrice + value);
    }
  });

  const costBefore = round2(computedQty * unitCostBefore);
  const costTotal = round2(computedQty * computedUnitCost);
  const priceTotal = round2(computedQty * computedUnitPrice);

  return { computedQty, unitCostBefore, computedUnitCost, computedUnitPrice, costBefore, costTotal, priceTotal };
}

export function calcAggregateTotals(
  subtotalCost: number,
  subtotalAmount: number,
  markups: Partial<Record<MarkupType, number>>,
  markupConfigs: ActiveMarkupConfig[],
) {
  let totalCostInclMarkups = round2(subtotalCost);
  let totalAmountInclMarkups = round2(subtotalAmount);
  const deltas: Partial<Record<MarkupType, number>> = {};

  markupConfigs.forEach((config) => {
    const value = getMarkupValue(markups, config.type);
    let base = 0;
    let delta = 0;

    if (config.basis === 'cost' || config.basis === 'quantity') base = totalCostInclMarkups;
    if (config.basis === 'price') base = totalAmountInclMarkups;

    if (config.valueType === 'percentage') {
      delta = round2(base * (value / 100));
    } else if (config.valueType === 'amount') {
      delta = round2(value);
    } else {
      // Quantity at aggregate level is treated as absolute addition.
      delta = round2(value);
    }

    if (config.basis === 'cost' || config.basis === 'quantity') {
      totalCostInclMarkups = round2(totalCostInclMarkups + delta);
      totalAmountInclMarkups = round2(totalAmountInclMarkups + delta);
    } else {
      totalAmountInclMarkups = round2(totalAmountInclMarkups + delta);
    }
    deltas[config.type] = delta;
  });

  return {
    totalCostInclMarkups,
    totalAmountInclMarkups,
    deltas,
  };
}



