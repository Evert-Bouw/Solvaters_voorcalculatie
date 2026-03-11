export type MarkupType = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8' | 'M9' | 'M10';
export type MarkupBasis = 'quantity' | 'cost' | 'price';
export type MarkupValueType = 'percentage' | 'quantity' | 'amount';
export type DataMode = 'afas';
export type AfasEnvironmentType = 'production' | 'test' | 'accept';
export type AfasWriteAuthMode = 'classic' | 'oauth_user';
export type StageChargeMode = '0' | '1' | '2';
export type UiThemeMode = 'standard' | 'standard_dark' | 'custom';
export type LineMarkupField =
  | 'markupM1'
  | 'markupM2'
  | 'markupM3'
  | 'markupM4'
  | 'markupM5'
  | 'markupM6'
  | 'markupM7'
  | 'markupM8'
  | 'markupM9'
  | 'markupM10';

export interface LineMarkupFields {
  markupM1?: number;
  markupM2?: number;
  markupM3?: number;
  markupM4?: number;
  markupM5?: number;
  markupM6?: number;
  markupM7?: number;
  markupM8?: number;
  markupM9?: number;
  markupM10?: number;
}

export interface QtyFormulaRow {
  id: string;
  length: number;
  width?: number;
}

export interface QtyFormula {
  mode: 'm1' | 'm2' | 'm3';
  length: number;
  width: number;
  height?: number;
  rows?: QtyFormulaRow[];
}

export type CostFormulaOperator = '+' | '-' | '%';

export interface CostFormulaRow {
  id: string;
  label: string;
  operator: CostFormulaOperator;
  qty: number;
  unitCost: number;
}

export interface CostFormula {
  rows: CostFormulaRow[];
}

export interface Project {
  id: string;
  name: string;
  projectMarkups?: Partial<Record<MarkupType, number>>;
}

export interface Settings {
  dataMode: DataMode;
  writeAuthMode: AfasWriteAuthMode;
  usePhases: boolean;
  libraryEnabled: boolean;
  supplierColumnEnabled: boolean;
  purchasePriceColumnEnabled: boolean;
  columnVisibility: Record<string, boolean>;
  lineMarkupCount: number;
  phaseMarkupCount: number;
  lineMarkups: Record<MarkupType, boolean>;
  phaseMarkups: Record<MarkupType, boolean>;
  rwCombined: boolean;
  uaCombined: boolean;
  markupOrder: MarkupType[];
  columnOrder: string[];
  lineMarkupBases: Partial<Record<MarkupType, MarkupBasis>>;
  lineMarkupValueTypes: Partial<Record<MarkupType, MarkupValueType>>;
  phaseMarkupBases: Partial<Record<MarkupType, MarkupBasis>>;
  phaseMarkupValueTypes: Partial<Record<MarkupType, MarkupValueType>>;
  lineMarkupItemCodes: Partial<Record<MarkupType, string>>;
  lineMarkupDescriptions: Partial<Record<MarkupType, string>>;
  lineMarkupAfasIds: Partial<Record<MarkupType, string>>;
  lineMarkupPreferenceValues: Partial<Record<MarkupType, number>>;
  quotationLineConfigurableAfasIds: Partial<Record<string, string>>;
  phaseMarkupItemCodes: Partial<Record<MarkupType, string>>;
  phaseMarkupDescriptions: Partial<Record<MarkupType, string>>;
  phaseMarkupAfasIds: Partial<Record<MarkupType, string>>;
  phaseMarkupPreferenceValues: Partial<Record<MarkupType, number>>;
  unitCostCalculatorEnabled: boolean;
  uiThemeMode: UiThemeMode;
  uiColors: {
    brand50: string;
    brand100: string;
    brand600: string;
    brand700: string;
    appBg: string;
    panelBg: string;
    mutedBg: string;
    panelBorder: string;
    textPrimary: string;
    textSecondary: string;
  };
}

export interface ProjectStage {
  id: string;
  projectId: string;
  code: string;
  name: string;
  order: number;
  chargeMode: StageChargeMode;
  phaseMarkups?: Partial<Record<MarkupType, number>>;
}

export interface Quotation {
  id: string;
  projectId: string;
  number: string;
  name: string;
  order: number;
}

export interface QuotationLine extends LineMarkupFields {
  id: string;
  projectId: string;
  quotationId: string;
  stageId: string;
  order: number;
  lineType?: string;
  itemCode: string;
  description: string;
  supplierId?: string;
  supplierName?: string;
  purchaseEnabled?: boolean;
  baseQty: number;
  unit: string;
  measurementFixedLength?: number;
  measurementFixedWidth?: number;
  measurementSpecCode?: string;
  measurementSpec?: string;
  qtyFormula?: QtyFormula;
  qtyFormulaMemo?: string;
  costFormula?: CostFormula;
  costFormulaMemo?: string;
  markupFormulaMemo?: string;
  unitCost: number;
  purchasePrice?: number;
  unitPrice: number;
}

export interface AfasConnectionConfig {
  mode: DataMode;
  environmentId: string;
  environmentType: AfasEnvironmentType;
  hasToken: boolean;
  tokenPreview: string;
}

export interface AfasConnectionInput {
  mode: DataMode;
  environmentId: string;
  environmentType: AfasEnvironmentType;
  token?: string;
}

export interface QuotationLineMutation extends LineMarkupFields {
  id?: string;
  quotationId: string;
  stageId: string;
  order: number;
  lineType?: string;
  itemCode: string;
  description: string;
  supplierId?: string;
  supplierName?: string;
  purchaseEnabled?: boolean;
  baseQty: number;
  computedQty?: number;
  unit: string;
  qtyFormula?: QtyFormula;
  qtyFormulaMemo?: string;
  costFormula?: CostFormula;
  costFormulaMemo?: string;
  markupFormulaMemo?: string;
  unitCost: number;
  computedUnitCost?: number;
  purchasePrice?: number;
  unitPrice: number;
  computedUnitPrice?: number;
}

export interface SaveQuotationLinesPayload {
  create: QuotationLineMutation[];
  update: QuotationLineMutation[];
  delete: Array<{ id: string }>;
}

export interface Item {
  code: string;
  description: string;
  lineType?: string;
  defaultUnit: string;
  fixedLength?: number;
  fixedWidth?: number;
  lengthWidthSpecCode?: string;
  lengthWidthSpec?: string;
  defaultPurchasePrice?: number;
  defaultUnitCost: number;
  defaultUnitPrice: number;
  preferredSupplierId?: string;
  preferredSupplierName?: string;
}

export interface Creditor {
  id: string;
  name: string;
}

// Legacy compatibility for existing calculation helpers.
export interface Phase {
  id: string;
  code: string;
  name: string;
  order: number;
}

export interface Line extends LineMarkupFields {
  id: string;
  phaseId?: string;
  itemCode: string;
  description: string;
  supplierId?: string;
  supplierName?: string;
  purchaseEnabled?: boolean;
  baseQty: number;
  unit: string;
  measurementFixedLength?: number;
  measurementFixedWidth?: number;
  measurementSpecCode?: string;
  measurementSpec?: string;
  qtyFormula?: QtyFormula;
  qtyFormulaMemo?: string;
  costFormula?: CostFormula;
  costFormulaMemo?: string;
  markupFormulaMemo?: string;
  unitCost: number;
  purchasePrice?: number;
  unitPrice: number;
}

export interface Estimation {
  id: string;
  code: string;
  name: string;
  order: number;
}

export type QuotationLineFieldValueType = 'string' | 'number' | 'enum' | 'json';
export type QuotationLineFieldAfasMode = 'direct' | 'header' | 'configurable' | 'app_only' | 'unknown';
export type QuotationLineFieldSource = 'official_doc' | 'working_payload' | 'settings' | 'inference' | 'app_only';

export interface QuotationLineFieldMapping {
  appFieldId: string;
  appStorageKey: string;
  appLabel: string;
  valueType: QuotationLineFieldValueType;
  afasMode: QuotationLineFieldAfasMode;
  afasPath?: string;
  afasFieldId?: string;
  afasFieldLabel?: string;
  source: QuotationLineFieldSource;
  notes: string;
}

export interface IframeSessionProfile {
  sessionId: string;
  userId: string;
  personCode?: string;
  employeeId?: string;
  environmentId?: string;
  displayName?: string;
  lastSeenAt: string;
}

export interface QuotationLockInfo {
  projectId: string;
  quotationId: string;
  ownerUserId: string;
  ownerDisplayName: string;
  ownerSessionId: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface QuotationLockResponse {
  ok: boolean;
  reason?: 'invalid_request' | 'unknown_session' | 'locked_by_other' | 'lock_not_found' | 'not_lock_owner' | 'expired';
  lock?: QuotationLockInfo;
}

export interface AfasWriteAuthStatus {
  mode: AfasWriteAuthMode;
  oauthConfigured: boolean;
  authenticated: boolean;
  displayName?: string;
  userId?: string;
  accessTokenExpiresAt?: string;
  message: string;
}




