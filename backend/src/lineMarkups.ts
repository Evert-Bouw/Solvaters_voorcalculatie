import { LineMarkupField, LineMarkupFields, MarkupType } from './types/index.js';

const ALL_MARKUPS: MarkupType[] = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'];

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

export function sanitizeLineMarkupFields(input: LegacyLineMarkupCarrier & Partial<LineMarkupFields>): Partial<LineMarkupFields> {
  return ALL_MARKUPS.reduce<Partial<LineMarkupFields>>((result, type) => {
    const field = getLineMarkupField(type);
    const rawValue = input[field] ?? input.markups?.[type];
    if (rawValue === undefined || rawValue === null) return result;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return result;
    result[field] = value < 0 ? 0 : value;
    return result;
  }, {});
}
