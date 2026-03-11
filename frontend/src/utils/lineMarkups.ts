import { LineMarkupField, LineMarkupFields, MarkupType } from '../types';
import { ALL_MARKUPS } from './markups';

const LINE_MARKUP_FIELD_MAP: Record<MarkupType, LineMarkupField> = {
  M1: 'markupM1',
  M2: 'markupM2',
  M3: 'markupM3',
  M4: 'markupM4',
  M5: 'markupM5',
  M6: 'markupM6',
  M7: 'markupM7',
  M8: 'markupM8',
  M9: 'markupM9',
  M10: 'markupM10',
};

type LegacyLineMarkupCarrier = {
  markups?: Partial<Record<MarkupType, number>>;
};

export function getLineMarkupField(type: MarkupType): LineMarkupField {
  return LINE_MARKUP_FIELD_MAP[type];
}

export function getLineMarkupValue(line: Partial<LineMarkupFields> & LegacyLineMarkupCarrier, type: MarkupType): number {
  const field = getLineMarkupField(type);
  const rawValue = line[field] ?? line.markups?.[type] ?? 0;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : 0;
}

export function buildLineMarkupPatch(type: MarkupType, value: number): Partial<LineMarkupFields> {
  return { [getLineMarkupField(type)]: value };
}

export function extractLineMarkupFields(line: Partial<LineMarkupFields> & LegacyLineMarkupCarrier): Partial<LineMarkupFields> {
  return ALL_MARKUPS.reduce<Partial<LineMarkupFields>>((result, type) => {
    const field = getLineMarkupField(type);
    const value = line[field] ?? line.markups?.[type];
    if (value === undefined || value === null) return result;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return result;
    result[field] = numericValue;
    return result;
  }, {});
}

export function buildLineMarkupFields(values: Partial<Record<MarkupType, number>>): Partial<LineMarkupFields> {
  return ALL_MARKUPS.reduce<Partial<LineMarkupFields>>((result, type) => {
    const value = values[type];
    if (value === undefined || value === null) return result;
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return result;
    result[getLineMarkupField(type)] = numericValue;
    return result;
  }, {});
}
