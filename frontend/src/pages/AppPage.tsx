
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  DEFAULT_BOOTSTRAP_STATUS,
  claimQuotationLock,
  createProjectStage,
  createQuotation,
  exchangeIframeSession,
  fetchAfasWriteAuthStatus,
  fetchBootstrapStatus,
  fetchCreditors,
  fetchIframeSessionProfile,
  fetchItems,
  fetchProject,
  fetchProjects,
  fetchProjectStages,
  fetchQuotationLines,
  fetchQuotations,
  fetchSettings,
  getAfasOAuthStartUrl,
  heartbeatQuotationLock,
  releaseQuotationLock,
  saveSettings,
  saveQuotationLines,
  updateProjectStage,
  updateQuotation,
} from '../api/client';
import { BootstrapStatus } from '../core/types';
import {
  CostFormulaOperator,
  Creditor,
  AfasWriteAuthStatus,
  IframeSessionProfile,
  Item,
  QuotationLockInfo,
  MarkupType,
  QtyFormula,
  Project,
  ProjectStage,
  Quotation,
  QuotationLine,
  QuotationLineMutation,
  SaveQuotationLinesPayload,
  Settings,
  StageChargeMode,
} from '../types';
import { calcAggregateTotals, calcLine, toNonNegative } from '../utils/calculations';
import { getLengthWidthDecimals, getLengthWidthSpecLabel, getLengthWidthToMeterFactor, roundByLengthWidthSpec } from '../utils/itemMeasurementSpec';
import { buildLineMarkupFields, buildLineMarkupPatch, extractLineMarkupFields, getLineMarkupValue } from '../utils/lineMarkups';
import { getActiveMarkupConfigs, getActiveMarkupTypesByBasis, getMarkupBasis, getMarkupValueType, getMarkupValueTypeSuffix, getUniversalMarkupName, MARKUP_DESCRIPTIONS, MARKUP_LABELS } from '../utils/markups';
import { getLegacyMeasurementMode, getLineMeasurementMode, normalizeMeasurementLine, SELECTED_PROJECT_STORAGE_KEY } from '../utils/measurement';
import { applyColumnOrder, buildDefaultTableColumnKeys } from '../utils/tableColumns';
import { applyThemeColors } from '../utils/theme';

const DEFAULT_SETTINGS: Settings = {
  dataMode: 'afas',
  writeAuthMode: 'classic',
  usePhases: true,
  libraryEnabled: true,
  supplierColumnEnabled: false,
  purchasePriceColumnEnabled: false,
  columnVisibility: { item: true, description: true, purchaseEnabled: true, supplier: false, unit: true, baseQty: true, computedQty: true, unitCost: true, purchasePrice: false, computedUnitCost: true, costTotal: true, unitPrice: true, priceTotal: true, actions: true },
  lineMarkupCount: 0,
  phaseMarkupCount: 0,
  rwCombined: false,
  uaCombined: false,
  markupOrder: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'],
  columnOrder: [],
  lineMarkups: { M1: false, M2: false, M3: false, M4: false, M5: false, M6: false, M7: false, M8: false, M9: false, M10: false },
  phaseMarkups: { M1: true, M2: false, M3: false, M4: false, M5: false, M6: false, M7: false, M8: false, M9: false, M10: false },
  lineMarkupBases: { M1: 'cost', M2: 'cost', M3: 'cost', M4: 'cost', M5: 'cost', M6: 'cost', M7: 'cost', M8: 'cost', M9: 'cost', M10: 'cost' },
  lineMarkupValueTypes: { M1: 'percentage', M2: 'percentage', M3: 'percentage', M4: 'percentage', M5: 'percentage', M6: 'percentage', M7: 'percentage', M8: 'percentage', M9: 'percentage', M10: 'percentage' },
  phaseMarkupBases: { M1: 'cost', M2: 'cost', M3: 'cost', M4: 'cost', M5: 'cost', M6: 'cost', M7: 'cost', M8: 'cost', M9: 'cost', M10: 'cost' },
  phaseMarkupValueTypes: { M1: 'percentage', M2: 'percentage', M3: 'percentage', M4: 'percentage', M5: 'percentage', M6: 'percentage', M7: 'percentage', M8: 'percentage', M9: 'percentage', M10: 'percentage' },
  lineMarkupItemCodes: { M1: 'V1', M2: 'V2', M3: 'V3', M4: 'V4', M5: 'V5', M6: 'V6', M7: 'V7', M8: 'V8', M9: 'V9', M10: 'V10' },
  lineMarkupDescriptions: { M1: 'Vrije opslag kolom 1', M2: 'Vrije opslag kolom 2', M3: 'Vrije opslag kolom 3', M4: 'Vrije opslag kolom 4', M5: 'Vrije opslag kolom 5', M6: 'Vrije opslag kolom 6', M7: 'Vrije opslag kolom 7', M8: 'Vrije opslag kolom 8', M9: 'Vrije opslag kolom 9', M10: 'Vrije opslag kolom 10' },
  lineMarkupAfasIds: {},
  lineMarkupPreferenceValues: {},
  quotationLineConfigurableAfasIds: {
    'QL-SUPPLIER_ID': '',
    'QL-ORDER': '',
    'QL-QTY_BASE': '',
    'QL-QTY_FORMULA_MEMO': '',
    'QL-COST_FORMULA_MEMO': '',
    'QL-MARKUP_FORMULA_MEMO': '',
    'QL-UNIT_COST_BASE': '',
    'QL-PURCHASE_PRICE': '',
    'QL-UNIT_PRICE_BASE': '',
    'QL-PURCHASE_ENABLED': '',
  },
  phaseMarkupItemCodes: { M1: 'V1', M2: 'V2', M3: 'V3', M4: 'V4', M5: 'V5', M6: 'V6', M7: 'V7', M8: 'V8', M9: 'V9', M10: 'V10' },
  phaseMarkupDescriptions: { M1: 'Vrije opslag regel 1', M2: 'Vrije opslag regel 2', M3: 'Vrije opslag regel 3', M4: 'Vrije opslag regel 4', M5: 'Vrije opslag regel 5', M6: 'Vrije opslag regel 6', M7: 'Vrije opslag regel 7', M8: 'Vrije opslag regel 8', M9: 'Vrije opslag regel 9', M10: 'Vrije opslag regel 10' },
  phaseMarkupAfasIds: {},
  phaseMarkupPreferenceValues: {},
  unitCostCalculatorEnabled: true,
  uiThemeMode: 'standard',
  uiColors: {
    brand50: '#eff6ff',
    brand100: '#dbeafe',
    brand600: '#2563eb',
    brand700: '#1d4ed8',
    appBg: '#f1f5f9',
    panelBg: '#ffffff',
    mutedBg: '#f8fafc',
    panelBorder: '#e2e8f0',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
  },
};

const IFRAME_SESSION_STORAGE_KEY = 'solvaters_basis_iframe_session_id';
const IFRAME_EXCHANGE_SEEN_KEY = 'voorcalc_iframe_exchange_seen';
const FIXED_TABLE_SCALE = 0.75;
const NO_STAGE_ID = 'NO_STAGE';
const LOCK_HEARTBEAT_MS = 30_000;
const DEFAULT_WRITE_AUTH_STATUS: AfasWriteAuthStatus = {
  mode: 'classic',
  oauthConfigured: false,
  authenticated: false,
  message: '',
};

type DraftState = 'clean' | 'new' | 'updated' | 'deleted';
type DraftQuotationLine = QuotationLine & { draftState: DraftState };

function compareQuotationLines(a: { quotationId: string; stageId: string; order: number; id: string; orderHasLineNo?: boolean }, b: { quotationId: string; stageId: string; order: number; id: string; orderHasLineNo?: boolean }) {
  if (a.quotationId !== b.quotationId) return a.quotationId.localeCompare(b.quotationId, 'nl');
  if (a.stageId !== b.stageId) return a.stageId.localeCompare(b.stageId, 'nl');
  if (Boolean(a.orderHasLineNo) !== Boolean(b.orderHasLineNo)) return a.orderHasLineNo ? -1 : 1;
  if (a.order !== b.order) return a.order - b.order;
  return a.id.localeCompare(b.id, 'nl');
}

type PhaseMarkupMemoPayload = {
  version: number;
  kind: 'phase_markup_line';
  markupType: MarkupType;
  quotationId: string;
  stageId: string;
  sequence: number;
  generatedOrder: number;
  anchorOrder: number;
  basis: 'quantity' | 'cost' | 'price';
  valueType: 'percentage' | 'quantity' | 'amount';
  markupValue: number;
  delta: number;
};
type ResizeState = { key: string; startX: number; startWidth: number } | null;
type QtyCalcMode = 'm1' | 'm2' | 'm3';
type QtyCalculatorRowState = { id: string; length: number; width: number };
type QtyCalculatorState = {
  lineId: string;
  mode: QtyCalcMode;
  length: number;
  width: number;
  height: number;
  rows: QtyCalculatorRowState[];
  fixedLength?: number;
  fixedWidth?: number;
  measurementSpecCode?: string;
  measurementSpec?: string;
};
type CostCalculatorRowState = { id: string; label: string; operator: CostFormulaOperator; qty: number; unitCost: number };
type CostCalculatorState = { lineId: string; rows: CostCalculatorRowState[] };
type StageGroup = ProjectStage & { isNoPhase?: boolean };
type ItemSuggestionsState = { lineId: string | null; query: string; items: Item[]; open: boolean; loading: boolean };
type CreditorSuggestionsState = { lineId: string | null; query: string; creditors: Creditor[]; open: boolean; loading: boolean };
type QuotationLockState = { mine: boolean; lock?: QuotationLockInfo };
type IframeContextMode = 'method1' | 'method2' | 'none';
type ContainerMenuState =
  | { type: 'quotation'; quotationId: string }
  | { type: 'stage'; quotationId: string; stageId: string };
type CopyActionModalState =
  | { type: 'quotation'; sourceQuotationId: string; name: string; error?: string }
  | { type: 'stage'; sourceQuotationId: string; sourceStageId: string; code: string; name: string; chargeMode: StageChargeMode; error?: string };
type RenameActionModalState =
  | { type: 'quotation'; quotationId: string; name: string; error?: string }
  | { type: 'stage'; quotationId: string; stageId: string; name: string; chargeMode: StageChargeMode; error?: string };

const STAGE_CHARGE_MODE_OPTIONS: Array<{ value: StageChargeMode; label: string }> = [
  { value: '0', label: 'Conform project' },
  { value: '1', label: 'Nacalculatie doorbelasten' },
  { value: '2', label: 'Nacalculatie niet doorbelasten' },
];

function navLinkClassName(isActive: boolean) {
  return `rounded px-3 py-2 text-xs font-medium ${isActive ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`;
}

function iconNavClassName(isActive: boolean) {
  return `inline-flex h-8 w-8 items-center justify-center rounded font-semibold ${isActive ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`;
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }
    await document.exitFullscreen();
  } catch {
    // Fullscreen is best-effort.
  }
}

function findProjectIdInSearchParams(params: URLSearchParams) {
  const direct =
    params.get('PrId')?.trim() ??
    params.get('prId')?.trim() ??
    params.get('prid')?.trim() ??
    params.get('projectid')?.trim() ??
    '';
  if (direct) return direct;
  for (const [key, value] of params.entries()) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey !== 'prid' && normalizedKey !== 'projectid') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function getProjectIdFromUrlContext() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const direct = findProjectIdInSearchParams(params);
  if (direct) return direct;

  const dataUrl = params.get('dataurl')?.trim() ?? '';
  if (!dataUrl) return '';
  try {
    const decoded = decodeURIComponent(dataUrl);
    const nestedUrl = new URL(decoded, window.location.origin);
    return findProjectIdInSearchParams(nestedUrl.searchParams);
  } catch {
    const queryIndex = dataUrl.indexOf('?');
    if (queryIndex < 0) return '';
    return findProjectIdInSearchParams(new URLSearchParams(dataUrl.slice(queryIndex + 1)));
  }
}

function buildPhaseMarkupLineKey(quotationId: string, stageId: string, markupType: MarkupType) {
  return `${quotationId}::${stageId}::${markupType}`;
}

function buildPhaseMarkupGroupKey(quotationId: string, stageId: string) {
  return `${quotationId}::${stageId}`;
}

function parsePhaseMarkupMemo(memo?: string): PhaseMarkupMemoPayload | null {
  if (!memo?.trim()) return null;
  try {
    const parsed = JSON.parse(memo) as Partial<PhaseMarkupMemoPayload>;
    const type = parsed.markupType;
    if (parsed.kind !== 'phase_markup_line') return null;
    if (!type || !(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'] as MarkupType[]).includes(type)) return null;
    if (!parsed.quotationId || !parsed.stageId) return null;
    return {
      version: Number(parsed.version) || 1,
      kind: 'phase_markup_line',
      markupType: type,
      quotationId: parsed.quotationId,
      stageId: parsed.stageId,
      sequence: Number(parsed.sequence) || 1,
      generatedOrder: Number(parsed.generatedOrder) || 0,
      anchorOrder: Number(parsed.anchorOrder) || 0,
      basis: parsed.basis === 'quantity' || parsed.basis === 'price' ? parsed.basis : 'cost',
      valueType: parsed.valueType === 'quantity' || parsed.valueType === 'amount' ? parsed.valueType : 'percentage',
      markupValue: Number(parsed.markupValue) || 0,
      delta: Number(parsed.delta) || 0,
    };
  } catch {
    return null;
  }
}

function getResolvedMeasurementUnit(measurementMode?: 'm1' | 'm2'): string | undefined {
  if (measurementMode === 'm1' || measurementMode === 'm2') return measurementMode;
  return undefined;
}

function getLineMeasurementSpecLabel(line: Pick<QuotationLine, 'measurementSpecCode' | 'measurementSpec'>) {
  return getLengthWidthSpecLabel(line.measurementSpecCode, line.measurementSpec);
}

function formatMeasurementValue(value: number, specCode?: string) {
  const rounded = roundByLengthWidthSpec(value, specCode);
  const decimals = getLengthWidthDecimals(specCode);
  return rounded.toLocaleString('nl-NL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCostFormulaOperator(value: unknown): CostFormulaOperator {
  return value === '-' || value === '%' ? value : '+';
}

function serializeCostFormulaMemo(rows: CostCalculatorRowState[]): string {
  return JSON.stringify({
    version: 1,
    rows: rows.map((row) => ({
      id: row.id,
      label: row.label,
      operator: row.operator,
      qty: row.qty,
      unitCost: row.unitCost,
    })),
  });
}

function parseCostFormulaMemo(memo?: string): CostCalculatorRowState[] {
  if (!memo) return [];
  try {
    const parsed = JSON.parse(memo) as { rows?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.rows)) return [];
    return parsed.rows
      .map((row, index) => {
        const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : crypto.randomUUID();
        const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : `Regel ${index + 1}`;
        return {
          id,
          label,
          operator: normalizeCostFormulaOperator(row.operator),
          qty: toNonNegative(Number(row.qty) || 0),
          unitCost: toNonNegative(Number(row.unitCost) || 0),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getCostCalculatorRowBase(row: CostCalculatorRowState): number {
  return toNonNegative(row.qty) * toNonNegative(row.unitCost);
}

function applyCostCalculatorRows(rows: CostCalculatorRowState[]): { deltas: number[]; total: number } {
  let runningTotal = 0;
  const deltas = rows.map((row) => {
    const base = getCostCalculatorRowBase(row);
    let delta = 0;
    if (row.operator === '+') delta = base;
    if (row.operator === '-') delta = -base;
    if (row.operator === '%') delta = runningTotal * (base / 100);
    runningTotal += delta;
    return delta;
  });
  return { deltas, total: Math.round((runningTotal + Number.EPSILON) * 100) / 100 };
}

function serializeMarkupFormulaMemo(line: QuotationLine): string {
  const markups: Partial<Record<MarkupType, number>> = {};
  let hasValue = false;
  (['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'] as MarkupType[]).forEach((type) => {
    const value = toNonNegative(getLineMarkupValue(line, type));
    markups[type] = value;
    if (value !== 0) hasValue = true;
  });
  if (!hasValue) return '';
  return JSON.stringify({ version: 1, markups });
}

function defaultColumnWidth(key: string) {
  if (key === 'item') return 96;
  if (key === 'description') return 180;
  if (key === 'purchaseEnabled') return 72;
  if (key === 'supplier') return 130;
  if (key === 'baseQty') return 80;
  if (key === 'unit') return 62;
  if (key.startsWith('qty-') || key.startsWith('cost-')) return 72;
  if (key.startsWith('priceMarkup-')) return 72;
  if (key === 'computedQty') return 78;
  if (key === 'unitCost') return 86;
  if (key === 'purchasePrice') return 86;
  if (key === 'computedUnitCost') return 90;
  if (key === 'costTotal') return 90;
  if (key === 'unitPrice') return 86;
  if (key === 'priceTotal') return 92;
  if (key === 'actions') return 72;
  return 80;
}

function isNonPurchasableLineType(lineType?: string) {
  return lineType?.trim() === '3';
}

function isNonPurchasableLine(line: Pick<QuotationLine, 'lineType' | 'markupFormulaMemo'>) {
  return isNonPurchasableLineType(line.lineType) || Boolean(parsePhaseMarkupMemo(line.markupFormulaMemo));
}

function isAddLineHotkey(event: KeyboardEvent) {
  if (!event.altKey || event.ctrlKey || event.metaKey) return false;
  return event.key === '+' || event.code === 'NumpadAdd' || (event.key === '=' && event.shiftKey);
}

function isDuplicateLineHotkey(event: KeyboardEvent) {
  if (!event.altKey || event.ctrlKey || event.metaKey) return false;
  return event.key.toLowerCase() === 'c';
}

function isDeleteLineHotkey(event: KeyboardEvent) {
  if (!event.altKey || event.ctrlKey || event.metaKey) return false;
  return event.key === 'Delete';
}

export default function AppPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>(DEFAULT_BOOTSTRAP_STATUS);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const urlProjectId = useMemo(() => getProjectIdFromUrlContext(), []);
  const isProjectLockedFromUrl = Boolean(urlProjectId);

  const [prId, setPrId] = useState<string>(() => urlProjectId || localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY) || '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);

  const [stages, setStages] = useState<ProjectStage[]>([]);
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [selectedQuotationIds, setSelectedQuotationIds] = useState<string[]>([]);
  const [isQuotationDropdownOpen, setIsQuotationDropdownOpen] = useState(false);

  const [draftLines, setDraftLines] = useState<DraftQuotationLine[]>([]);
  const [persistedPhaseMarkupLinesByKey, setPersistedPhaseMarkupLinesByKey] = useState<Record<string, QuotationLine>>({});
  const [aggregateMarkupsByGroup, setAggregateMarkupsByGroup] = useState<Record<string, Partial<Record<MarkupType, number>>>>({});
  const [libraryProject, setLibraryProject] = useState<Project | null>(null);
  const [libraryStages, setLibraryStages] = useState<ProjectStage[]>([]);
  const [libraryQuotations, setLibraryQuotations] = useState<Quotation[]>([]);
  const [libraryLines, setLibraryLines] = useState<QuotationLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [hasPendingAggregateMarkupChanges, setHasPendingAggregateMarkupChanges] = useState(false);
  const [iframeSession, setIframeSession] = useState<IframeSessionProfile | null>(null);
  const [iframeContextMode, setIframeContextMode] = useState<IframeContextMode>('none');
  const [writeAuthStatus, setWriteAuthStatus] = useState<AfasWriteAuthStatus>(DEFAULT_WRITE_AUTH_STATUS);
  const [writeAuthBusy, setWriteAuthBusy] = useState(false);
  const [quotationLocks, setQuotationLocks] = useState<Record<string, QuotationLockState>>({});

  const [isCreateStageModalOpen, setIsCreateStageModalOpen] = useState(false);
  const [newStageCode, setNewStageCode] = useState('');
  const [newStageName, setNewStageName] = useState('');
  const [newStageChargeMode, setNewStageChargeMode] = useState<StageChargeMode>('0');
  const [creatingStage, setCreatingStage] = useState(false);
  const [isCreateQuotationModalOpen, setIsCreateQuotationModalOpen] = useState(false);
  const [newQuotationName, setNewQuotationName] = useState('');
  const [createQuotationError, setCreateQuotationError] = useState('');
  const [creatingQuotation, setCreatingQuotation] = useState(false);
  const [openContainerMenu, setOpenContainerMenu] = useState<ContainerMenuState | null>(null);
  const [copyActionModal, setCopyActionModal] = useState<CopyActionModalState | null>(null);
  const [copyActionBusy, setCopyActionBusy] = useState(false);
  const [renameActionModal, setRenameActionModal] = useState<RenameActionModalState | null>(null);
  const [renameActionBusy, setRenameActionBusy] = useState(false);

  const [expandedQuotationIds, setExpandedQuotationIds] = useState<string[]>([]);
  const [expandedStageKeys, setExpandedStageKeys] = useState<string[]>([]);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [qtyCalculator, setQtyCalculator] = useState<QtyCalculatorState | null>(null);
  const [costCalculator, setCostCalculator] = useState<CostCalculatorState | null>(null);
  const [measurementConfigLineId, setMeasurementConfigLineId] = useState<string | null>(null);
  const [itemSuggestions, setItemSuggestions] = useState<ItemSuggestionsState>({ lineId: null, query: '', items: [], open: false, loading: false });
  const [creditorSuggestions, setCreditorSuggestions] = useState<CreditorSuggestionsState>({ lineId: null, query: '', creditors: [], open: false, loading: false });
  const [creditorQueries, setCreditorQueries] = useState<Record<string, string>>({});
  const [draggedLineId, setDraggedLineId] = useState<string | null>(null);
  const [selectedDragLineIds, setSelectedDragLineIds] = useState<string[]>([]);
  const [dragOverLineId, setDragOverLineId] = useState<string | null>(null);
  const [isPointerDraggingLine, setIsPointerDraggingLine] = useState(false);
  const [draggedLibraryQuotationId, setDraggedLibraryQuotationId] = useState<string | null>(null);
  const [libraryDropTarget, setLibraryDropTarget] = useState<string | null>(null);
  const resizeRef = useRef<ResizeState>(null);
  const draggedLineIdRef = useRef<string | null>(null);
  const draggedLineIdsRef = useRef<string[]>([]);
  const pointerDragDropHandledRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const saveSuccessTimeoutRef = useRef<number | null>(null);
  const previousSelectedQuotationIdsRef = useRef<string[]>([]);
  const pendingSaveAfterAuthRef = useRef(false);
  const backgroundOrderSyncAttemptRef = useRef('');
  const itemSearchRequestRef = useRef(0);
  const creditorSearchRequestRef = useRef(0);
  const addLineHotkeyRef = useRef<(() => void) | null>(null);
  const lineHotkeyRef = useRef<{ duplicate: () => void; remove: () => void } | null>(null);

  const hasProject = prId.trim().length > 0;
  const showPhasePanel = settings.usePhases;
  const showLibraryPanel = settings.libraryEnabled;
  const [isPhasePanelCollapsed, setIsPhasePanelCollapsed] = useState(false);
  const [isLibraryPanelCollapsed, setIsLibraryPanelCollapsed] = useState(false);

  const noPhaseStage = useMemo<StageGroup>(
    () => ({
      id: NO_STAGE_ID,
      projectId: prId,
      code: '',
      name: 'Geen fase',
      order: Number.MAX_SAFE_INTEGER,
      chargeMode: '0',
      phaseMarkups: {},
      isNoPhase: true,
    }),
    [prId],
  );

  const activeLineMarkupConfigs = useMemo(
    () => getActiveMarkupConfigs(settings.lineMarkups, settings, 'line', settings.rwCombined, settings.uaCombined),
    [settings],
  );
  const activePhaseMarkupConfigs = useMemo(
    () => getActiveMarkupConfigs(settings.phaseMarkups, settings, 'phase', settings.rwCombined, settings.uaCombined),
    [settings],
  );
  const activeLineMarkups = useMemo(() => activeLineMarkupConfigs.map((x) => x.type), [activeLineMarkupConfigs]);
  const activePhaseMarkups = useMemo(() => activePhaseMarkupConfigs.map((x) => x.type), [activePhaseMarkupConfigs]);

  const activeLineQtyMarkups = useMemo(
    () => getActiveMarkupTypesByBasis(settings.lineMarkups, settings, 'line', 'quantity', settings.rwCombined, settings.uaCombined),
    [settings],
  );
  const activeLineCostMarkups = useMemo(
    () => getActiveMarkupTypesByBasis(settings.lineMarkups, settings, 'line', 'cost', settings.rwCombined, settings.uaCombined),
    [settings],
  );
  const activeLinePriceMarkups = useMemo(
    () => getActiveMarkupTypesByBasis(settings.lineMarkups, settings, 'line', 'price', settings.rwCombined, settings.uaCombined),
    [settings],
  );

  const activePhaseQtyMarkups = useMemo(
    () => getActiveMarkupTypesByBasis(settings.phaseMarkups, settings, 'phase', 'quantity', settings.rwCombined, settings.uaCombined),
    [settings],
  );
  const activePhaseCostMarkups = useMemo(
    () => getActiveMarkupTypesByBasis(settings.phaseMarkups, settings, 'phase', 'cost', settings.rwCombined, settings.uaCombined),
    [settings],
  );
  const activePhasePriceMarkups = useMemo(
    () => getActiveMarkupTypesByBasis(settings.phaseMarkups, settings, 'phase', 'price', settings.rwCombined, settings.uaCombined),
    [settings],
  );

  const activeQtyMarkupColumns = useMemo(() => [...activeLineQtyMarkups], [activeLineQtyMarkups]);
  const activeCostMarkupColumns = useMemo(() => [...activeLineCostMarkups], [activeLineCostMarkups]);
  const activePriceMarkupColumns = useMemo(() => [...activeLinePriceMarkups], [activeLinePriceMarkups]);

  function getAggregateMarkupsForGroup(
    quotationId: string,
    stageId: string,
    fallback?: Partial<Record<MarkupType, number>>,
  ) {
    return aggregateMarkupsByGroup[buildPhaseMarkupGroupKey(quotationId, stageId)] ?? fallback ?? {};
  }

  function resolveDraggedLineId(raw?: string) {
    const fromRaw = raw?.trim() ?? '';
    if (fromRaw) return fromRaw;
    return draggedLineId ?? draggedLineIdRef.current;
  }

  function resolveDraggedLineIds(raw?: string) {
    const fromRaw = raw?.trim() ?? '';
    if (fromRaw) {
      try {
        const parsed = JSON.parse(fromRaw) as unknown;
        if (Array.isArray(parsed)) {
          return parsed
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean);
        }
      } catch {
        // Ignore parse failure and fall back to refs/state.
      }
    }
    if (draggedLineIdsRef.current.length) return [...draggedLineIdsRef.current];
    const single = resolveDraggedLineId();
    return single ? [single] : [];
  }

  function getActiveDragSelection(anchorLineId: string) {
    const anchorLine = draftLines.find((line) => line.id === anchorLineId);
    if (!anchorLine) return [anchorLineId];
    const sameQuotationSelected = selectedDragLineIds.filter((lineId) => {
      const candidate = draftLines.find((line) => line.id === lineId);
      return Boolean(candidate && candidate.draftState !== 'deleted' && candidate.quotationId === anchorLine.quotationId);
    });
    if (sameQuotationSelected.includes(anchorLineId)) return sameQuotationSelected;
    return [anchorLineId];
  }

  useEffect(() => {
    applyThemeColors(settings);
  }, [settings]);

  useEffect(() => {
    if (!isPointerDraggingLine) return;
    function handleWindowMouseUp() {
      if (!pointerDragDropHandledRef.current) {
        draggedLineIdRef.current = null;
        draggedLineIdsRef.current = [];
        setDraggedLineId(null);
        setDragOverLineId(null);
        setSelectedDragLineIds([]);
      }
      pointerDragDropHandledRef.current = false;
      setIsPointerDraggingLine(false);
    }
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, [isPointerDraggingLine]);

  useEffect(() => {
    let mounted = true;
    async function bootstrapIframeSession() {
      const params = new URLSearchParams(window.location.search);
      const tokenurl = params.get('tokenurl')?.trim() ?? '';
      const code = params.get('code')?.trim() ?? '';
      const publickey = params.get('publickey')?.trim() ?? '';
      const sessionid = params.get('sessionid')?.trim() ?? '';
      const dataurl = params.get('dataurl')?.trim() ?? '';
      const hasExchangeParams = Boolean(tokenurl && code && publickey && sessionid);
      const hasDataUrl = Boolean(dataurl);

      if (hasExchangeParams) {
        const exchangeKey = `${sessionid}:${code}`;
        const seenExchangeKey = sessionStorage.getItem(IFRAME_EXCHANGE_SEEN_KEY)?.trim() ?? '';
        if (seenExchangeKey === exchangeKey) {
          try {
            const existing = await fetchIframeSessionProfile(sessionid);
            if (!mounted) return;
            setIframeContextMode('method1');
            setIframeSession(existing.session);
            localStorage.setItem(IFRAME_SESSION_STORAGE_KEY, existing.session.sessionId);
            params.delete('tokenurl');
            params.delete('code');
            params.delete('publickey');
            params.delete('sessionid');
            const nextQuery = params.toString();
            window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
            return;
          } catch {
            // Fall through to retry exchange once.
          }
        }
        sessionStorage.setItem(IFRAME_EXCHANGE_SEEN_KEY, exchangeKey);
        try {
          const response = await exchangeIframeSession({ tokenurl, code, publickey, sessionid });
          if (!mounted) return;
          setIframeContextMode('method1');
          setIframeSession(response.session);
          localStorage.setItem(IFRAME_SESSION_STORAGE_KEY, response.session.sessionId);
          params.delete('tokenurl');
          params.delete('code');
          params.delete('publickey');
          params.delete('sessionid');
          const nextQuery = params.toString();
          window.history.replaceState({}, '', `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`);
          return;
        } catch (error) {
          if (!mounted) return;
          if (hasDataUrl) {
            // Method 2 fallback: projectcontext without user profile/locks.
            setIframeContextMode('method2');
            setIframeSession(null);
            localStorage.removeItem(IFRAME_SESSION_STORAGE_KEY);
          } else {
            setSaveError((error as Error).message);
          }
        }
      }

      if (hasDataUrl) {
        setIframeContextMode('method2');
        setIframeSession(null);
        localStorage.removeItem(IFRAME_SESSION_STORAGE_KEY);
        return;
      }

      const cachedSessionId = localStorage.getItem(IFRAME_SESSION_STORAGE_KEY)?.trim();
      if (!cachedSessionId) return;
      try {
        const response = await fetchIframeSessionProfile(cachedSessionId);
        if (!mounted) return;
        setIframeContextMode('method1');
        setIframeSession(response.session);
      } catch {
        localStorage.removeItem(IFRAME_SESSION_STORAGE_KEY);
        if (mounted) setIframeContextMode('none');
      }
    }
    void bootstrapIframeSession();
    return () => {
      mounted = false;
    };
  }, []);

  const defaultTableColumnKeys = useMemo(() => buildDefaultTableColumnKeys(settings), [settings]);
  const tableColumnKeys = useMemo(
    () => applyColumnOrder(defaultTableColumnKeys, Array.isArray(settings.columnOrder) ? settings.columnOrder : []),
    [defaultTableColumnKeys, settings.columnOrder],
  );

  useEffect(() => {
    localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, prId);
  }, [prId]);

  useEffect(() => {
    if (!urlProjectId) return;
    if (prId === urlProjectId) return;
    setPrId(urlProjectId);
  }, [urlProjectId, prId]);

  useEffect(() => {
    if (!settings.unitCostCalculatorEnabled && costCalculator) {
      setCostCalculator(null);
    }
  }, [settings.unitCostCalculatorEnabled, costCalculator]);

  useEffect(() => {
    if (defaultTableColumnKeys.join('|') === tableColumnKeys.join('|')) return;
    const rows = document.querySelectorAll('table tbody tr');
    rows.forEach((row) => {
      const cells = Array.from(row.children) as HTMLElement[];
      if (cells.length !== defaultTableColumnKeys.length) return;
      const reordered = tableColumnKeys.map((key) => {
        const idx = defaultTableColumnKeys.indexOf(key);
        return idx >= 0 ? cells[idx] : null;
      }).filter((x): x is HTMLElement => x !== null);
      if (reordered.length !== cells.length) return;
      reordered.forEach((cell) => row.appendChild(cell));
    });
  }, [defaultTableColumnKeys, tableColumnKeys, draftLines.length, expandedQuotationIds, expandedStageKeys]);

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      const state = resizeRef.current;
      if (!state) return;
      const delta = event.clientX - state.startX;
      setColumnWidths((prev) => ({ ...prev, [state.key]: Math.max(64, Math.round(state.startWidth + delta)) }));
    }

    function onMouseUp() {
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  useEffect(() => () => {
    if (saveSuccessTimeoutRef.current) {
      window.clearTimeout(saveSuccessTimeoutRef.current);
      saveSuccessTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isDeleteLineHotkey(event) && lineHotkeyRef.current) {
        event.preventDefault();
        lineHotkeyRef.current.remove();
        return;
      }
      if (isDuplicateLineHotkey(event) && lineHotkeyRef.current) {
        event.preventDefault();
        lineHotkeyRef.current.duplicate();
        return;
      }
      if (!isAddLineHotkey(event)) return;
      if (!addLineHotkeyRef.current) return;
      event.preventDefault();
      addLineHotkeyRef.current();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      setLoading(true);
      try {
        const nextBootstrapStatus = await fetchBootstrapStatus();
        if (!mounted) return;
        setBootstrapStatus(nextBootstrapStatus);
        if (!nextBootstrapStatus.ready) return;

        const [settingsData, projectOptions] = await Promise.all([fetchSettings(), fetchProjects()]);
        if (!mounted) return;
        setSettings(settingsData);
        setProjects(projectOptions);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [refreshVersion, iframeSession?.sessionId, iframeContextMode]);

  useEffect(() => {
    let mounted = true;
    async function refreshWriteAuthStatusEffect() {
      try {
        const status = await fetchAfasWriteAuthStatus();
        if (mounted) setWriteAuthStatus(status);
      } catch (error) {
        if (!mounted) return;
        setWriteAuthStatus({
          ...DEFAULT_WRITE_AUTH_STATUS,
          mode: settings.writeAuthMode,
          message: (error as Error).message,
        });
      }
    }
    void refreshWriteAuthStatusEffect();
    return () => {
      mounted = false;
    };
  }, [settings.writeAuthMode, iframeSession?.sessionId]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const payload = event.data as { type?: string; ok?: boolean; message?: string } | null;
      if (!payload || payload.type !== 'afas-oauth-complete') return;
      setWriteAuthBusy(false);
      void Promise.all([fetchAfasWriteAuthStatus(), fetchBootstrapStatus().catch(() => undefined)])
        .then(([status, nextBootstrapStatus]) => {
          setWriteAuthStatus(status);
          if (nextBootstrapStatus) setBootstrapStatus(nextBootstrapStatus);
          if (pendingSaveAfterAuthRef.current && status.authenticated) {
            pendingSaveAfterAuthRef.current = false;
            void handleSave();
          }
        })
        .catch((error) =>
          setWriteAuthStatus({
            ...DEFAULT_WRITE_AUTH_STATUS,
            mode: settings.writeAuthMode,
            message: (error as Error).message,
          }),
        );
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [settings.writeAuthMode]);

  useEffect(() => {
    let mounted = true;

    async function loadLibraryContext() {
      if (!bootstrapStatus.ready) {
        setLibraryProject(null);
        setLibraryStages([]);
        setLibraryQuotations([]);
        setLibraryLines([]);
        return;
      }
      try {
        const [projectResult, stagesResult, quotationsResult, linesResult] = await Promise.allSettled([
          fetchProject('BIB'),
          fetchProjectStages('BIB'),
          fetchQuotations('BIB'),
          fetchQuotationLines('BIB'),
        ]);
        if (!mounted) return;

        if (projectResult.status !== 'fulfilled' || stagesResult.status !== 'fulfilled') {
          throw new Error('Bibliotheek kon niet worden geladen.');
        }

        const projectData = projectResult.value;
        const stagesData = stagesResult.value;
        const quotationsData = quotationsResult.status === 'fulfilled' ? quotationsResult.value : [];
        const linesData = linesResult.status === 'fulfilled' ? linesResult.value : [];

        setLibraryProject(projectData);
        setLibraryStages([...stagesData].map((stage) => ({ ...stage, chargeMode: stage.chargeMode ?? '0' })).sort((a, b) => a.order - b.order));
        setLibraryQuotations([...quotationsData].sort((a, b) => a.order - b.order));
        setLibraryLines(
          [...linesData]
            .map((line) => normalizeMeasurementLine(line))
            .filter((line) => !parsePhaseMarkupMemo(line.markupFormulaMemo))
            .map((line, idx) => ({ ...line, order: Number.isFinite(line.order) ? line.order : idx + 1 }))
            .sort(compareQuotationLines),
        );
      } catch {
        if (!mounted) return;
        setLibraryProject(null);
        setLibraryStages([]);
        setLibraryQuotations([]);
        setLibraryLines([]);
      }
    }

    void loadLibraryContext();

    return () => {
      mounted = false;
    };
  }, [bootstrapStatus.ready]);

  useEffect(() => {
    let mounted = true;
    async function loadProjectContext() {
      if (!bootstrapStatus.ready) {
        setLoading(false);
        return;
      }
      if (!prId) {
        setProject(null);
        setStages([]);
        setSelectedStageIds([]);
        setQuotations([]);
        setSelectedQuotationIds([]);
        setDraftLines([]);
        setPersistedPhaseMarkupLinesByKey({});
        setAggregateMarkupsByGroup({});
        setHasPendingAggregateMarkupChanges(false);
        return;
      }
      setLoading(true);
      setSaveError('');
      try {
        const [projectResult, stagesResult, quotationsResult, linesResult] = await Promise.allSettled([
          fetchProject(prId),
          fetchProjectStages(prId),
          fetchQuotations(prId),
          fetchQuotationLines(prId),
        ]);
        if (!mounted) return;

        if (projectResult.status !== 'fulfilled') {
          throw projectResult.reason;
        }
        if (stagesResult.status !== 'fulfilled') {
          throw stagesResult.reason;
        }

        const projectData = projectResult.value;
        const stagesData = stagesResult.value;
        const quotationsData = quotationsResult.status === 'fulfilled' ? quotationsResult.value : [];
        const linesData = linesResult.status === 'fulfilled' ? linesResult.value : [];
        const loadWarnings = [quotationsResult, linesResult]
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)))
          .filter(Boolean);

        const sortedStages = [...stagesData].map((stage) => ({ ...stage, chargeMode: stage.chargeMode ?? '0' })).sort((a, b) => a.order - b.order);
        const stageIdSet = new Set(sortedStages.map((stage) => stage.id));
        const sortedQuotations = [...quotationsData].sort((a, b) => a.order - b.order);

        setProject(projectData);
        setStages(sortedStages);
        const normalizedIncomingLines = [...linesData].map((line, idx) => ({
          ...normalizeMeasurementLine(line),
          purchaseEnabled: isNonPurchasableLine(line) ? false : (line.purchaseEnabled ?? true),
          stageId: stageIdSet.has(line.stageId) ? line.stageId : NO_STAGE_ID,
          order: Number.isFinite(line.order) ? line.order : idx + 1,
        }));
        const persistedPhaseMarkupLines: Record<string, QuotationLine> = {};
        const visibleLines = normalizedIncomingLines.filter((line) => {
          const parsed = parsePhaseMarkupMemo(line.markupFormulaMemo);
          if (!parsed) return true;
          const key = buildPhaseMarkupLineKey(
            parsed.quotationId || line.quotationId,
            parsed.stageId || line.stageId || NO_STAGE_ID,
            parsed.markupType,
          );
          persistedPhaseMarkupLines[key] = line;
          return false;
        });
        const nextAggregateMarkupsByGroup: Record<string, Partial<Record<MarkupType, number>>> = {};
        sortedQuotations.forEach((quotation) => {
          sortedStages.forEach((stage) => {
            nextAggregateMarkupsByGroup[buildPhaseMarkupGroupKey(quotation.id, stage.id)] = {
              ...(stage.phaseMarkups ?? {}),
            };
          });
          nextAggregateMarkupsByGroup[buildPhaseMarkupGroupKey(quotation.id, NO_STAGE_ID)] = {
            ...(projectData.projectMarkups ?? {}),
          };
        });
        Object.values(persistedPhaseMarkupLines).forEach((line) => {
          const parsed = parsePhaseMarkupMemo(line.markupFormulaMemo);
          if (!parsed) return;
          const groupKey = buildPhaseMarkupGroupKey(parsed.quotationId || line.quotationId, parsed.stageId || line.stageId);
          const current = { ...(nextAggregateMarkupsByGroup[groupKey] ?? {}) };
          current[parsed.markupType] = toNonNegative(Number(parsed.markupValue ?? 0));
          nextAggregateMarkupsByGroup[groupKey] = current;
        });
        const hasNoPhaseLines = visibleLines.some((line) => line.stageId === NO_STAGE_ID);
        setSelectedStageIds([
          ...sortedStages.map((stage) => stage.id),
          ...(hasNoPhaseLines ? [NO_STAGE_ID] : []),
        ]);
        setQuotations(sortedQuotations);
        setSelectedQuotationIds(sortedQuotations.map((quotation) => quotation.id));
        setExpandedQuotationIds(sortedQuotations.map((quotation) => quotation.id));

        const stageKeys = sortedQuotations.flatMap((quotation) =>
          sortedStages.map((stage) => `${quotation.id}:${stage.id}`),
        );
        setExpandedStageKeys(stageKeys);

        const sortedLines = [...visibleLines]
          .sort(compareQuotationLines);
        setPersistedPhaseMarkupLinesByKey(persistedPhaseMarkupLines);
        setAggregateMarkupsByGroup(nextAggregateMarkupsByGroup);
        setDraftLines(sortedLines.map((line) => ({ ...line, draftState: 'clean' as DraftState })));
        setHasPendingAggregateMarkupChanges(false);
        if (loadWarnings.length) {
          setSaveError(`Project en fases geladen, maar voorcalculaties/regels nog niet: ${loadWarnings[0]}`);
        }
      } catch (error) {
        if (mounted) {
          setSaveError((error as Error).message);
          setPersistedPhaseMarkupLinesByKey({});
          setAggregateMarkupsByGroup({});
          setHasPendingAggregateMarkupChanges(false);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadProjectContext();
    return () => {
      mounted = false;
    };
  }, [prId, bootstrapStatus.ready]);

  useEffect(() => {
    const sessionId = iframeSession?.sessionId;
    if (!prId || !sessionId) {
      previousSelectedQuotationIdsRef.current = selectedQuotationIds;
      return;
    }
    const lockSessionId = sessionId;
    let cancelled = false;
    const previous = previousSelectedQuotationIdsRef.current;
    const removed = previous.filter((id) => !selectedQuotationIds.includes(id));
    const current = [...selectedQuotationIds];
    previousSelectedQuotationIdsRef.current = current;

    async function syncLocks() {
      if (removed.length) {
        await Promise.all(
          removed.map((quotationId) =>
            releaseQuotationLock({
              projectId: prId,
              quotationId,
              sessionId: lockSessionId,
            }).catch(() => ({ ok: false })),
          ),
        );
      }

      const results = await Promise.all(
        current.map(async (quotationId) => {
          try {
            const result = await claimQuotationLock({
              projectId: prId,
              quotationId,
              sessionId: lockSessionId,
            });
            return { quotationId, result };
          } catch {
            return {
              quotationId,
              result: { ok: false as const, reason: 'invalid_request' as const },
            };
          }
        }),
      );

      if (cancelled) return;
      setQuotationLocks((prev) => {
        const next: Record<string, QuotationLockState> = { ...prev };
        removed.forEach((quotationId) => {
          delete next[quotationId];
        });
        results.forEach(({ quotationId, result }) => {
          next[quotationId] = {
            mine: Boolean(result.ok),
            lock: result.lock,
          };
        });
        return next;
      });

      const lockConflict = results.find(({ result }) => !result.ok && result.reason === 'locked_by_other');
      if (lockConflict?.result.lock) {
        const lock = lockConflict.result.lock;
        setSaveError(`Voorcalculatie ${lock.quotationId} is in bewerking door ${lock.ownerDisplayName}.`);
      }
    }

    void syncLocks();
    return () => {
      cancelled = true;
    };
  }, [prId, selectedQuotationIds, iframeSession?.sessionId]);

  useEffect(() => {
    const sessionId = iframeSession?.sessionId;
    if (!prId || !sessionId) return;
    const lockSessionId = sessionId;
    const ownedQuotationIds = selectedQuotationIds.filter((quotationId) => quotationLocks[quotationId]?.mine);
    if (!ownedQuotationIds.length) return;

    const timer = window.setInterval(() => {
      void Promise.all(
        ownedQuotationIds.map((quotationId) =>
          heartbeatQuotationLock({
            projectId: prId,
            quotationId,
            sessionId: lockSessionId,
          }),
        ),
      ).catch(() => {
        // Ignore heartbeat errors here; claim flow will pick this up on next interaction.
      });
    }, LOCK_HEARTBEAT_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [prId, iframeSession?.sessionId, selectedQuotationIds, quotationLocks]);

  useEffect(() => {
    function releaseAllOwnedLocks() {
      if (!prId || !iframeSession?.sessionId) return;
      const ownedQuotationIds = selectedQuotationIds.filter((quotationId) => quotationLocks[quotationId]?.mine);
      ownedQuotationIds.forEach((quotationId) => {
        void releaseQuotationLock({
          projectId: prId,
          quotationId,
          sessionId: iframeSession.sessionId,
        }).catch(() => undefined);
      });
    }
    window.addEventListener('pagehide', releaseAllOwnedLocks);
    return () => {
      window.removeEventListener('pagehide', releaseAllOwnedLocks);
    };
  }, [prId, iframeSession?.sessionId, selectedQuotationIds, quotationLocks]);

  const visibleQuotations = useMemo(
    () => quotations.filter((quotation) => selectedQuotationIds.includes(quotation.id)),
    [quotations, selectedQuotationIds],
  );

  const sessionStatusSummary = useMemo(() => {
    const selectedLocks = selectedQuotationIds.map((quotationId) => quotationLocks[quotationId]).filter(Boolean);
    const ownedCount = selectedLocks.filter((lockState) => lockState?.mine).length;
    const blockedCount = selectedLocks.filter((lockState) => lockState?.lock && !lockState.mine).length;

    if (iframeContextMode === 'method1' && iframeSession?.sessionId) {
      return {
        modeLabel: 'Locks actief',
        modeClassName: 'text-emerald-700',
        detail: `${ownedCount} van jou${blockedCount ? `, ${blockedCount} bezet` : ''}`,
      };
    }

    if (iframeContextMode === 'method2') {
      return {
        modeLabel: 'Classic modus',
        modeClassName: 'text-sky-700',
        detail: 'geen gebruikerslocks',
      };
    }

    return {
      modeLabel: 'Geen sessieprofiel',
      modeClassName: 'text-amber-700',
      detail: 'locks niet beschikbaar',
    };
  }, [iframeContextMode, iframeSession?.sessionId, quotationLocks, selectedQuotationIds]);

  function getLockedQuotationInfo(quotationId: string) {
    if (iframeContextMode !== 'method1' || !iframeSession?.sessionId) return null;
    const lockState = quotationLocks[quotationId];
    if (!lockState?.lock || lockState.mine) return null;
    return lockState.lock;
  }

  function renderLockedQuotationBadge(quotationId: string) {
    const lock = getLockedQuotationInfo(quotationId);
    if (!lock) return null;
    return (
      <span className="rounded bg-rose-100 px-2 py-1 text-[10px] font-semibold text-rose-700">
        Bezet door {lock.ownerDisplayName}
      </span>
    );
  }

  function renderLockedQuotationOverlay(quotationId: string) {
    const lock = getLockedQuotationInfo(quotationId);
    if (!lock) return null;
    return (
      <div className="absolute inset-0 z-20 flex items-center justify-center rounded border border-rose-200 bg-white/75 p-4 backdrop-blur-[1px]">
        <div className="max-w-md rounded-lg border border-rose-200 bg-white px-4 py-3 text-center shadow-sm">
          <p className="text-sm font-semibold text-rose-700">Deze voorcalculatie is tijdelijk vergrendeld.</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {lock.ownerDisplayName} is hier nu in aan het werken. Je kunt de inhoud bekijken, maar niet aanpassen totdat de lock vrijkomt.
          </p>
        </div>
      </div>
    );
  }

  async function startAfasOAuthFromApp(continueSave = false) {
    setWriteAuthBusy(true);
    try {
      if (!writeAuthStatus.oauthConfigured) {
        throw new Error(writeAuthStatus.message || 'OAuth backend is nog niet ingericht.');
      }
      pendingSaveAfterAuthRef.current = continueSave;
      const popupUrl = await getAfasOAuthStartUrl();
      const popup = window.open(popupUrl, 'afas-oauth-login', 'popup=yes,width=720,height=820');
      if (!popup) throw new Error('Popup geblokkeerd. Sta popups toe voor AFAS-login.');
      popup.focus();
    } catch (error) {
      pendingSaveAfterAuthRef.current = false;
      setWriteAuthBusy(false);
      setSaveError((error as Error).message);
    }
  }

  async function refreshWriteAuthStatusFromApp() {
    setWriteAuthBusy(true);
    try {
      const [status, nextBootstrapStatus] = await Promise.all([
        fetchAfasWriteAuthStatus(),
        fetchBootstrapStatus().catch(() => undefined),
      ]);
      setWriteAuthStatus(status);
      if (nextBootstrapStatus) setBootstrapStatus(nextBootstrapStatus);
    } catch (error) {
      setWriteAuthStatus({
        ...DEFAULT_WRITE_AUTH_STATUS,
        mode: settings.writeAuthMode,
        message: (error as Error).message,
      });
    } finally {
      setWriteAuthBusy(false);
    }
  }

  function refreshAppView() {
    setRefreshVersion((current) => current + 1);
  }

  async function openOauthLogin() {
    await startAfasOAuthFromApp();
  }

  const hasVisibleNoPhaseLines = useMemo(
    () =>
      draftLines.some(
        (line) =>
          line.draftState !== 'deleted' &&
          line.stageId === NO_STAGE_ID &&
          selectedQuotationIds.includes(line.quotationId),
      ),
    [draftLines, selectedQuotationIds],
  );

  const selectableStageIds = useMemo(
    () => [...stages.map((stage) => stage.id), ...(hasVisibleNoPhaseLines ? [NO_STAGE_ID] : [])],
    [stages, hasVisibleNoPhaseLines],
  );

  const activeStageIds = useMemo(() => {
    if (!showPhasePanel) return selectableStageIds;
    return selectedStageIds;
  }, [showPhasePanel, selectedStageIds, selectableStageIds]);

  const activeLines = useMemo(
    () =>
      draftLines.filter(
        (line) =>
          line.draftState !== 'deleted' &&
          selectedQuotationIds.includes(line.quotationId) &&
          (!showPhasePanel || activeStageIds.includes(line.stageId)),
      ),
    [draftLines, selectedQuotationIds, activeStageIds, showPhasePanel],
  );

  const visibleStageIds = useMemo(
    () => {
      return selectableStageIds.filter((stageId) => activeStageIds.includes(stageId));
    },
    [selectableStageIds, activeStageIds],
  );

  const lineComputed = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calcLine>>();
    activeLines.forEach((line) => {
      map.set(line.id, calcLine({ ...line, phaseId: line.stageId }, activeLineMarkupConfigs));
    });
    return map;
  }, [activeLines, activeLineMarkupConfigs]);

  const stageLineCount = useMemo(() => {
    const map = new Map<string, number>();
    stages.forEach((stage) => map.set(stage.id, 0));
    draftLines.forEach((line) => {
      if (line.draftState === 'deleted') return;
      if (!selectedQuotationIds.includes(line.quotationId)) return;
      map.set(line.stageId, (map.get(line.stageId) ?? 0) + 1);
    });
    return map;
  }, [stages, draftLines, selectedQuotationIds]);

  const hasDirtyChanges = useMemo(
    () =>
      hasPendingAggregateMarkupChanges ||
      draftLines.some((line) => line.draftState === 'new' || line.draftState === 'updated' || line.draftState === 'deleted'),
    [draftLines, hasPendingAggregateMarkupChanges],
  );

  const dirtyQuotationIds = useMemo(
    () => {
      const dirtyFromDraft = draftLines
        .filter((line) => line.draftState !== 'clean')
        .map((line) => line.quotationId)
        .filter(Boolean);
      const dirtyFromAggregate = hasPendingAggregateMarkupChanges ? selectedQuotationIds : [];
      return [...new Set([...dirtyFromDraft, ...dirtyFromAggregate])].filter(Boolean);
    },
    [draftLines, hasPendingAggregateMarkupChanges, selectedQuotationIds],
  );

  const dirtyQuotationWithoutLock = useMemo(() => {
    if (!iframeSession?.sessionId) return null;
    const missingId = dirtyQuotationIds.find((quotationId) => !quotationLocks[quotationId]?.mine);
    if (!missingId) return null;
    return {
      quotationId: missingId,
      lock: quotationLocks[missingId]?.lock,
    };
  }, [dirtyQuotationIds, quotationLocks, iframeSession?.sessionId]);

  function buildLineMutation(line: DraftQuotationLine, orderById: Map<string, number>): QuotationLineMutation {
    const computed = lineComputed.get(line.id) ?? calcLine({ ...line, phaseId: line.stageId }, activeLineMarkupConfigs);
    return {
      quotationId: line.quotationId,
      stageId: line.stageId,
      order: orderById.get(line.id) ?? line.order,
      lineType: line.lineType,
      itemCode: line.itemCode,
      description: line.description,
      supplierId: line.supplierId,
      supplierName: line.supplierName,
      purchaseEnabled: isNonPurchasableLine(line) ? false : (line.purchaseEnabled ?? true),
      baseQty: line.baseQty,
      computedQty: computed?.computedQty ?? line.baseQty,
      unit: line.unit,
      qtyFormula: line.qtyFormula,
      qtyFormulaMemo: line.qtyFormulaMemo,
      costFormula: line.costFormula,
      costFormulaMemo: line.costFormulaMemo,
      markupFormulaMemo: serializeMarkupFormulaMemo(line),
      ...extractLineMarkupFields(line),
      unitCost: line.unitCost,
      computedUnitCost: computed?.computedUnitCost ?? line.unitCost,
      purchasePrice: line.purchasePrice,
      unitPrice: line.unitPrice,
      computedUnitPrice: computed?.computedUnitPrice ?? line.unitPrice,
    };
  }

  function buildSavePayload(sourceLines: DraftQuotationLine[]): SaveQuotationLinesPayload {
    const create: QuotationLineMutation[] = [];
    const update: QuotationLineMutation[] = [];
    const remove: Array<{ id: string }> = [];

    const ordered = normalizeGroupOrder(sourceLines);
    const orderById = new Map(ordered.filter((line) => line.draftState !== 'deleted').map((line) => [line.id, line.order]));

    ordered.forEach((line) => {
      const payload = buildLineMutation(line, orderById);
      if (line.draftState === 'new') create.push(payload);
      if (line.draftState === 'updated') update.push({ id: line.id, ...payload });
      if (line.draftState === 'deleted') remove.push({ id: line.id });
    });

    return { create, update, delete: remove };
  }

  const activeCalculatorLine = useMemo(() => {
    const lineId = costCalculator?.lineId ?? qtyCalculator?.lineId ?? measurementConfigLineId;
    if (!lineId) return null;
    return draftLines.find((line) => line.id === lineId) ?? null;
  }, [costCalculator?.lineId, qtyCalculator?.lineId, measurementConfigLineId, draftLines]);

  useEffect(() => {
    if (!prId || loading || saveInFlightRef.current || hasDirtyChanges) return;
    if (settings.writeAuthMode === 'oauth_user' && !writeAuthStatus.authenticated) return;

    const missingOrderLines = draftLines.filter(
      (line) =>
        line.draftState === 'clean' &&
        !line.orderHasLineNo &&
        !line.id.startsWith('tmp-'),
    );
    if (!missingOrderLines.length) {
      backgroundOrderSyncAttemptRef.current = '';
      return;
    }

    const blockedLine = missingOrderLines.find((line) => !quotationLocks[line.quotationId]?.mine);
    if (blockedLine) return;

    const signature = `${prId}:${missingOrderLines.map((line) => `${line.id}:${line.order}`).join('|')}`;
    if (backgroundOrderSyncAttemptRef.current === signature) return;
    backgroundOrderSyncAttemptRef.current = signature;

    const ordered = normalizeGroupOrder(draftLines);
    const orderById = new Map(ordered.filter((line) => line.draftState !== 'deleted').map((line) => [line.id, line.order] as const));
    const updates = missingOrderLines.map((line) => ({
      id: line.id,
      ...buildLineMutation(line, orderById),
    }));

    if (!updates.length) return;

    saveInFlightRef.current = true;
    void saveQuotationLines(prId, { create: [], update: updates, delete: [] })
      .then(() => {
        setDraftLines((prev) =>
          prev.map((line) =>
            updates.some((update) => update.id === line.id)
              ? { ...line, order: orderById.get(line.id) ?? line.order, orderHasLineNo: true }
              : line,
          ),
        );
      })
      .catch((error) => {
        console.error('Automatisch aanvullen van regelvolgorde mislukt.', error);
      })
      .finally(() => {
        saveInFlightRef.current = false;
      });
  }, [prId, loading, hasDirtyChanges, draftLines, quotationLocks, settings.writeAuthMode, writeAuthStatus.authenticated, activeLineMarkupConfigs, lineComputed]);

  const draggedLine = useMemo(() => {
    if (!draggedLineId) return null;
    return draftLines.find((line) => line.id === draggedLineId) ?? null;
  }, [draggedLineId, draftLines]);

  function sortLineIdsByDisplayOrder(lineIds: string[]) {
    const idSet = new Set(lineIds);
    return draftLines
      .filter((line) => line.draftState !== 'deleted' && idSet.has(line.id))
      .sort((a, b) => {
        if (a.quotationId !== b.quotationId) return a.quotationId.localeCompare(b.quotationId, 'nl');
        if (a.stageId !== b.stageId) return a.stageId.localeCompare(b.stageId, 'nl');
        if (a.order !== b.order) return a.order - b.order;
        return a.id.localeCompare(b.id, 'nl');
      })
      .map((line) => line.id);
  }

  function moveLinesBeforeTarget(sourceLineIds: string[], targetLineId: string) {
    const ordered = sortLineIdsByDisplayOrder(sourceLineIds).filter((id) => id !== targetLineId);
    ordered.forEach((sourceLineId) => moveLineBeforeTarget(sourceLineId, targetLineId));
  }

  function moveLinesToGroupEnd(sourceLineIds: string[], quotationId: string, stageId: string) {
    const ordered = sortLineIdsByDisplayOrder(sourceLineIds);
    ordered.forEach((sourceLineId) => moveLineToGroupEnd(sourceLineId, quotationId, stageId));
  }

  const libraryLineCountByQuotation = useMemo(() => {
    const map = new Map<string, number>();
    libraryQuotations.forEach((quotation) => map.set(quotation.id, 0));
    libraryLines.forEach((line) => map.set(line.quotationId, (map.get(line.quotationId) ?? 0) + 1));
    return map;
  }, [libraryQuotations, libraryLines]);

  const overallTotals = useMemo(() => {
    let cost = 0;
    let amount = 0;

    visibleQuotations.forEach((quotation) => {
      const quotationLines = activeLines.filter((line) => line.quotationId === quotation.id);

      if (!showPhasePanel) {
        const subtotalCost = quotationLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.costTotal ?? 0), 0);
        const subtotalAmount = quotationLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.priceTotal ?? 0), 0);
        const totals = calcAggregateTotals(
          subtotalCost,
          subtotalAmount,
          project?.projectMarkups ?? {},
          activePhaseMarkupConfigs,
        );
        cost += totals.totalCostInclMarkups;
        amount += totals.totalAmountInclMarkups;
        return;
      }

      stages
        .filter((stage) => activeStageIds.includes(stage.id))
        .forEach((stage) => {
          const stageLines = quotationLines.filter((line) => line.stageId === stage.id);
          const subtotalCost = stageLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.costTotal ?? 0), 0);
          const subtotalAmount = stageLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.priceTotal ?? 0), 0);
          const totals = calcAggregateTotals(
            subtotalCost,
            subtotalAmount,
            stage.phaseMarkups ?? {},
            activePhaseMarkupConfigs,
          );
          cost += totals.totalCostInclMarkups;
          amount += totals.totalAmountInclMarkups;
        });

      const noStageLines = quotationLines.filter((line) => line.stageId === NO_STAGE_ID);
      cost += noStageLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.costTotal ?? 0), 0);
      amount += noStageLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.priceTotal ?? 0), 0);
    });

    return { cost, amount };
  }, [
    visibleQuotations,
    activeLines,
    showPhasePanel,
    project?.projectMarkups,
    stages,
    activeStageIds,
    lineComputed,
    activePhaseMarkupConfigs,
  ]);

  const allExpanded = useMemo(() => {
    const visibleQuotationIds = visibleQuotations.map((quotation) => quotation.id);
    if (!visibleQuotationIds.length) return false;
    const allQuotationsOpen = visibleQuotationIds.every((id) => expandedQuotationIds.includes(id));
    const allStagesOpen =
      !showPhasePanel ||
      visibleQuotationIds.every((quotationId) =>
        visibleStageIds.every((stageId) => expandedStageKeys.includes(`${quotationId}:${stageId}`)),
      );
    return allQuotationsOpen && allStagesOpen;
  }, [visibleQuotations, expandedQuotationIds, showPhasePanel, visibleStageIds, expandedStageKeys]);

  function updateDraftLine(lineId: string, patch: Partial<DraftQuotationLine>) {
    setDraftLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const next = { ...line, ...patch };
        if (isNonPurchasableLine(next)) next.purchaseEnabled = false;
        if (line.draftState === 'clean' && patch.draftState === undefined) next.draftState = 'updated';
        return next;
      }),
    );
  }

  function toggleStageFilter(stageId: string, checked: boolean) {
    setSelectedStageIds((prev) => (checked ? [...new Set([...prev, stageId])] : prev.filter((id) => id !== stageId)));
  }

  function toggleQuotationSelection(quotationId: string) {
    setSelectedQuotationIds((prev) => {
      const has = prev.includes(quotationId);
      if (has && prev.length === 1) return prev;
      return has ? prev.filter((id) => id !== quotationId) : [...prev, quotationId];
    });
  }

  function normalizeGroupOrder(lines: DraftQuotationLine[]): DraftQuotationLine[] {
    const groupIndexes = new Map<string, number>();
    return lines.map((line) => {
      if (line.draftState === 'deleted') return line;
      const key = `${line.quotationId}::${line.stageId}`;
      const nextOrder = (groupIndexes.get(key) ?? 0) + 1;
      groupIndexes.set(key, nextOrder);
      if (line.order === nextOrder) return line;
      return {
        ...line,
        order: nextOrder,
        draftState: line.draftState === 'clean' ? 'updated' : line.draftState,
      };
    });
  }

  function moveLineToGroupEnd(sourceLineId: string, quotationId: string, stageId: string) {
    setDraftLines((prev) => {
      const source = prev.find((line) => line.id === sourceLineId);
      if (!source || source.draftState === 'deleted') return prev;
      if (source.quotationId !== quotationId) return prev;
      const sourceStageId = source.stageId;
      const targetIds = prev
        .filter(
          (line) =>
            line.draftState !== 'deleted' &&
            line.quotationId === quotationId &&
            line.stageId === stageId &&
            line.id !== sourceLineId,
        )
        .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id, 'nl')))
        .map((line) => line.id);
      const nextTargetIds = [...targetIds, sourceLineId];

      const currentTargetIds = prev
        .filter(
          (line) =>
            line.draftState !== 'deleted' &&
            line.quotationId === quotationId &&
            line.stageId === stageId,
        )
        .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id, 'nl')))
        .map((line) => line.id);
      const isNoOp =
        sourceStageId === stageId &&
        currentTargetIds.length === nextTargetIds.length &&
        currentTargetIds.every((id, index) => id === nextTargetIds[index]);
      if (isNoOp) return prev;

      let next = prev.map((line) => {
        if (line.id !== sourceLineId) return line;
        const patched = { ...line, stageId };
        if (patched.draftState === 'clean') patched.draftState = 'updated';
        return patched;
      });
      const targetOrderById = new Map(nextTargetIds.map((id, index) => [id, index + 1] as const));
      next = next.map((line) => {
        if (line.draftState === 'deleted') return line;
        if (line.quotationId !== quotationId || line.stageId !== stageId) return line;
        const targetOrder = targetOrderById.get(line.id);
        if (!targetOrder || line.order === targetOrder) return line;
        const patched = { ...line, order: targetOrder };
        if (patched.draftState === 'clean') patched.draftState = 'updated';
        return patched;
      });

      if (sourceStageId !== stageId) {
        const sourceRemainingIds = next
          .filter(
            (line) =>
              line.draftState !== 'deleted' &&
              line.quotationId === quotationId &&
              line.stageId === sourceStageId,
          )
          .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id, 'nl')))
          .map((line) => line.id);
        const sourceOrderById = new Map(sourceRemainingIds.map((id, index) => [id, index + 1] as const));
        next = next.map((line) => {
          if (line.draftState === 'deleted') return line;
          if (line.quotationId !== quotationId || line.stageId !== sourceStageId) return line;
          const targetOrder = sourceOrderById.get(line.id);
          if (!targetOrder || line.order === targetOrder) return line;
          const patched = { ...line, order: targetOrder };
          if (patched.draftState === 'clean') patched.draftState = 'updated';
          return patched;
        });
      }

      return next;
    });
  }

  function moveLineBeforeTarget(sourceLineId: string, targetLineId: string) {
    if (sourceLineId === targetLineId) return;

    setDraftLines((prev) => {
      const source = prev.find((line) => line.id === sourceLineId);
      const target = prev.find((line) => line.id === targetLineId);
      if (!source || !target) return prev;
      if (source.draftState === 'deleted' || target.draftState === 'deleted') return prev;
      if (source.quotationId !== target.quotationId) return prev;
      const quotationId = source.quotationId;
      const sourceStageId = source.stageId;
      const targetStageId = target.stageId;
      const targetIds = prev
        .filter(
          (line) =>
            line.draftState !== 'deleted' &&
            line.quotationId === quotationId &&
            line.stageId === targetStageId &&
            line.id !== sourceLineId,
        )
        .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id, 'nl')))
        .map((line) => line.id);
      const targetIndex = targetIds.indexOf(targetLineId);
      if (targetIndex < 0) return prev;
      const nextTargetIds = [...targetIds];
      nextTargetIds.splice(targetIndex, 0, sourceLineId);

      const currentTargetIds = prev
        .filter(
          (line) =>
            line.draftState !== 'deleted' &&
            line.quotationId === quotationId &&
            line.stageId === targetStageId,
        )
        .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id, 'nl')))
        .map((line) => line.id);
      const isNoOp =
        sourceStageId === targetStageId &&
        currentTargetIds.length === nextTargetIds.length &&
        currentTargetIds.every((id, index) => id === nextTargetIds[index]);
      if (isNoOp) return prev;

      let next = prev.map((line) => {
        if (line.id !== sourceLineId) return line;
        const patched = { ...line, stageId: targetStageId };
        if (patched.draftState === 'clean') patched.draftState = 'updated';
        return patched;
      });
      const targetOrderById = new Map(nextTargetIds.map((id, index) => [id, index + 1] as const));
      next = next.map((line) => {
        if (line.draftState === 'deleted') return line;
        if (line.quotationId !== quotationId || line.stageId !== targetStageId) return line;
        const targetOrder = targetOrderById.get(line.id);
        if (!targetOrder || line.order === targetOrder) return line;
        const patched = { ...line, order: targetOrder };
        if (patched.draftState === 'clean') patched.draftState = 'updated';
        return patched;
      });

      if (sourceStageId !== targetStageId) {
        const sourceRemainingIds = next
          .filter(
            (line) =>
              line.draftState !== 'deleted' &&
              line.quotationId === quotationId &&
              line.stageId === sourceStageId,
          )
          .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id, 'nl')))
          .map((line) => line.id);
        const sourceOrderById = new Map(sourceRemainingIds.map((id, index) => [id, index + 1] as const));
        next = next.map((line) => {
          if (line.draftState === 'deleted') return line;
          if (line.quotationId !== quotationId || line.stageId !== sourceStageId) return line;
          const targetOrder = sourceOrderById.get(line.id);
          if (!targetOrder || line.order === targetOrder) return line;
          const patched = { ...line, order: targetOrder };
          if (patched.draftState === 'clean') patched.draftState = 'updated';
          return patched;
        });
      }

      return next;
    });
  }

  function insertLibraryQuotationIntoGroup(libraryQuotationId: string, targetQuotationId: string, targetStageId: string) {
    if (!prId) return;

    setDraftLines((prev) => {
      const sourceLines = libraryLines
        .filter((line) => line.quotationId === libraryQuotationId)
        .sort((a, b) => {
          if (a.stageId !== b.stageId) return a.stageId.localeCompare(b.stageId, 'nl');
          if (a.order !== b.order) return a.order - b.order;
          return a.id.localeCompare(b.id, 'nl');
        });

      if (!sourceLines.length) return prev;

      let orderCursor =
        prev
          .filter((line) => line.draftState !== 'deleted' && line.quotationId === targetQuotationId && line.stageId === targetStageId)
          .reduce((max, line) => Math.max(max, line.order), 0);

      const clones: DraftQuotationLine[] = sourceLines.map((line) => {
        orderCursor += 1;
        return {
          ...line,
          id: `tmp-${crypto.randomUUID()}`,
          projectId: prId,
          quotationId: targetQuotationId,
          stageId: targetStageId,
          order: orderCursor,
          ...extractLineMarkupFields(line),
          measurementFixedLength: line.measurementFixedLength,
          measurementFixedWidth: line.measurementFixedWidth,
          measurementSpecCode: line.measurementSpecCode,
          measurementSpec: line.measurementSpec,
          qtyFormula: line.qtyFormula ? { ...line.qtyFormula } : undefined,
          qtyFormulaMemo: line.qtyFormulaMemo,
          costFormula: line.costFormula ? { rows: line.costFormula.rows.map((row) => ({ ...row })) } : undefined,
          supplierId: line.supplierId,
          supplierName: line.supplierName,
          purchaseEnabled: line.purchaseEnabled ?? true,
          purchasePrice: line.purchasePrice,
          draftState: 'new',
        };
      });

      return [...prev, ...clones];
    });
  }

  function addLineToGroup(quotationId: string, stageId: string) {
    setDraftLines((prev) => {
      const nextOrder =
        prev
          .filter((line) => line.draftState !== 'deleted' && line.quotationId === quotationId && line.stageId === stageId)
          .reduce((max, line) => Math.max(max, line.order), 0) + 1;

      const defaultLineMarkups = Object.fromEntries(
        Object.entries(settings.lineMarkupPreferenceValues ?? {})
          .map(([type, value]) => [type, Number(value) || 0])
          .filter(([, value]) => value !== 0),
      );

      return [
        ...prev,
        {
        id: `tmp-${crypto.randomUUID()}`,
        projectId: prId,
        quotationId,
        stageId,
        order: nextOrder,
        lineType: undefined,
        itemCode: '',
        description: '',
        supplierId: '',
        supplierName: '',
        purchaseEnabled: true,
        baseQty: 1,
        unit: 'pst',
        measurementFixedLength: undefined,
        measurementFixedWidth: undefined,
        measurementSpecCode: undefined,
        measurementSpec: undefined,
        qtyFormulaMemo: undefined,
        ...buildLineMarkupFields(defaultLineMarkups),
        unitCost: 0,
        purchasePrice: 0,
        unitPrice: 0,
        draftState: 'new',
      },
    ];
    });
  }

  function duplicateLine(line: DraftQuotationLine) {
    setDraftLines((prev) => {
      const idx = prev.findIndex((item) => item.id === line.id);
      const clone: DraftQuotationLine = {
        ...line,
        id: `tmp-${crypto.randomUUID()}`,
        order: line.order + 1,
        ...extractLineMarkupFields(line),
        measurementFixedLength: line.measurementFixedLength,
        measurementFixedWidth: line.measurementFixedWidth,
        measurementSpecCode: line.measurementSpecCode,
        measurementSpec: line.measurementSpec,
        qtyFormula: line.qtyFormula ? { ...line.qtyFormula } : undefined,
        qtyFormulaMemo: line.qtyFormulaMemo,
        costFormula: line.costFormula
          ? {
              rows: line.costFormula.rows.map((row) => ({ ...row })),
            }
          : undefined,
        costFormulaMemo: line.costFormulaMemo,
        supplierId: line.supplierId,
        supplierName: line.supplierName,
        purchaseEnabled: line.purchaseEnabled ?? true,
        purchasePrice: line.purchasePrice,
        draftState: 'new',
      };
      if (idx < 0) return normalizeGroupOrder([...prev, clone]);
      return normalizeGroupOrder([...prev.slice(0, idx + 1), clone, ...prev.slice(idx + 1)]);
    });
  }

  function cloneLineToTarget(line: DraftQuotationLine, targetQuotationId: string, targetStageId: string, order: number): DraftQuotationLine {
    return {
      ...line,
      id: `tmp-${crypto.randomUUID()}`,
      projectId: prId,
      quotationId: targetQuotationId,
      stageId: targetStageId,
      order,
      ...extractLineMarkupFields(line),
      measurementFixedLength: line.measurementFixedLength,
      measurementFixedWidth: line.measurementFixedWidth,
      measurementSpecCode: line.measurementSpecCode,
      measurementSpec: line.measurementSpec,
      qtyFormula: line.qtyFormula ? { ...line.qtyFormula } : undefined,
      qtyFormulaMemo: line.qtyFormulaMemo,
      costFormula: line.costFormula
        ? {
            rows: line.costFormula.rows.map((row) => ({ ...row })),
          }
        : undefined,
      costFormulaMemo: line.costFormulaMemo,
      supplierId: line.supplierId,
      supplierName: line.supplierName,
      purchaseEnabled: line.purchaseEnabled ?? true,
      purchasePrice: line.purchasePrice,
      draftState: 'new',
    };
  }

  function deleteLine(line: DraftQuotationLine) {
    setDraftLines((prev) => {
      if (line.draftState === 'new') return prev.filter((item) => item.id !== line.id);
      return prev.map((item) => (item.id === line.id ? { ...item, draftState: 'deleted' } : item));
    });
  }

  async function handleSave() {
    if (!prId) return;
    if (saveInFlightRef.current) return;
    if (settings.writeAuthMode === 'oauth_user' && !writeAuthStatus.authenticated) {
      setSaveError('');
      await startAfasOAuthFromApp(true);
      return;
    }
    if (dirtyQuotationWithoutLock) {
      const owner = dirtyQuotationWithoutLock.lock?.ownerDisplayName ?? 'een andere gebruiker';
      setSaveError(`Opslaan geblokkeerd: voorcalculatie ${dirtyQuotationWithoutLock.quotationId} is vergrendeld door ${owner}.`);
      return;
    }
    saveInFlightRef.current = true;
    if (saveSuccessTimeoutRef.current) {
      window.clearTimeout(saveSuccessTimeoutRef.current);
      saveSuccessTimeoutRef.current = null;
    }
    setShowSaveSuccess(false);
    setSaving(true);
    setSaveError('');
    try {
      const payload = buildSavePayload(draftLines);
      const { create, update, delete: remove } = payload;

      const stageById = new Map(stages.map((stage) => [stage.id, stage] as const));
      const ordered = normalizeGroupOrder(draftLines);
      const orderById = new Map(ordered.filter((line) => line.draftState !== 'deleted').map((line) => [line.id, line.order] as const));
      const activeRegularLines = ordered.filter((line) => line.draftState !== 'deleted');
      const groupMap = new Map<string, DraftQuotationLine[]>();
      activeRegularLines.forEach((line) => {
        const key = `${line.quotationId}::${line.stageId}`;
        const group = groupMap.get(key) ?? [];
        group.push(line);
        groupMap.set(key, group);
      });
      const activePhaseMarkupTypes = activePhaseMarkups.filter((markupType) => {
        const itemCode = (settings.phaseMarkupItemCodes[markupType] ?? MARKUP_LABELS[markupType] ?? markupType).trim();
        return Boolean(itemCode);
      });
      const markupItemUnitByType = new Map<MarkupType, string>();
      await Promise.all(
        activePhaseMarkupTypes.map(async (markupType) => {
          const itemCode = (settings.phaseMarkupItemCodes[markupType] ?? MARKUP_LABELS[markupType] ?? markupType).trim();
          if (!itemCode) return;
          try {
            const items = await fetchItems(itemCode);
            const exact =
              items.find((item) => item.code.trim().toLowerCase() === itemCode.toLowerCase()) ??
              (items.length === 1 ? items[0] : undefined);
            if (exact?.defaultUnit?.trim()) {
              markupItemUnitByType.set(markupType, exact.defaultUnit.trim());
            }
          } catch {
            // Unit from item is optional; payload falls back to group unit.
          }
        }),
      );

      const desiredPhaseMarkupKeys = new Set<string>();
      groupMap.forEach((groupLines, groupKey) => {
        const [quotationId, stageId] = groupKey.split('::');
        const fallbackMarkups =
          stageId === NO_STAGE_ID
            ? (project?.projectMarkups ?? {})
            : (stageById.get(stageId)?.phaseMarkups ?? {});
        const stageMarkups = getAggregateMarkupsForGroup(quotationId, stageId, fallbackMarkups);
        const subtotalCost = groupLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.costTotal ?? 0), 0);
        const subtotalAmount = groupLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.priceTotal ?? 0), 0);
        const totals = calcAggregateTotals(subtotalCost, subtotalAmount, stageMarkups, activePhaseMarkupConfigs);
        const maxOrderInGroup = Math.max(0, ...groupLines.map((line) => orderById.get(line.id) ?? line.order));
        let sequence = 0;

        activePhaseMarkups.forEach((markupType) => {
          const markupValue = toNonNegative(Number(stageMarkups[markupType] ?? 0));
          if (markupValue === 0) return;
          const delta = Number(totals.deltas[markupType] ?? 0);
          sequence += 1;
          const generatedOrder = maxOrderInGroup + sequence;
          const basis = getMarkupBasis(settings, 'phase', markupType);
          const valueType = getMarkupValueType(settings, 'phase', markupType);
          const costDelta = basis === 'price' ? 0 : delta;
          const priceDelta = delta;
          const configuredItemCode = (settings.phaseMarkupItemCodes[markupType] ?? MARKUP_LABELS[markupType] ?? markupType).trim();
          const configuredDescription = (settings.phaseMarkupDescriptions[markupType] ?? getUniversalMarkupName(markupType, 'phase')).trim();
          const phaseMarkupKey = buildPhaseMarkupLineKey(quotationId, stageId, markupType);
          const existingPhaseMarkupLine = persistedPhaseMarkupLinesByKey[phaseMarkupKey];
          const fallbackGroupUnit = groupLines.find((line) => line.unit?.trim())?.unit?.trim() || 'pst';
          const resolvedUnit =
            existingPhaseMarkupLine?.unit?.trim() ||
            markupItemUnitByType.get(markupType) ||
            fallbackGroupUnit;
          const itemCode = existingPhaseMarkupLine?.itemCode?.trim() || configuredItemCode;
          const description = existingPhaseMarkupLine?.description?.trim() || configuredDescription;
          const memoPayload: PhaseMarkupMemoPayload = {
            version: 1,
            kind: 'phase_markup_line',
            markupType,
            quotationId,
            stageId,
            sequence,
            generatedOrder,
            anchorOrder: maxOrderInGroup,
            basis,
            valueType,
            markupValue,
            delta,
          };
          const phaseMarkupLinePayload: QuotationLineMutation = {
            quotationId,
            stageId,
            order: generatedOrder,
            itemCode,
            description,
            purchaseEnabled: false,
            baseQty: 1,
            computedQty: 1,
            unit: resolvedUnit,
            unitCost: costDelta,
            computedUnitCost: costDelta,
            unitPrice: priceDelta,
            computedUnitPrice: priceDelta,
            markupFormulaMemo: JSON.stringify(memoPayload),
          };
          desiredPhaseMarkupKeys.add(phaseMarkupKey);
          if (existingPhaseMarkupLine?.id) {
            update.push({ id: existingPhaseMarkupLine.id, ...phaseMarkupLinePayload });
          } else {
            create.push(phaseMarkupLinePayload);
          }
        });
      });

      Object.entries(persistedPhaseMarkupLinesByKey).forEach(([key, existingLine]) => {
        if (desiredPhaseMarkupKeys.has(key)) return;
        if (!existingLine.id) return;
        remove.push({ id: existingLine.id });
      });

      await saveQuotationLines(prId, payload);

      const refreshed = await fetchQuotationLines(prId);
      const normalizedRefreshed = [...refreshed]
        .map((line, idx) => ({ ...line, order: Number.isFinite(line.order) ? line.order : idx + 1 }))
        .map((line) => ({
          ...normalizeMeasurementLine(line),
          purchaseEnabled: isNonPurchasableLine(line) ? false : (line.purchaseEnabled ?? true),
        }))
        .sort(compareQuotationLines);
      const nextPersistedPhaseMarkupLinesByKey: Record<string, QuotationLine> = {};
      const nextAggregateMarkupsByGroup: Record<string, Partial<Record<MarkupType, number>>> = {};
      quotations.forEach((quotation) => {
        stages.forEach((stage) => {
          nextAggregateMarkupsByGroup[buildPhaseMarkupGroupKey(quotation.id, stage.id)] = {
            ...(stage.phaseMarkups ?? {}),
          };
        });
        nextAggregateMarkupsByGroup[buildPhaseMarkupGroupKey(quotation.id, NO_STAGE_ID)] = {
          ...(project?.projectMarkups ?? {}),
        };
      });
      const visibleRefreshed = normalizedRefreshed.filter((line) => {
        const parsed = parsePhaseMarkupMemo(line.markupFormulaMemo);
        if (!parsed) return true;
        const quotationId = parsed.quotationId || line.quotationId;
        const stageId = parsed.stageId || line.stageId;
        const key = buildPhaseMarkupLineKey(quotationId, stageId, parsed.markupType);
        nextPersistedPhaseMarkupLinesByKey[key] = line;
        const groupKey = buildPhaseMarkupGroupKey(quotationId, stageId);
        const current = { ...(nextAggregateMarkupsByGroup[groupKey] ?? {}) };
        current[parsed.markupType] = toNonNegative(Number(parsed.markupValue ?? 0));
        nextAggregateMarkupsByGroup[groupKey] = current;
        return false;
      });
      setPersistedPhaseMarkupLinesByKey(nextPersistedPhaseMarkupLinesByKey);
      setAggregateMarkupsByGroup(nextAggregateMarkupsByGroup);
      setDraftLines(visibleRefreshed.map((line) => ({ ...line, draftState: 'clean' as DraftState })));
      setHasPendingAggregateMarkupChanges(false);
      setShowSaveSuccess(true);
      saveSuccessTimeoutRef.current = window.setTimeout(() => {
        setShowSaveSuccess(false);
        saveSuccessTimeoutRef.current = null;
      }, 1400);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }

  async function handleCreateStage() {
    if (!prId) return;
    const code = newStageCode.trim();
    const name = newStageName.trim();
    if (!code || !name) return;

    setCreatingStage(true);
    try {
      const defaultPhaseMarkups = Object.fromEntries(
        Object.entries(settings.phaseMarkupPreferenceValues ?? {})
          .map(([type, value]) => [type, Number(value) || 0])
          .filter(([, value]) => value !== 0),
      ) as ProjectStage['phaseMarkups'];
      const created = await createProjectStage(prId, { code, name, chargeMode: newStageChargeMode, phaseMarkups: defaultPhaseMarkups });
      setStages((prev) => [...prev, created].sort((a, b) => a.order - b.order));
      setSelectedStageIds((prev) => [...new Set([...prev, created.id])]);
      setAggregateMarkupsByGroup((prev) => {
        const next = { ...prev };
        quotations.forEach((quotation) => {
          const key = buildPhaseMarkupGroupKey(quotation.id, created.id);
          if (!next[key]) next[key] = { ...(created.phaseMarkups ?? {}) };
        });
        return next;
      });
      setIsCreateStageModalOpen(false);
      setNewStageCode('');
      setNewStageName('');
      setNewStageChargeMode('0');
    } finally {
      setCreatingStage(false);
    }
  }

  async function handleCreateQuotation() {
    if (!prId) return;
    const defaultName = `Voorcalculatie ${quotations.length + 1}`;
    const quotationName = newQuotationName.trim() || defaultName;
    setCreatingQuotation(true);
    setCreateQuotationError('');
    try {
      const created = await createQuotation(prId, { name: quotationName });
      let latestQuotations: Quotation[] = [];
      let createdQuotation = created;
      for (const waitMs of [0, 750, 1500, 3000]) {
        if (waitMs) await delay(waitMs);
        latestQuotations = (await fetchQuotations(prId)).sort((a, b) => a.order - b.order);
        const matched =
          latestQuotations.find((quotation) => created.id && quotation.id === created.id) ??
          latestQuotations.find((quotation) => quotation.name === created.name);
        if (matched) {
          createdQuotation = matched;
          break;
        }
      }
      if (!latestQuotations.length) {
        latestQuotations = [created].sort((a, b) => a.order - b.order);
      }
      setQuotations(latestQuotations);
      setSelectedQuotationIds((prev) => [...new Set([...prev, createdQuotation.id])].filter(Boolean));
      setExpandedQuotationIds((prev) => [...new Set([...prev, createdQuotation.id])].filter(Boolean));
      const stageKeys = stages.map((stage) => `${createdQuotation.id}:${stage.id}`);
      setExpandedStageKeys((prev) => [...new Set([...prev, ...stageKeys])]);
      setAggregateMarkupsByGroup((prev) => {
        const next = { ...prev };
        stages.forEach((stage) => {
          const key = buildPhaseMarkupGroupKey(createdQuotation.id, stage.id);
          if (!next[key]) next[key] = { ...(stage.phaseMarkups ?? {}) };
        });
        const noStageKey = buildPhaseMarkupGroupKey(createdQuotation.id, NO_STAGE_ID);
        if (!next[noStageKey]) next[noStageKey] = { ...(project?.projectMarkups ?? {}) };
        return next;
      });
      setIsCreateQuotationModalOpen(false);
      setNewQuotationName('');
      setCreateQuotationError('');
    } catch (error) {
      setCreateQuotationError((error as Error).message);
    } finally {
      setCreatingQuotation(false);
    }
  }

  function getNextStageCode() {
    const maxNum = stages.reduce((max, stage) => {
      const match = stage.code.trim().match(/^F(\d{3,})$/i);
      if (!match) return max;
      return Math.max(max, Number(match[1]));
    }, 0);
    return `F${String(maxNum + 1).padStart(3, '0')}`;
  }

  function openQuotationMenu(quotationId: string) {
    setOpenContainerMenu((prev) =>
      prev?.type === 'quotation' && prev.quotationId === quotationId
        ? null
        : { type: 'quotation', quotationId },
    );
  }

  function openStageMenu(quotationId: string, stageId: string) {
    setOpenContainerMenu((prev) =>
      prev?.type === 'stage' && prev.quotationId === quotationId && prev.stageId === stageId
        ? null
        : { type: 'stage', quotationId, stageId },
    );
  }

  function startCopyQuotation(sourceQuotationId: string) {
    const source = quotations.find((quotation) => quotation.id === sourceQuotationId);
    if (!source) return;
    setOpenContainerMenu(null);
    setCopyActionModal({
      type: 'quotation',
      sourceQuotationId,
      name: `${source.name} - kopie`,
      error: '',
    });
  }

  function startCopyStage(sourceQuotationId: string, sourceStageId: string) {
    const sourceStage = stages.find((stage) => stage.id === sourceStageId);
    if (!sourceStage) return;
    setOpenContainerMenu(null);
    setCopyActionModal({
      type: 'stage',
      sourceQuotationId,
      sourceStageId,
      code: getNextStageCode(),
      name: `${sourceStage.name} - kopie`,
      chargeMode: sourceStage.chargeMode ?? '0',
      error: '',
    });
  }

  function startRenameQuotation(quotationId: string) {
    const source = quotations.find((quotation) => quotation.id === quotationId);
    if (!source) return;
    setOpenContainerMenu(null);
    setRenameActionModal({
      type: 'quotation',
      quotationId,
      name: source.name,
      error: '',
    });
  }

  function startRenameStage(quotationId: string, stageId: string) {
    const source = stages.find((stage) => stage.id === stageId);
    if (!source) return;
    setOpenContainerMenu(null);
    setRenameActionModal({
      type: 'stage',
      quotationId,
      stageId,
      name: source.name,
      chargeMode: source.chargeMode ?? '0',
      error: '',
    });
  }

  async function handleConfirmCopyAction() {
    if (!prId || !copyActionModal || copyActionBusy) return;
    setCopyActionBusy(true);
    try {
      if (copyActionModal.type === 'quotation') {
        const nextName = copyActionModal.name.trim();
        if (!nextName) {
          setCopyActionModal((prev) => (prev && prev.type === 'quotation' ? { ...prev, error: 'Naam is verplicht.' } : prev));
          return;
        }
        const created = await createQuotation(prId, { name: nextName });
        setQuotations((prev) => [...prev, created].sort((a, b) => a.order - b.order));
        setSelectedQuotationIds((prev) => [...new Set([...prev, created.id])].filter(Boolean));
        setExpandedQuotationIds((prev) => [...new Set([...prev, created.id])].filter(Boolean));
        const stageKeys = stages.map((stage) => `${created.id}:${stage.id}`);
        setExpandedStageKeys((prev) => [...new Set([...prev, ...stageKeys])]);
        setAggregateMarkupsByGroup((prev) => {
          const next = { ...prev };
          Object.entries(prev).forEach(([key, value]) => {
            const [quotationId, stageId] = key.split('::');
            if (quotationId !== copyActionModal.sourceQuotationId) return;
            next[buildPhaseMarkupGroupKey(created.id, stageId)] = { ...value };
          });
          return next;
        });
        const sourceLines = draftLines
          .filter((line) => line.draftState !== 'deleted' && line.quotationId === copyActionModal.sourceQuotationId)
          .sort(compareQuotationLines);
        setDraftLines((prev) => {
          const orderByStage = new Map<string, number>();
          const clones = sourceLines.map((line) => {
            const nextOrder = (orderByStage.get(line.stageId) ?? 0) + 1;
            orderByStage.set(line.stageId, nextOrder);
            return cloneLineToTarget(line, created.id, line.stageId, nextOrder);
          });
          return [...prev, ...clones];
        });
        setCopyActionModal(null);
        return;
      }

      const nextCode = copyActionModal.code.trim();
      const nextName = copyActionModal.name.trim();
      if (!nextCode || !nextName) {
        setCopyActionModal((prev) => (prev && prev.type === 'stage' ? { ...prev, error: 'Fasecode en naam zijn verplicht.' } : prev));
        return;
      }
      const sourceStage = stages.find((stage) => stage.id === copyActionModal.sourceStageId);
      const createdStage = await createProjectStage(prId, {
        code: nextCode,
        name: nextName,
        chargeMode: copyActionModal.chargeMode,
        phaseMarkups: sourceStage?.phaseMarkups ?? {},
      });
      setStages((prev) => [...prev, createdStage].sort((a, b) => a.order - b.order));
      setSelectedStageIds((prev) => [...new Set([...prev, createdStage.id])]);
      setExpandedStageKeys((prev) => [...new Set([...prev, `${copyActionModal.sourceQuotationId}:${createdStage.id}`])]);
      setAggregateMarkupsByGroup((prev) => {
        const next = { ...prev };
        const sourceKey = buildPhaseMarkupGroupKey(copyActionModal.sourceQuotationId, copyActionModal.sourceStageId);
        const targetKey = buildPhaseMarkupGroupKey(copyActionModal.sourceQuotationId, createdStage.id);
        next[targetKey] = { ...(next[sourceKey] ?? sourceStage?.phaseMarkups ?? {}) };
        return next;
      });

      const sourceLines = draftLines
        .filter(
          (line) =>
            line.draftState !== 'deleted' &&
            line.quotationId === copyActionModal.sourceQuotationId &&
            line.stageId === copyActionModal.sourceStageId,
        )
        .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id, 'nl')));
      setDraftLines((prev) => {
        const clones = sourceLines.map((line, index) =>
          cloneLineToTarget(line, copyActionModal.sourceQuotationId, createdStage.id, index + 1),
        );
        return [...prev, ...clones];
      });
      setCopyActionModal(null);
    } catch (error) {
      setCopyActionModal((prev) =>
        prev
          ? {
              ...prev,
              error: (error as Error).message,
            }
          : prev,
      );
    } finally {
      setCopyActionBusy(false);
    }
  }

  async function handleConfirmRenameAction() {
    if (!prId || !renameActionModal || renameActionBusy) return;
    setRenameActionBusy(true);
    try {
      if (renameActionModal.type === 'quotation') {
        const nextName = renameActionModal.name.trim();
        if (!nextName) {
          setRenameActionModal((prev) => (prev && prev.type === 'quotation' ? { ...prev, error: 'Naam is verplicht.' } : prev));
          return;
        }
        const updated = await updateQuotation(prId, renameActionModal.quotationId, { name: nextName });
        setQuotations((prev) =>
          prev.map((quotation) =>
            quotation.id === renameActionModal.quotationId ? { ...quotation, name: updated.name || nextName } : quotation,
          ),
        );
        setRenameActionModal(null);
        return;
      }

      const nextName = renameActionModal.name.trim();
      if (!nextName) {
        setRenameActionModal((prev) => (prev && prev.type === 'stage' ? { ...prev, error: 'Fasenaam is verplicht.' } : prev));
        return;
      }
      const updated = await updateProjectStage(prId, renameActionModal.stageId, {
        name: nextName,
        chargeMode: renameActionModal.chargeMode,
      });
      setStages((prev) =>
        prev.map((stage) =>
          stage.id === renameActionModal.stageId
            ? { ...stage, name: updated.name || nextName, chargeMode: updated.chargeMode ?? renameActionModal.chargeMode }
            : stage,
        ),
      );
      setRenameActionModal(null);
    } catch (error) {
      setRenameActionModal((prev) =>
        prev
          ? {
              ...prev,
              error: (error as Error).message,
            }
          : prev,
      );
    } finally {
      setRenameActionBusy(false);
    }
  }

  function toggleQuotationExpand(quotationId: string) {
    setExpandedQuotationIds((prev) =>
      prev.includes(quotationId) ? prev.filter((id) => id !== quotationId) : [...prev, quotationId],
    );
  }

  function toggleStageExpand(scope: string, stageId: string) {
    const key = `${scope}:${stageId}`;
    setExpandedStageKeys((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }

  function toggleAllExpanded() {
    const visibleQuotationIds = visibleQuotations.map((quotation) => quotation.id);
    if (!visibleQuotationIds.length) return;

    const allQuotationsOpen = visibleQuotationIds.every((id) => expandedQuotationIds.includes(id));
    const allStagesOpen =
      !showPhasePanel ||
      visibleQuotationIds.every((quotationId) =>
        visibleStageIds.every((stageId) => expandedStageKeys.includes(`${quotationId}:${stageId}`)),
      );

    const shouldCollapse = allQuotationsOpen && allStagesOpen;

    if (shouldCollapse) {
      setExpandedQuotationIds((prev) => prev.filter((id) => !visibleQuotationIds.includes(id)));
      if (showPhasePanel) {
        const removeKeys = new Set(visibleQuotationIds.flatMap((quotationId) => visibleStageIds.map((stageId) => `${quotationId}:${stageId}`)));
        setExpandedStageKeys((prev) => prev.filter((key) => !removeKeys.has(key)));
      }
      return;
    }

    setExpandedQuotationIds((prev) => [...new Set([...prev, ...visibleQuotationIds])]);
    if (showPhasePanel) {
      const addKeys = visibleQuotationIds.flatMap((quotationId) => visibleStageIds.map((stageId) => `${quotationId}:${stageId}`));
      setExpandedStageKeys((prev) => [...new Set([...prev, ...addKeys])]);
    }
  }

  function handleStageMarkupChange(
    quotationId: string,
    stageId: string,
    fallbackMarkups: Partial<Record<MarkupType, number>>,
    type: MarkupType,
    value: number,
  ) {
    const normalizedValue = toNonNegative(value);
    const groupKey = buildPhaseMarkupGroupKey(quotationId, stageId);
    const currentMarkups = aggregateMarkupsByGroup[groupKey] ?? fallbackMarkups;
    const currentValue = toNonNegative(Number(currentMarkups?.[type] ?? 0));
    if (normalizedValue === currentValue) return;
    const nextMarkups = { ...(currentMarkups ?? {}), [type]: normalizedValue };
    setAggregateMarkupsByGroup((prev) => ({ ...prev, [groupKey]: nextMarkups }));
    setHasPendingAggregateMarkupChanges(true);
  }

  function handleProjectMarkupChange(quotationId: string, type: MarkupType, value: number) {
    const normalizedValue = toNonNegative(value);
    const groupKey = buildPhaseMarkupGroupKey(quotationId, NO_STAGE_ID);
    const currentMarkups = aggregateMarkupsByGroup[groupKey] ?? project?.projectMarkups ?? {};
    const currentValue = toNonNegative(Number(currentMarkups?.[type] ?? 0));
    if (normalizedValue === currentValue) return;
    const nextMarkups = { ...currentMarkups, [type]: normalizedValue };
    setAggregateMarkupsByGroup((prev) => ({ ...prev, [groupKey]: nextMarkups }));
    setHasPendingAggregateMarkupChanges(true);
  }
  function formatAmount(value: number) {
    return value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatMarginPct(cost: number, amount: number) {
    if (amount <= 0) return '0,00%';
    const pct = ((amount - cost) / amount) * 100;
    return `${pct.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  function getQtyCalcMode(line: DraftQuotationLine): QtyCalcMode | null {
    const normalizedUnit = line.unit.trim().toLowerCase();
    const measurementMode = getLineMeasurementMode(line);
    const rememberedFormula = line.qtyFormula ?? parseQtyFormulaMemo(line.qtyFormulaMemo);
    if (measurementMode) return measurementMode;
    if (rememberedFormula?.mode === 'm3') return 'm3';
    if (normalizedUnit === 'm') return 'm3';
    if (normalizedUnit === 'm3') return 'm3';
    return rememberedFormula?.mode ?? null;
  }

  function createQtyCalculatorRow(length = 0, width = 0): QtyCalculatorRowState {
    return {
      id: crypto.randomUUID(),
      length: toNonNegative(length),
      width: toNonNegative(width),
    };
  }

  function normalizeQtyCalculatorRows(mode: QtyCalcMode, formula?: QtyFormula): QtyCalculatorRowState[] {
    if (!formula || (mode !== 'm1' && mode !== 'm2')) return [createQtyCalculatorRow()];
    const sourceRows =
      Array.isArray(formula.rows) && formula.rows.length
        ? formula.rows.map((row) => ({
            id: row.id || crypto.randomUUID(),
            length: toNonNegative(Number(row.length) || 0),
            width: mode === 'm2' ? toNonNegative(Number(row.width) || 0) : 0,
          }))
        : [
            {
              id: crypto.randomUUID(),
              length: toNonNegative(Number(formula.length) || 0),
              width: mode === 'm2' ? toNonNegative(Number(formula.width) || 0) : 0,
            },
          ];
    return sourceRows.length ? sourceRows : [createQtyCalculatorRow()];
  }

  function openQtyCalculator(line: DraftQuotationLine) {
    const mode = getQtyCalcMode(line);
    if (!mode) return;
    const rememberedFormula = line.qtyFormula ?? parseQtyFormulaMemo(line.qtyFormulaMemo);
    const remembered = rememberedFormula && rememberedFormula.mode === mode ? rememberedFormula : undefined;
    const toMeters = (rawValue?: number) => toNonNegative(rawValue ?? 0) * getLengthWidthToMeterFactor(line.measurementSpecCode);
    const fixedLength = (mode === 'm1' || mode === 'm2') && (line.measurementFixedLength ?? 0) > 0 ? line.measurementFixedLength : undefined;
    const fixedWidth = mode === 'm2' && (line.measurementFixedWidth ?? 0) > 0 ? line.measurementFixedWidth : undefined;
    const hasRememberedRows = Boolean(remembered?.rows?.length);
    const initialRows =
      mode === 'm1' || mode === 'm2'
        ? hasRememberedRows
          ? normalizeQtyCalculatorRows(mode, remembered)
          : [
              createQtyCalculatorRow(
                remembered?.length ?? toMeters(fixedLength),
                mode === 'm2' ? (remembered?.width ?? toMeters(fixedWidth)) : 0,
              ),
            ]
        : [];
    setQtyCalculator({
      lineId: line.id,
      mode,
      length: remembered?.length ?? toMeters(fixedLength),
      width: remembered?.width ?? toMeters(fixedWidth),
      height: remembered?.height ?? 0,
      rows: initialRows,
      fixedLength,
      fixedWidth,
      measurementSpecCode: line.measurementSpecCode,
      measurementSpec: line.measurementSpec,
    });
  }

  function addQtyCalculatorRow() {
    setQtyCalculator((prev) => {
      if (!prev || (prev.mode !== 'm1' && prev.mode !== 'm2')) return prev;
      return {
        ...prev,
        rows: [...prev.rows, createQtyCalculatorRow()],
      };
    });
  }

  function removeQtyCalculatorRow(rowId: string) {
    setQtyCalculator((prev) => {
      if (!prev || (prev.mode !== 'm1' && prev.mode !== 'm2')) return prev;
      const nextRows = prev.rows.filter((row) => row.id !== rowId);
      return {
        ...prev,
        rows: nextRows.length ? nextRows : [createQtyCalculatorRow()],
      };
    });
  }

  function updateQtyCalculatorRow(rowId: string, patch: Partial<Pick<QtyCalculatorRowState, 'length' | 'width'>>) {
    setQtyCalculator((prev) => {
      if (!prev || (prev.mode !== 'm1' && prev.mode !== 'm2')) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
      };
    });
  }

  function applyQtyCalculator() {
    if (!qtyCalculator) return;
    const h = toNonNegative(qtyCalculator.height);
    const normalizedRows =
      qtyCalculator.mode === 'm1' || qtyCalculator.mode === 'm2'
        ? qtyCalculator.rows.map((row) => ({
            id: row.id || crypto.randomUUID(),
            length: toNonNegative(row.length),
            width: qtyCalculator.mode === 'm2' ? toNonNegative(row.width) : 0,
          }))
        : [];
    const l = toNonNegative(qtyCalculator.length);
    const b = qtyCalculator.mode === 'm1' ? 0 : toNonNegative(qtyCalculator.width);
    let qty =
      qtyCalculator.mode === 'm3'
        ? l * b * h
        : qtyCalculator.mode === 'm2'
          ? normalizedRows.reduce((sum, row) => sum + row.length * row.width, 0)
          : normalizedRows.reduce((sum, row) => sum + row.length, 0);
    const roundedQty = Math.round((qty + Number.EPSILON) * 100) / 100;
    const nextFormula: QtyFormula =
      qtyCalculator.mode === 'm3'
        ? {
            mode: 'm3',
            length: l,
            width: b,
            height: h,
          }
        : {
            mode: qtyCalculator.mode,
            length: normalizedRows[0]?.length ?? 0,
            width: qtyCalculator.mode === 'm2' ? normalizedRows[0]?.width ?? 0 : 0,
            rows: normalizedRows,
          };
    updateDraftLine(qtyCalculator.lineId, {
      baseQty: roundedQty,
      qtyFormula: nextFormula,
      qtyFormulaMemo: serializeQtyFormulaMemo(nextFormula),
    });
    setQtyCalculator(null);
  }

  function onBaseQtyKeyDown(event: React.KeyboardEvent<HTMLInputElement>, line: DraftQuotationLine) {
    if (event.key.toLowerCase() !== 'c') return;
    const mode = getQtyCalcMode(line);
    if (!mode) return;
    event.preventDefault();
    openQtyCalculator(line);
  }
  function onQtyCalculatorInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyQtyCalculator();
  }

  function createEmptyCostFormulaRow(index: number): CostCalculatorRowState {
    return {
      id: crypto.randomUUID(),
      label: `Regel ${index + 1}`,
      operator: '+',
      qty: 1,
      unitCost: 0,
    };
  }

  function openCostCalculator(line: DraftQuotationLine) {
    const rememberedRows = line.costFormula?.rows ?? [];
    const parsedRowsFromMemo = parseCostFormulaMemo(line.costFormulaMemo);
    const sourceRows = rememberedRows.length ? rememberedRows : parsedRowsFromMemo;
    const rows = sourceRows.length
      ? sourceRows.map((row, index) => ({
          id: row.id || crypto.randomUUID(),
          label: row.label || `Regel ${index + 1}`,
          operator: normalizeCostFormulaOperator(row.operator),
          qty: toNonNegative(row.qty),
          unitCost: toNonNegative(row.unitCost),
        }))
      : [createEmptyCostFormulaRow(0)];

    setCostCalculator({
      lineId: line.id,
      rows,
    });
  }

  function updateCostCalculatorRow(rowId: string, patch: Partial<CostCalculatorRowState>) {
    setCostCalculator((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
      };
    });
  }

  function addCostCalculatorRow() {
    setCostCalculator((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: [...prev.rows, createEmptyCostFormulaRow(prev.rows.length)],
      };
    });
  }

  function removeCostCalculatorRow(rowId: string) {
    setCostCalculator((prev) => {
      if (!prev) return prev;
      const nextRows = prev.rows.filter((row) => row.id !== rowId);
      if (!nextRows.length) return { ...prev, rows: [createEmptyCostFormulaRow(0)] };
      return { ...prev, rows: nextRows };
    });
  }

  function applyCostCalculator() {
    if (!costCalculator) return;
    const normalizedRows = costCalculator.rows.map((row, index) => ({
      id: row.id || crypto.randomUUID(),
      label: row.label.trim() || `Regel ${index + 1}`,
      operator: normalizeCostFormulaOperator(row.operator),
      qty: toNonNegative(row.qty),
      unitCost: toNonNegative(row.unitCost),
    }));

    const { total } = applyCostCalculatorRows(normalizedRows);

    updateDraftLine(costCalculator.lineId, {
      unitCost: total,
      costFormula: { rows: normalizedRows },
      costFormulaMemo: serializeCostFormulaMemo(normalizedRows),
    });
    setCostCalculator(null);
  }

  function onCostCalculatorInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyCostCalculator();
  }

  async function applyItemDefaults(line: DraftQuotationLine, rawQuery: string) {
    const query = rawQuery.trim();
    if (!query) return;
    try {
      const items = await fetchItems(query);
      const exactMatch =
        items.find((item) => item.code.trim().toLowerCase() === query.toLowerCase() || item.description.trim().toLowerCase() === query.toLowerCase()) ??
        (items.length === 1 ? items[0] : undefined);
      if (!exactMatch) return;
      updateDraftLine(line.id, {
        lineType: exactMatch.lineType ?? line.lineType,
        itemCode: exactMatch.code,
        description: exactMatch.description,
        supplierId: line.supplierId?.trim() ? line.supplierId : exactMatch.preferredSupplierId,
        supplierName: line.supplierId?.trim() ? line.supplierName : exactMatch.preferredSupplierName,
        unit: exactMatch.defaultUnit || line.unit,
        measurementFixedLength: exactMatch.fixedLength,
        measurementFixedWidth: exactMatch.fixedWidth,
        measurementSpecCode: exactMatch.lengthWidthSpecCode,
        measurementSpec: exactMatch.lengthWidthSpec,
        unitCost: line.unitCost > 0 ? line.unitCost : exactMatch.defaultUnitCost,
        purchasePrice: (line.purchasePrice ?? 0) > 0 ? line.purchasePrice : exactMatch.defaultPurchasePrice,
        unitPrice: line.unitPrice > 0 ? line.unitPrice : exactMatch.defaultUnitPrice,
      });
    } catch {
      // Item defaults are optional during entry.
    }
  }

  function applySelectedItem(line: DraftQuotationLine, item: Item) {
    updateDraftLine(line.id, {
      lineType: item.lineType ?? line.lineType,
      itemCode: item.code,
      description: item.description,
      supplierId: item.preferredSupplierId ?? line.supplierId,
      supplierName: item.preferredSupplierName ?? line.supplierName,
      unit: item.defaultUnit || line.unit,
      measurementFixedLength: item.fixedLength,
      measurementFixedWidth: item.fixedWidth,
      measurementSpecCode: item.lengthWidthSpecCode,
      measurementSpec: item.lengthWidthSpec,
      unitCost: item.defaultUnitCost,
      purchasePrice: item.defaultPurchasePrice ?? line.purchasePrice,
      unitPrice: item.defaultUnitPrice,
    });
    setItemSuggestions({ lineId: null, query: '', items: [], open: false, loading: false });
  }

  function formatCreditorDisplay(line: DraftQuotationLine) {
    if (line.supplierId && line.supplierName) return `${line.supplierId} - ${line.supplierName}`;
    return line.supplierId || line.supplierName || '';
  }

  function applySelectedCreditor(line: DraftQuotationLine, creditor: Creditor) {
    updateDraftLine(line.id, {
      supplierId: creditor.id,
      supplierName: creditor.name,
    });
    setCreditorQueries((prev) => {
      const next = { ...prev };
      delete next[line.id];
      return next;
    });
    setCreditorSuggestions({ lineId: null, query: '', creditors: [], open: false, loading: false });
  }

  async function applyCreditorDefaults(line: DraftQuotationLine, rawQuery: string) {
    const query = rawQuery.trim();
    if (!query) return;
    try {
      const creditors = await fetchCreditors(query);
      const exactMatch =
        creditors.find((creditor) => creditor.id.trim().toLowerCase() === query.toLowerCase() || `${creditor.id} - ${creditor.name}`.trim().toLowerCase() === query.toLowerCase() || creditor.name.trim().toLowerCase() === query.toLowerCase()) ??
        (creditors.length === 1 ? creditors[0] : undefined);
      if (!exactMatch) return;
      applySelectedCreditor(line, exactMatch);
    } catch {
      // Creditor defaults are optional during entry.
    }
  }

  async function loadCreditorSuggestions(lineId: string, query: string) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setCreditorSuggestions((prev) => (prev.lineId === lineId ? { lineId: null, query: '', creditors: [], open: false, loading: false } : prev));
      return;
    }

    const requestId = creditorSearchRequestRef.current + 1;
    creditorSearchRequestRef.current = requestId;
    setCreditorSuggestions({
      lineId,
      query: trimmedQuery,
      creditors: [],
      open: true,
      loading: true,
    });
    try {
      const creditors = await fetchCreditors(trimmedQuery);
      if (creditorSearchRequestRef.current !== requestId) return;
      setCreditorSuggestions({
        lineId,
        query: trimmedQuery,
        creditors,
        open: true,
        loading: false,
      });
    } catch {
      if (creditorSearchRequestRef.current !== requestId) return;
      setCreditorSuggestions({
        lineId,
        query: trimmedQuery,
        creditors: [],
        open: true,
        loading: false,
      });
    }
  }

  async function loadItemSuggestions(lineId: string, query: string) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setItemSuggestions((prev) => (prev.lineId === lineId ? { lineId: null, query: '', items: [], open: false, loading: false } : prev));
      return;
    }

    const requestId = itemSearchRequestRef.current + 1;
    itemSearchRequestRef.current = requestId;
    setItemSuggestions({
      lineId,
      query: trimmedQuery,
      items: [],
      open: true,
      loading: true,
    });
    try {
      const items = await fetchItems(trimmedQuery);
      if (itemSearchRequestRef.current !== requestId) return;
      setItemSuggestions({
        lineId,
        query: trimmedQuery,
        items,
        open: true,
        loading: false,
      });
    } catch {
      if (itemSearchRequestRef.current !== requestId) return;
      setItemSuggestions({
        lineId,
        query: trimmedQuery,
        items: [],
        open: true,
        loading: false,
      });
    }
  }

  async function handleMarkupMetaChange(type: MarkupType, field: 'item' | 'description', value: string) {
    const next: Settings = {
      ...settings,
      phaseMarkupItemCodes:
        field === 'item' ? { ...settings.phaseMarkupItemCodes, [type]: value } : settings.phaseMarkupItemCodes,
      phaseMarkupDescriptions:
        field === 'description'
          ? { ...settings.phaseMarkupDescriptions, [type]: value }
          : settings.phaseMarkupDescriptions,
    };
    setSettings(next);
    await saveSettings(next);
  }

  function getColumnWidth(key: string) {
    return columnWidths[key] ?? defaultColumnWidth(key);
  }

  function startColumnResize(key: string, event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    resizeRef.current = {
      key,
      startX: event.clientX,
      startWidth: getColumnWidth(key),
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  const tableColumnCount = tableColumnKeys.length;

  function renderMarkupRowsInTable(
    subtotalCost: number,
    subtotalAmount: number,
    markups: Partial<Record<MarkupType, number>>,
    onChangeValue: (type: MarkupType, value: number) => void,
  ) {
    const totals = calcAggregateTotals(subtotalCost, subtotalAmount, markups, activePhaseMarkupConfigs);
    return activePhaseMarkups.map((type) => {
      const value = markups[type] ?? 0;
      const amount = totals.deltas[type] ?? 0;
      const basis = getMarkupBasis(settings, 'phase', type);
      const costDelta = basis === 'price' ? 0 : amount;
      const priceDelta = amount;
      const valueType = getMarkupValueType(settings, 'phase', type);
      const inputKey = basis === 'price' ? 'unitPrice' : 'unitCost';
      return (
        <tr key={`markup-${type}`} className="border-b border-slate-200 bg-slate-50/70">
          {tableColumnKeys.map((key) => {
            if (key === 'item') return <td key={`${type}-${key}`} className="p-1.5 text-xs font-medium">{markupShort(type, 'phase')}</td>;
            if (key === 'description') {
              return (
                <td key={`${type}-${key}`} className="p-1.5">
                  <input
                    className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                    value={settings.phaseMarkupDescriptions[type] ?? getUniversalMarkupName(type, 'phase')}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        phaseMarkupDescriptions: { ...prev.phaseMarkupDescriptions, [type]: e.target.value },
                      }))
                    }
                    onBlur={(e) => void handleMarkupMetaChange(type, 'description', e.target.value)}
                  />
                </td>
              );
            }
            if (key === 'supplier') return <td key={`${type}-${key}`} className="p-1.5" />;
            if (key === 'purchaseEnabled') return <td key={`${type}-${key}`} className="p-1.5" />;
            if (key === inputKey) {
              return (
                <td key={`${type}-${key}`} className="p-1.5">
                  <div className="relative">
                    <input type="number" min={0} step="0.01" className={`w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs ${valueType === 'percentage' ? 'pr-5' : ''}`} value={value} onChange={(e) => onChangeValue(type, Number(e.target.value) || 0)} />
                    {valueType === 'percentage' ? <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">%</span> : null}
                  </div>
                </td>
              );
            }
            if (key === 'unitCost') return <td key={`${type}-${key}`} className="p-1.5 text-right text-xs">{formatAmount(subtotalCost)}</td>;
            if (key === 'purchasePrice') return <td key={`${type}-${key}`} className="p-1.5" />;
            if (key === 'computedUnitCost') return <td key={`${type}-${key}`} className="p-1.5 text-right text-xs">{formatAmount(subtotalCost + costDelta)}</td>;
            if (key === 'costTotal') return <td key={`${type}-${key}`} className="p-1.5 text-right text-xs">{formatAmount(costDelta)}</td>;
            if (key === 'unitPrice') return <td key={`${type}-${key}`} className="p-1.5 text-right text-xs">{formatAmount(subtotalAmount)}</td>;
            if (key === 'priceTotal') return <td key={`${type}-${key}`} className="p-1.5 text-right text-xs font-medium">{formatAmount(priceDelta)}</td>;
            return <td key={`${type}-${key}`} className="p-1.5" />;
          })}
        </tr>
      );
    });
  }
  function renderCompactTotalsRows(
    subtotalCost: number,
    subtotalAmount: number,
    markups: Partial<Record<MarkupType, number>>,
    onAdd?: () => void,
  ) {
    const totals = calcAggregateTotals(
      subtotalCost,
      subtotalAmount,
      markups,
      activePhaseMarkupConfigs,
    );
    const hasAggregateMarkups = activePhaseMarkups.length > 0;

    const subtotalRow = (
      <tr key="subtotal-row" className="border-b border-slate-200 bg-slate-50/40">
        {tableColumnKeys.map((key) => {
          if (key === 'item') return <td key={`subtotal-${key}`} className="p-1.5 text-xs text-slate-500">Subtotaal</td>;
          if (key === 'supplier') return <td key={`subtotal-${key}`} className="p-1.5" />;
          if (key === 'purchaseEnabled') return <td key={`subtotal-${key}`} className="p-1.5" />;
          if (key === 'costTotal') return <td key={`subtotal-${key}`} className="p-1.5 text-right text-xs text-slate-600">{formatAmount(subtotalCost)}</td>;
          if (key === 'priceTotal') return <td key={`subtotal-${key}`} className="p-1.5 text-right text-xs text-slate-600">{formatAmount(subtotalAmount)}</td>;
          if (key === 'actions') {
            return (
              <td key={`subtotal-${key}`} className="p-1.5 text-right">
                {onAdd ? (
                  <button
                    type="button"
                    onClick={onAdd}
                    className="pointer-events-none inline-flex h-6 w-6 items-center justify-center rounded border border-brand-600 bg-brand-600 text-sm font-semibold text-white opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-white hover:text-brand-700"
                    aria-label="Regel toevoegen"
                    title="Regel toevoegen"
                  >
                    +
                  </button>
                ) : null}
              </td>
            );
          }
          return <td key={`subtotal-${key}`} className="p-1.5" />;
        })}
      </tr>
    );

    const totalRow = (
      <tr key="total-row" className="total-incl-row border-b border-slate-200 bg-slate-50/80">
        {tableColumnKeys.map((key) => {
          if (key === 'item') return <td key={`total-${key}`} className="p-1.5 text-xs font-semibold text-slate-600">Totaal incl opslagen</td>;
          if (key === 'supplier') return <td key={`total-${key}`} className="p-1.5" />;
          if (key === 'purchaseEnabled') return <td key={`total-${key}`} className="p-1.5" />;
          if (key === 'costTotal') return <td key={`total-${key}`} className="p-1.5 text-right text-xs font-semibold text-slate-700">{formatAmount(totals.totalCostInclMarkups)}</td>;
          if (key === 'priceTotal') return <td key={`total-${key}`} className="p-1.5 text-right text-xs font-semibold text-slate-700">{formatAmount(totals.totalAmountInclMarkups)}</td>;
          return <td key={`total-${key}`} className="p-1.5" />;
        })}
      </tr>
    );

    if (!hasAggregateMarkups) {
      return [subtotalRow];
    }

    return [subtotalRow, totalRow];
  }

  function renderLineDropZoneRow(params: {
    dropKey: string;
    quotationId: string;
    onDropAction: (sourceLineIds: string[]) => void;
  }) {
    if (!draggedLine) return null;
    if (draggedLine.quotationId !== params.quotationId) return null;
    return (
      <tr
        key={params.dropKey}
        className={`${dragOverLineId === params.dropKey ? 'bg-brand-50/30' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (dragOverLineId !== params.dropKey) setDragOverLineId(params.dropKey);
        }}
        onDragLeave={() => {
          if (dragOverLineId === params.dropKey) setDragOverLineId(null);
        }}
        onMouseEnter={() => {
          const sourceLineId = resolveDraggedLineId();
          if (!isPointerDraggingLine || !sourceLineId) return;
          if (dragOverLineId !== params.dropKey) setDragOverLineId(params.dropKey);
        }}
        onMouseUp={() => {
          const sourceLineIds = resolveDraggedLineIds();
          if (!isPointerDraggingLine || !sourceLineIds.length) return;
          params.onDropAction(sourceLineIds);
          pointerDragDropHandledRef.current = true;
          draggedLineIdRef.current = null;
          draggedLineIdsRef.current = [];
          setDraggedLineId(null);
          setDragOverLineId(null);
          setSelectedDragLineIds([]);
          setIsPointerDraggingLine(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          const sourceLineIds = resolveDraggedLineIds(event.dataTransfer.getData('application/x-voorcalc-line-ids'));
          if (!sourceLineIds.length) return;
          params.onDropAction(sourceLineIds);
          draggedLineIdRef.current = null;
          draggedLineIdsRef.current = [];
          setDraggedLineId(null);
          setDragOverLineId(null);
          setSelectedDragLineIds([]);
        }}
        onClick={() => {
          const sourceLineIds = resolveDraggedLineIds();
          if (!sourceLineIds.length) return;
          params.onDropAction(sourceLineIds);
          draggedLineIdRef.current = null;
          draggedLineIdsRef.current = [];
          setDraggedLineId(null);
          setDragOverLineId(null);
          setSelectedDragLineIds([]);
        }}
      >
        <td colSpan={tableColumnCount} className="p-0">
          <div className="h-2 px-2">
            <div className={`h-[2px] w-full rounded ${dragOverLineId === params.dropKey ? 'bg-brand-600' : 'bg-transparent'}`} />
          </div>
        </td>
      </tr>
    );
  }

  function renderLineRow(line: DraftQuotationLine) {
    const computed =
      lineComputed.get(line.id) ??
      calcLine(
        { ...line, phaseId: line.stageId },
        activeLineMarkupConfigs,
      );

    const costCalculatorPreview =
      costCalculator?.lineId === line.id ? applyCostCalculatorRows(costCalculator.rows) : { deltas: [], total: 0 };

    const isInlineCalculatorOpen = qtyCalculator?.lineId === line.id || costCalculator?.lineId === line.id || measurementConfigLineId === line.id;
    const isBaseQtyDerived = Boolean(line.qtyFormula || line.qtyFormulaMemo);
    const isUnitCostDerived = Boolean((line.costFormula?.rows?.length ?? 0) > 0 || line.costFormulaMemo);
    const isQtyHelperVisible = qtyCalculator?.lineId === line.id;
    const isCostHelperVisible = costCalculator?.lineId === line.id;
    const qtyPopupHeight =
      qtyCalculator?.lineId === line.id
        ? qtyCalculator.mode === 'm3'
          ? 164
          : Math.min(312, 128 + qtyCalculator.rows.length * 34)
        : 0;
    const popupSpacerHeight = Math.max(
      itemSuggestions.open && itemSuggestions.lineId === line.id ? 288 : 0,
      measurementConfigLineId === line.id ? 156 : 0,
      qtyPopupHeight,
      costCalculator?.lineId === line.id ? 268 : 0,
    );

    return (
      <Fragment key={line.id}>
        <tr
        className={`border-b border-slate-200 ${isInlineCalculatorOpen ? 'relative z-40' : ''}` }
        onMouseEnter={() => {
          lineHotkeyRef.current = {
            duplicate: () => duplicateLine(line),
            remove: () => deleteLine(line),
          };
          const sourceLineId = resolveDraggedLineId();
          if (!isPointerDraggingLine || !sourceLineId || sourceLineId === line.id) return;
          const dragged = draftLines.find((item) => item.id === sourceLineId);
          if (!dragged) return;
          if (dragged.quotationId !== line.quotationId) return;
          if (dragOverLineId !== line.id) setDragOverLineId(line.id);
        }}
        onFocusCapture={() => {
          lineHotkeyRef.current = {
            duplicate: () => duplicateLine(line),
            remove: () => deleteLine(line),
          };
        }}
        onMouseLeave={() => {
          if (lineHotkeyRef.current) lineHotkeyRef.current = null;
        }}
        onDragOver={(event) => {
          const sourceLineId = resolveDraggedLineId(event.dataTransfer.getData('text/plain'));
          if (!sourceLineId || sourceLineId === line.id) return;
          const dragged = draftLines.find((item) => item.id === sourceLineId);
          if (!dragged) return;
          if (dragged.quotationId !== line.quotationId) return;
          event.preventDefault();
          if (dragOverLineId !== line.id) setDragOverLineId(line.id);
        }}
        onMouseUp={() => {
          const sourceLineIds = resolveDraggedLineIds();
          const sourceLineId = sourceLineIds[0];
          if (!isPointerDraggingLine || !sourceLineId || sourceLineId === line.id) return;
          const dragged = draftLines.find((item) => item.id === sourceLineId);
          if (!dragged) return;
          if (dragged.quotationId !== line.quotationId) return;
          moveLinesBeforeTarget(sourceLineIds, line.id);
          pointerDragDropHandledRef.current = true;
          draggedLineIdRef.current = null;
          draggedLineIdsRef.current = [];
          setDraggedLineId(null);
          setDragOverLineId(null);
          setSelectedDragLineIds([]);
          setIsPointerDraggingLine(false);
        }}
        onDragLeave={() => {
          if (dragOverLineId === line.id) setDragOverLineId(null);
        }}
        onDrop={(event) => {
          const sourceLineIds = resolveDraggedLineIds(event.dataTransfer.getData('application/x-voorcalc-line-ids'));
          const sourceLineId = sourceLineIds[0];
          if (!sourceLineId || sourceLineId === line.id) return;
          event.preventDefault();
          moveLinesBeforeTarget(sourceLineIds, line.id);
          draggedLineIdRef.current = null;
          draggedLineIdsRef.current = [];
          setDraggedLineId(null);
          setDragOverLineId(null);
          setSelectedDragLineIds([]);
        }}
      >
        <td className="group relative p-1.5">
          <input
            className="w-full rounded border border-slate-300 px-1.5 py-0.5 pr-5 text-xs"
            value={line.itemCode}
            onChange={(e) => {
              const nextValue = e.target.value;
              updateDraftLine(line.id, { itemCode: nextValue });
              void loadItemSuggestions(line.id, nextValue);
            }}
            onFocus={(e) => {
              if (e.target.value.trim()) {
                void loadItemSuggestions(line.id, e.target.value);
              }
            }}
            onBlur={(e) => {
              window.setTimeout(() => {
                setItemSuggestions((prev) => (prev.lineId === line.id ? { lineId: null, query: '', items: [], open: false, loading: false } : prev));
              }, 120);
              void applyItemDefaults(line, e.target.value);
            }}
          />
          {itemSuggestions.open && itemSuggestions.lineId === line.id ? (
            <div className="absolute left-1 top-7 z-[140] w-[32rem] max-w-[min(32rem,calc(100vw-2.5rem))] overflow-hidden rounded border border-slate-300 bg-white shadow-lg">
              <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
                {itemSuggestions.loading ? `Zoeken op "${itemSuggestions.query}"...` : `${itemSuggestions.items.length} item(s)`}
              </div>
              <div className="max-h-72 overflow-auto">
                {itemSuggestions.items.map((item) => (
                  <button
                    key={`${line.id}-${item.code}`}
                    type="button"
                    className="grid w-full grid-cols-[110px_1fr] gap-3 border-b border-slate-100 px-3 py-2 text-left hover:bg-brand-50"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applySelectedItem(line, item);
                    }}
                  >
                    <span className="text-xs font-semibold text-slate-700">{item.code}</span>
                    <span className="min-w-0 text-xs text-slate-600">{item.description}</span>
                  </button>
                ))}
                {!itemSuggestions.loading && !itemSuggestions.items.length ? (
                  <div className="px-3 py-2 text-xs text-slate-500">Geen items gevonden.</div>
                ) : null}
              </div>
            </div>
          ) : null}
          {Boolean(getLineMeasurementMode(line)) ? (
            <button
              type="button"
              className="absolute right-1.5 top-1/2 z-10 inline-flex h-4 min-w-4 -translate-y-1/2 items-center justify-center rounded px-0.5 text-[10px] font-semibold tracking-tight text-slate-500 opacity-0 transition group-hover:opacity-100 hover:text-brand-700 focus:opacity-100"
              onClick={() => setMeasurementConfigLineId((prev) => (prev === line.id ? null : line.id))}
              title="Maatinstellingen"
              aria-label="Maatinstellingen"
            >
              ...
            </button>
          ) : null}
          {measurementConfigLineId === line.id ? (
            <div className="absolute left-1 top-7 z-[150] w-56 rounded border border-slate-300 bg-white p-2 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Maatinstellingen</span>
                <button type="button" className="text-[10px] font-semibold text-slate-500 hover:text-slate-700" onClick={() => setMeasurementConfigLineId(null)}>Sluit</button>
              </div>
              <div className="grid gap-2">
                {getLineMeasurementMode(line) === 'm1' || getLineMeasurementMode(line) === 'm2' ? (
                  <>
                    <label className="text-[10px] text-slate-600">
                      <span className="mb-1 block font-medium">Standaard L per stuk</span>
                      <div className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-700">
                        {line.measurementFixedLength !== undefined && line.measurementFixedLength !== null && line.measurementFixedLength !== 0
                          ? `${formatMeasurementValue(line.measurementFixedLength, line.measurementSpecCode)} ${getLineMeasurementSpecLabel(line)}`
                          : 'Niet ingesteld op item'}
                      </div>
                    </label>
                    {getLineMeasurementMode(line) === 'm2' ? (
                      <label className="text-[10px] text-slate-600">
                        <span className="mb-1 block font-medium">Standaard B per stuk</span>
                        <div className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-700">
                          {line.measurementFixedWidth !== undefined && line.measurementFixedWidth !== null && line.measurementFixedWidth !== 0
                            ? `${formatMeasurementValue(line.measurementFixedWidth, line.measurementSpecCode)} ${getLineMeasurementSpecLabel(line)}`
                            : 'Niet ingesteld op item'}
                        </div>
                      </label>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </td>
        <td className="p-1.5"><input className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs" value={line.description} onChange={(e) => updateDraftLine(line.id, { description: e.target.value })} /></td>
        {settings.columnVisibility.purchaseEnabled !== false ? (
          <td className="p-1.5">
            <label className={`inline-flex items-center gap-1 text-xs ${isNonPurchasableLine(line) ? 'text-slate-400' : 'text-slate-700'}`}>
              <input
                type="checkbox"
                checked={isNonPurchasableLine(line) ? false : line.purchaseEnabled !== false}
                disabled={isNonPurchasableLine(line)}
                onChange={(e) => updateDraftLine(line.id, { purchaseEnabled: e.target.checked })}
              />
              <span>{isNonPurchasableLine(line) ? 'Nee' : (line.purchaseEnabled !== false ? 'Ja' : 'Nee')}</span>
            </label>
          </td>
        ) : null}
        {settings.supplierColumnEnabled ? (
          <td className="group relative p-1.5">
            <input
              className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs"
              value={creditorQueries[line.id] ?? formatCreditorDisplay(line)}
              onChange={(e) => {
                const nextValue = e.target.value;
                setCreditorQueries((prev) => ({ ...prev, [line.id]: nextValue }));
                if (!nextValue.trim()) {
                  updateDraftLine(line.id, { supplierId: undefined, supplierName: undefined });
                  setCreditorSuggestions({ lineId: null, query: '', creditors: [], open: false, loading: false });
                  return;
                }
                updateDraftLine(line.id, { supplierId: undefined, supplierName: nextValue });
                void loadCreditorSuggestions(line.id, nextValue);
              }}
              onFocus={(e) => {
                if (e.target.value.trim()) {
                  void loadCreditorSuggestions(line.id, e.target.value);
                }
              }}
              onBlur={(e) => {
                window.setTimeout(() => {
                  setCreditorSuggestions((prev) => (prev.lineId === line.id ? { lineId: null, query: '', creditors: [], open: false, loading: false } : prev));
                }, 120);
                void applyCreditorDefaults(line, e.target.value);
              }}
            />
            {creditorSuggestions.open && creditorSuggestions.lineId === line.id ? (
              <div className="absolute left-1 top-7 z-[140] w-[28rem] max-w-[min(28rem,calc(100vw-2.5rem))] overflow-hidden rounded border border-slate-300 bg-white shadow-lg">
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
                  {creditorSuggestions.loading ? `Zoeken op "${creditorSuggestions.query}"...` : `${creditorSuggestions.creditors.length} inkooprelatie(s)`}
                </div>
                <div className="max-h-72 overflow-auto">
                  {creditorSuggestions.creditors.map((creditor) => (
                    <button
                      key={`${line.id}-${creditor.id}`}
                      type="button"
                      className="grid w-full grid-cols-[110px_1fr] gap-3 border-b border-slate-100 px-3 py-2 text-left hover:bg-brand-50"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        applySelectedCreditor(line, creditor);
                      }}
                    >
                      <span className="text-xs font-semibold text-slate-700">{creditor.id}</span>
                      <span className="min-w-0 text-xs text-slate-600">{creditor.name}</span>
                    </button>
                  ))}
                  {!creditorSuggestions.loading && !creditorSuggestions.creditors.length ? (
                    <div className="px-3 py-2 text-xs text-slate-500">Geen inkooprelaties gevonden.</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </td>
        ) : null}
        <td className="p-1.5">
          <input
            className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs"
            value={line.unit}
            onChange={(e) => {
              const nextUnit = e.target.value;
              const nextMeasurementMode = getLegacyMeasurementMode(nextUnit);
              updateDraftLine(line.id, {
                unit: nextUnit,
                measurementFixedLength: nextMeasurementMode ? line.measurementFixedLength : undefined,
                measurementFixedWidth: nextMeasurementMode === 'm2' ? line.measurementFixedWidth : undefined,
              });
              if (!nextMeasurementMode) {
                setMeasurementConfigLineId((prev) => (prev === line.id ? null : prev));
              }
              if (qtyCalculator?.lineId === line.id && !getQtyCalcMode({ ...line, unit: nextUnit })) {
                setQtyCalculator(null);
              }
            }}
          />
        </td>
        <td className="group relative overflow-visible p-1.5">
          <input
            type="number"
            min={0}
            step="0.01"
            className={`w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs ${isBaseQtyDerived ? 'italic text-slate-700' : ''}`}
            value={line.baseQty}
            onChange={(e) =>
              updateDraftLine(line.id, {
                baseQty: toNonNegative(Number(e.target.value) || 0),
                qtyFormula: undefined,
                qtyFormulaMemo: undefined,
              })
            }
            onKeyDown={(e) => onBaseQtyKeyDown(e, line)}
          />
          {getQtyCalcMode(line) ? (
            <button
              type="button"
              className={`absolute right-1 top-1/2 z-10 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded border border-brand-600 bg-white text-[10px] font-semibold text-brand-700 transition ${isQtyHelperVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100'}`}
              onClick={() => openQtyCalculator(line)}
              title={getQtyCalcMode(line) === 'm3' ? 'Bereken LxBxH' : getQtyCalcMode(line) === 'm2' ? 'Bereken LxB' : 'Bereken L'}
              aria-label="Basis aantal berekenen"
            >
              =
            </button>
          ) : null}
          {qtyCalculator?.lineId === line.id ? (
            <div className={`absolute right-1 top-7 z-[140] rounded border border-slate-300 bg-white p-2 shadow-lg ${qtyCalculator.mode === 'm3' ? 'w-44' : 'w-56'}`}>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[10px] font-semibold text-slate-600">
                  {qtyCalculator.mode === 'm3' ? 'Stukmaat L x B x H' : qtyCalculator.mode === 'm2' ? 'Stukmaat L x B' : 'Stukmaat L'}
                </div>
                {qtyCalculator.mode === 'm1' || qtyCalculator.mode === 'm2' ? (
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100"
                    onClick={addQtyCalculatorRow}
                    title="Regel toevoegen"
                    aria-label="Regel toevoegen"
                  >
                    +
                  </button>
                ) : null}
              </div>
              {(qtyCalculator.mode === 'm1' && (qtyCalculator.fixedLength ?? 0) > 0) || (qtyCalculator.mode === 'm2' && ((qtyCalculator.fixedLength ?? 0) > 0 || (qtyCalculator.fixedWidth ?? 0) > 0)) ? (
                <div className="mb-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                  {(qtyCalculator.fixedLength ?? 0) > 0
                    ? `Vaste itemmaat L: ${formatMeasurementValue(qtyCalculator.fixedLength ?? 0, qtyCalculator.measurementSpecCode)} ${getLengthWidthSpecLabel(qtyCalculator.measurementSpecCode, qtyCalculator.measurementSpec)}`
                    : null}
                  {(qtyCalculator.fixedLength ?? 0) > 0 && (qtyCalculator.fixedWidth ?? 0) > 0 ? ' | ' : null}
                  {(qtyCalculator.fixedWidth ?? 0) > 0
                    ? `Vaste itemmaat B: ${formatMeasurementValue(qtyCalculator.fixedWidth ?? 0, qtyCalculator.measurementSpecCode)} ${getLengthWidthSpecLabel(qtyCalculator.measurementSpecCode, qtyCalculator.measurementSpec)}`
                    : null}
                </div>
              ) : null}
              {qtyCalculator.mode === 'm3' ? (
                <div className="grid grid-cols-3 gap-1">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
                    placeholder="Stuk L"
                    value={qtyCalculator.length}
                    onChange={(e) => setQtyCalculator((prev) => (prev ? { ...prev, length: toNonNegative(Number(e.target.value) || 0) } : prev))}
                    onKeyDown={onQtyCalculatorInputKeyDown}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
                    placeholder="Stuk B"
                    value={qtyCalculator.width}
                    onChange={(e) => setQtyCalculator((prev) => (prev ? { ...prev, width: toNonNegative(Number(e.target.value) || 0) } : prev))}
                    onKeyDown={onQtyCalculatorInputKeyDown}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
                    placeholder="Stuk H"
                    value={qtyCalculator.height}
                    onChange={(e) => setQtyCalculator((prev) => (prev ? { ...prev, height: toNonNegative(Number(e.target.value) || 0) } : prev))}
                    onKeyDown={onQtyCalculatorInputKeyDown}
                  />
                </div>
              ) : (
                <div className="rounded border border-slate-200">
                  <div className={`grid gap-1 border-b border-slate-200 bg-slate-50 px-1 py-1 text-[10px] font-semibold text-slate-600 ${qtyCalculator.mode === 'm2' ? 'grid-cols-[1fr_1fr_20px]' : 'grid-cols-[1fr_20px]'}`}>
                    <span>L</span>
                    {qtyCalculator.mode === 'm2' ? <span>B</span> : null}
                    <span />
                  </div>
                  <div className="max-h-36 space-y-1 overflow-y-auto overflow-x-hidden p-1">
                    {qtyCalculator.rows.map((row) => (
                      <div
                        key={row.id}
                        className={`grid items-center gap-1 ${qtyCalculator.mode === 'm2' ? 'grid-cols-[1fr_1fr_20px]' : 'grid-cols-[1fr_20px]'}`}
                      >
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
                          placeholder="0,00"
                          value={row.length}
                          onChange={(e) => updateQtyCalculatorRow(row.id, { length: toNonNegative(Number(e.target.value) || 0) })}
                          onKeyDown={onQtyCalculatorInputKeyDown}
                        />
                        {qtyCalculator.mode === 'm2' ? (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="w-full rounded border border-slate-300 px-1 py-0.5 text-xs"
                            placeholder="0,00"
                            value={row.width}
                            onChange={(e) => updateQtyCalculatorRow(row.id, { width: toNonNegative(Number(e.target.value) || 0) })}
                            onKeyDown={onQtyCalculatorInputKeyDown}
                          />
                        ) : null}
                        <button
                          type="button"
                          className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-300 text-[10px] text-slate-700 hover:bg-slate-100"
                          onClick={() => removeQtyCalculatorRow(row.id)}
                          title="Regel verwijderen"
                        >
                          -
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-2 flex justify-end gap-1">
                <button
                  type="button"
                  className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100"
                  onClick={() => setQtyCalculator(null)}
                >
                  Sluit
                </button>
                <button
                  type="button"
                  className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-brand-700"
                  onClick={applyQtyCalculator}
                >
                  Vul in
                </button>
              </div>
            </div>
          ) : null}
        </td>

        {activeQtyMarkupColumns.map((type) => (
          <td key={type} className="p-1.5">
            {activeLineQtyMarkups.includes(type) ? (
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={`w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs ${getMarkupValueType(settings, 'line', type) === 'percentage' ? 'pr-5' : ''}`}
                  value={getLineMarkupValue(line, type)}
                  onChange={(e) => updateDraftLine(line.id, buildLineMarkupPatch(type, toNonNegative(Number(e.target.value) || 0)))}
                />
                {getMarkupValueType(settings, 'line', type) === 'percentage' ? <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">%</span> : null}
              </div>
            ) : null}
          </td>
        ))}

        <td className="p-1.5 text-right text-xs font-medium">{computed.computedQty.toFixed(2)}</td>
        <td className="group relative overflow-visible p-1.5">
          <input
            type="number"
            min={0}
            step="0.01"
            className={`w-full rounded border border-slate-300 px-1.5 py-0.5 pr-5 text-xs ${isUnitCostDerived ? 'italic text-slate-700' : ''}`}
            value={line.unitCost}
            onChange={(e) =>
              updateDraftLine(line.id, {
                unitCost: toNonNegative(Number(e.target.value) || 0),
                costFormula: undefined,
                costFormulaMemo: undefined,
              })
            }
          />
          {settings.unitCostCalculatorEnabled ? (
            <button
              type="button"
              className={`absolute right-1 top-1/2 z-10 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded border border-brand-600 bg-white text-[10px] font-semibold text-brand-700 transition ${isCostHelperVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100'}`}
              onClick={() => openCostCalculator(line)}
              title="Kostprijs berekenen"
              aria-label="Kostprijs berekenen"
            >
              =
            </button>
          ) : null}
          {costCalculator?.lineId === line.id ? (
            <div className="absolute right-1 top-7 z-[140] w-80 rounded border border-slate-300 bg-white p-2 shadow-lg">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[10px] font-semibold text-slate-600">Kostprijs rekenmodule</div>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100"
                  onClick={addCostCalculatorRow}
                >
                  +
                </button>
              </div>
              <div className="max-h-44 overflow-auto rounded border border-slate-200">
                <table className="w-full border-collapse text-[10px]">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-1 text-left font-semibold">Omschrijving</th>
                      <th className="w-16 p-1 text-center font-semibold">Type</th>
                      <th className="p-1 text-right font-semibold">Aantal</th>
                      <th className="p-1 text-right font-semibold">Kost</th>
                      <th className="p-1 text-right font-semibold">Bedrag</th>
                      <th className="w-6 p-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {costCalculator.rows.map((row, index) => {
                      const rowTotal = costCalculatorPreview.deltas[index] ?? 0;
                      return (
                        <tr key={row.id} className="border-t border-slate-200">
                          <td className="p-1">
                            <input
                              className="w-full rounded border border-slate-300 px-1 py-0.5 text-[10px]"
                              value={row.label}
                              onChange={(e) => updateCostCalculatorRow(row.id, { label: e.target.value })}
                              onKeyDown={onCostCalculatorInputKeyDown}
                            />
                          </td>
                          <td className="p-1">
                            <select
                              className="min-w-[56px] w-full rounded border border-slate-300 px-1 py-0.5 text-[10px]"
                              value={row.operator}
                              onChange={(e) => updateCostCalculatorRow(row.id, { operator: normalizeCostFormulaOperator(e.target.value) })}
                            >
                              <option value="+">+</option>
                              <option value="-">-</option>
                              <option value="%">%</option>
                            </select>
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="w-full rounded border border-slate-300 px-1 py-0.5 text-right text-[10px]"
                              value={row.qty}
                              onChange={(e) => updateCostCalculatorRow(row.id, { qty: toNonNegative(Number(e.target.value) || 0) })}
                              onKeyDown={onCostCalculatorInputKeyDown}
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="w-full rounded border border-slate-300 px-1 py-0.5 text-right text-[10px]"
                              value={row.unitCost}
                              onChange={(e) => updateCostCalculatorRow(row.id, { unitCost: toNonNegative(Number(e.target.value) || 0) })}
                              onKeyDown={onCostCalculatorInputKeyDown}
                            />
                          </td>
                          <td className="p-1 text-right text-[10px] font-medium">{formatAmount(rowTotal)}</td>
                          <td className="p-1 text-right">
                            <button
                              type="button"
                              className="inline-flex h-4 w-4 items-center justify-center rounded text-rose-600 hover:bg-rose-50"
                              onClick={() => removeCostCalculatorRow(row.id)}
                              title="Verwijder rekenregel"
                              aria-label="Verwijder rekenregel"
                            >
                              x
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-700">
                <span>Totaal kostprijs</span>
                <span className="font-semibold">
                  {formatAmount(costCalculatorPreview.total)}
                </span>
              </div>
              <div className="mt-2 flex justify-end gap-1">
                <button
                  type="button"
                  className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-100"
                  onClick={() => setCostCalculator(null)}
                >
                  Sluit
                </button>
                <button
                  type="button"
                  className="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-brand-700"
                  onClick={applyCostCalculator}
                >
                  Vul in
                </button>
              </div>
            </div>
          ) : null}
        </td>
        {settings.purchasePriceColumnEnabled ? (
          <td className="p-1.5">
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs"
              value={line.purchasePrice ?? 0}
              onChange={(e) => updateDraftLine(line.id, { purchasePrice: toNonNegative(Number(e.target.value) || 0) })}
            />
          </td>
        ) : null}

        {activeCostMarkupColumns.map((type) => (
          <td key={type} className="p-1.5">
            {activeLineCostMarkups.includes(type) ? (
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={`w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs ${getMarkupValueType(settings, 'line', type) === 'percentage' ? 'pr-5' : ''}`}
                  value={getLineMarkupValue(line, type)}
                  onChange={(e) => updateDraftLine(line.id, buildLineMarkupPatch(type, toNonNegative(Number(e.target.value) || 0)))}
                />
                {getMarkupValueType(settings, 'line', type) === 'percentage' ? <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">%</span> : null}
              </div>
            ) : null}
          </td>
        ))}

        <td className="p-1.5 text-right text-xs font-medium">{formatAmount(computed.computedUnitCost)}</td>
        <td className="p-1.5 text-right text-xs font-medium">{formatAmount(computed.costTotal)}</td>
        <td className="p-1.5"><input type="number" min={0} step="0.01" className="w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs" value={line.unitPrice} onChange={(e) => updateDraftLine(line.id, { unitPrice: toNonNegative(Number(e.target.value) || 0) })} /></td>
        {activePriceMarkupColumns.map((type) => (
          <td key={`price-${type}`} className="p-1.5">
            {activeLinePriceMarkups.includes(type) ? (
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={`w-full rounded border border-slate-300 px-1.5 py-0.5 text-xs ${getMarkupValueType(settings, 'line', type) === 'percentage' ? 'pr-5' : ''}`}
                  value={getLineMarkupValue(line, type)}
                  onChange={(e) => updateDraftLine(line.id, buildLineMarkupPatch(type, toNonNegative(Number(e.target.value) || 0)))}
                />
                {getMarkupValueType(settings, 'line', type) === 'percentage' ? <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">%</span> : null}
              </div>
            ) : null}
          </td>
        ))}
        <td className="p-1.5 text-right text-xs font-medium">{formatAmount(computed.priceTotal)}</td>
        <td className="p-1.5 pr-2 text-right">
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              draggable
              className={`inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-700 ${draggedLineId === line.id ? 'opacity-40' : ''} ${selectedDragLineIds.includes(line.id) ? 'ring-1 ring-brand-600 bg-brand-50 text-brand-700' : ''}`}
              onDragStart={(event) => {
                const activeIds = getActiveDragSelection(line.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', line.id);
                event.dataTransfer.setData('application/x-voorcalc-line-ids', JSON.stringify(activeIds));
                draggedLineIdRef.current = line.id;
                draggedLineIdsRef.current = activeIds;
                setDraggedLineId(line.id);
                setDragOverLineId(null);
              }}
              onMouseDown={(event) => {
                if (event.button !== 0) return;
                if (event.ctrlKey || event.metaKey) {
                  event.preventDefault();
                  setSelectedDragLineIds((prev) => (prev.includes(line.id) ? prev.filter((id) => id !== line.id) : [...prev, line.id]));
                  return;
                }
                event.preventDefault();
                const activeIds = getActiveDragSelection(line.id);
                pointerDragDropHandledRef.current = false;
                draggedLineIdRef.current = line.id;
                draggedLineIdsRef.current = activeIds;
                setDraggedLineId(line.id);
                setDragOverLineId(null);
                setIsPointerDraggingLine(true);
              }}
              onDragEnd={() => {
                draggedLineIdRef.current = null;
                draggedLineIdsRef.current = [];
                setDraggedLineId(null);
                setDragOverLineId(null);
                setSelectedDragLineIds([]);
                setIsPointerDraggingLine(false);
              }}
              aria-label="Versleep regel"
              title="Versleep regel"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="8" cy="6" r="1" />
                <circle cx="16" cy="6" r="1" />
                <circle cx="8" cy="12" r="1" />
                <circle cx="16" cy="12" r="1" />
                <circle cx="8" cy="18" r="1" />
                <circle cx="16" cy="18" r="1" />
              </svg>
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-brand-700 hover:bg-slate-100 hover:text-brand-800"
              onClick={() => duplicateLine(line)}
              aria-label="Dupliceer regel"
              title="Dupliceer regel"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="10" height="10" rx="1.5" />
                <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              onClick={() => deleteLine(line)}
              aria-label="Verwijder regel"
              title="Verwijder regel"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4.75A1.75 1.75 0 0 1 9.75 3h4.5A1.75 1.75 0 0 1 16 4.75V6" />
                <path d="M6.75 6 7.5 19.25A1.75 1.75 0 0 0 9.25 21h5.5a1.75 1.75 0 0 0 1.75-1.75L17.25 6" />
                <path d="M10 10.25v6.5M14 10.25v6.5" />
              </svg>
            </button>
          </div>
        </td>
        </tr>
        {popupSpacerHeight > 0 ? (
          <tr aria-hidden="true" className="border-b border-transparent">
            <td className="p-0" colSpan={tableColumnKeys.length} style={{ height: `${popupSpacerHeight}px` }} />
          </tr>
        ) : null}
      </Fragment>
    );
  }
  function renderColGroup() {
    return (
      <colgroup>
        {tableColumnKeys.map((key) => (
          <col key={key} style={{ width: `${Math.round(getColumnWidth(key) * FIXED_TABLE_SCALE)}px` }} />
        ))}
      </colgroup>
    );
  }
  function renderResizableHeader(label: string, key: string, withResizer = true, align: 'left' | 'right' = 'left') {
    const textClass = align === 'right' ? 'block pr-3 text-right' : 'pr-3';
    const thClass = align === 'right' ? 'relative p-2 text-right' : 'relative p-2';

    return (
      <th key={key} className={thClass}>
        <span className={textClass}>{label}</span>
        {withResizer ? (
          <button
            type="button"
            aria-label={`Resize ${label}`}
            className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent"
            onMouseDown={(e) => startColumnResize(key, e)}
          />
        ) : null}
      </th>
    );
  }

  function markupShort(type: MarkupType, scope: 'line' | 'phase') {
    const map = scope === 'line' ? settings.lineMarkupItemCodes : settings.phaseMarkupItemCodes;
    const raw = map[type] ?? MARKUP_LABELS[type];
    const clean = raw.trim();
    return clean || MARKUP_LABELS[type];
  }

  function markupHeaderLabel(type: MarkupType) {
    const raw = settings.lineMarkupDescriptions[type] ?? MARKUP_DESCRIPTIONS[type] ?? markupShort(type, 'line');
    const label = raw.trim();
    const suffix = getMarkupValueTypeSuffix(getMarkupValueType(settings, 'line', type));
    if (!label) return `${markupShort(type, 'line')} ${suffix}`;
    return `${label} ${suffix}`;
  }

  function renderTableHeader() {
    function keyToHeader(key: string): { label: string; align?: 'left' | 'right'; withResizer?: boolean } {
      if (key === 'item') return { label: 'Item' };
      if (key === 'description') return { label: 'Omschrijving' };
      if (key === 'purchaseEnabled') return { label: 'Inkopen' };
      if (key === 'supplier') return { label: 'Inkooprelatie' };
      if (key === 'unit') return { label: 'Eenheid' };
      if (key === 'baseQty') return { label: 'Basis aantal' };
      if (key === 'computedQty') return { label: 'Aantal', align: 'right' };
      if (key === 'unitCost') return { label: 'Kostprijs' };
      if (key === 'purchasePrice') return { label: 'Inkoopprijs' };
      if (key === 'computedUnitCost') return { label: 'Bedrag na', align: 'right' };
      if (key === 'costTotal') return { label: 'Kosten', align: 'right' };
      if (key === 'unitPrice') return { label: 'Prijs' };
      if (key === 'priceTotal') return { label: 'Bedrag', align: 'right' };
      if (key === 'actions') return { label: '', withResizer: false };
      if (key.startsWith('qty-')) return { label: markupHeaderLabel(key.replace('qty-', '') as MarkupType) };
      if (key.startsWith('cost-')) return { label: markupHeaderLabel(key.replace('cost-', '') as MarkupType) };
      if (key.startsWith('priceMarkup-')) return { label: markupHeaderLabel(key.replace('priceMarkup-', '') as MarkupType) };
      return { label: key };
    }

    return (
      <tr>
        {tableColumnKeys.map((key) => {
          const meta = keyToHeader(key);
          return renderResizableHeader(meta.label, key, meta.withResizer ?? true, meta.align ?? 'left');
        })}
      </tr>
    );
  }

  function getQuotationHeaderTotals(quotationId: string) {
    const quotationLines = activeLines.filter((line) => line.quotationId === quotationId);

    if (!showPhasePanel) {
      const subtotalCost = quotationLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.costTotal ?? 0), 0);
      const subtotalAmount = quotationLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.priceTotal ?? 0), 0);
      const totals = calcAggregateTotals(
        subtotalCost,
        subtotalAmount,
        getAggregateMarkupsForGroup(quotationId, NO_STAGE_ID, project?.projectMarkups ?? {}),
        activePhaseMarkupConfigs,
      );
      return { cost: totals.totalCostInclMarkups, amount: totals.totalAmountInclMarkups };
    }

    let cost = 0;
    let amount = 0;
    stages
      .filter((stage) => activeStageIds.includes(stage.id))
      .forEach((stage) => {
        const stageLines = quotationLines.filter((line) => line.stageId === stage.id);
        const subtotalCost = stageLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.costTotal ?? 0), 0);
        const subtotalAmount = stageLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.priceTotal ?? 0), 0);
        const totals = calcAggregateTotals(
          subtotalCost,
          subtotalAmount,
          getAggregateMarkupsForGroup(quotationId, stage.id, stage.phaseMarkups ?? {}),
          activePhaseMarkupConfigs,
        );
        cost += totals.totalCostInclMarkups;
        amount += totals.totalAmountInclMarkups;
      });

    const noStageLines = quotationLines.filter((line) => line.stageId === NO_STAGE_ID);
    if (noStageLines.length) {
      const subtotalCost = noStageLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.costTotal ?? 0), 0);
      const subtotalAmount = noStageLines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.priceTotal ?? 0), 0);
      const totals = calcAggregateTotals(
        subtotalCost,
        subtotalAmount,
        getAggregateMarkupsForGroup(quotationId, NO_STAGE_ID, project?.projectMarkups ?? {}),
        activePhaseMarkupConfigs,
      );
      cost += totals.totalCostInclMarkups;
      amount += totals.totalAmountInclMarkups;
    }

    return { cost, amount };
  }

  function renderStageGroup(scope: string, quotationId: string, stage: StageGroup) {
    const key = `${scope}:${stage.id}`;
    const isOpen = expandedStageKeys.includes(key);
    const isNoPhaseGroup = stage.id === NO_STAGE_ID || stage.isNoPhase;
    const lines = activeLines
      .filter((line) => line.quotationId === quotationId && line.stageId === stage.id)
      .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id, 'nl')));
    const subtotalCost = lines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.costTotal ?? 0), 0);
    const subtotalAmount = lines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.priceTotal ?? 0), 0);
    const stageMarkups = isNoPhaseGroup
      ? getAggregateMarkupsForGroup(quotationId, NO_STAGE_ID, project?.projectMarkups ?? {})
      : getAggregateMarkupsForGroup(quotationId, stage.id, stage.phaseMarkups ?? {});
    const stageTotals = calcAggregateTotals(
      subtotalCost,
      subtotalAmount,
      stageMarkups,
      activePhaseMarkupConfigs,
    );

    const isActivePopupBlock = activeCalculatorLine?.quotationId === quotationId && activeCalculatorLine?.stageId === stage.id;
    const isLibraryDropTarget = libraryDropTarget === `lib:${quotationId}:${stage.id}`;

    return (
      <section key={key} className={`relative overflow-visible rounded border ${isLibraryDropTarget ? 'border-brand-500 ring-1 ring-brand-200' : 'border-slate-200'} ${isActivePopupBlock ? 'z-50' : 'z-0'}`}> 
        <div className="relative flex items-center gap-2 bg-slate-50 px-3 py-2">
          <button type="button" className="flex flex-1 items-center gap-3 text-left text-sm font-semibold text-slate-700" onClick={() => toggleStageExpand(scope, stage.id)}>
            <span>{isNoPhaseGroup ? stage.name : `${stage.code} - ${stage.name}`}</span>
            <span className={`ml-auto text-[11px] ${isOpen ? 'font-medium text-slate-600' : 'font-bold text-slate-900'}`}>KOSTEN {formatAmount(stageTotals.totalCostInclMarkups)} | BEDRAG {formatAmount(stageTotals.totalAmountInclMarkups)} | MARGE {formatMarginPct(stageTotals.totalCostInclMarkups, stageTotals.totalAmountInclMarkups)}</span>
            <span>{isOpen ? '▾' : '▸'}</span>
          </button>
          {!isNoPhaseGroup ? (
            <div className="relative">
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                onClick={(event) => {
                  event.stopPropagation();
                  openStageMenu(quotationId, stage.id);
                }}
                aria-label="Fase acties"
                title="Fase acties"
              >
                ⋯
              </button>
              {openContainerMenu?.type === 'stage' && openContainerMenu.quotationId === quotationId && openContainerMenu.stageId === stage.id ? (
                <div className="container-action-menu absolute right-0 top-8 z-30 w-64 rounded border border-slate-200 bg-white p-1 shadow-lg">
                  <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Acties</div>
                  <ul className="space-y-0.5">
                    <li>
                      <button
                        type="button"
                        className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                        onClick={() => startCopyStage(quotationId, stage.id)}
                      >
                        <span className="mr-2 text-slate-400">•</span>
                        <span>Kopie maken</span>
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                        onClick={() => startRenameStage(quotationId, stage.id)}
                      >
                        <span className="mr-2 text-slate-400">•</span>
                        <span>Naam wijzigen</span>
                      </button>
                    </li>
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {isOpen ? (
          <div className="p-3">
            <div
              className="group relative z-0 w-full max-w-full overflow-x-hidden overflow-y-visible rounded border border-slate-200"
              onMouseEnter={() => {
                addLineHotkeyRef.current = () => addLineToGroup(quotationId, stage.id);
              }}
              onFocusCapture={() => {
                addLineHotkeyRef.current = () => addLineToGroup(quotationId, stage.id);
              }}
              onMouseLeave={() => {
                if (addLineHotkeyRef.current) addLineHotkeyRef.current = null;
              }}
              onDragOver={(event) => {
                if (!draggedLibraryQuotationId) return;
                event.preventDefault();
                if (libraryDropTarget !== `lib:${quotationId}:${stage.id}`) setLibraryDropTarget(`lib:${quotationId}:${stage.id}`);
              }}
              onDragLeave={() => {
                if (libraryDropTarget === `lib:${quotationId}:${stage.id}`) setLibraryDropTarget(null);
              }}
              onDrop={(event) => {
                if (!draggedLibraryQuotationId) return;
                event.preventDefault();
                insertLibraryQuotationIntoGroup(draggedLibraryQuotationId, quotationId, stage.id);
                setDraggedLibraryQuotationId(null);
                setLibraryDropTarget(null);
              }}
            >

              <div className="w-full" style={{ fontSize: `${Math.max(10, Math.round(12 * FIXED_TABLE_SCALE))}px` }}>
                <table className="w-full table-fixed text-left">
                  {renderColGroup()}
                  <thead className="bg-slate-100 text-xs uppercase text-slate-600">{renderTableHeader()}</thead>
                <tbody>
                  {lines.length
                    ? lines.flatMap((line) => {
                      const beforeKey = `before:${quotationId}:${stage.id}:${line.id}`;
                      const beforeRow = renderLineDropZoneRow({
                        dropKey: beforeKey,
                        quotationId,
                        onDropAction: (sourceLineIds) => {
                          moveLinesBeforeTarget(sourceLineIds, line.id);
                        },
                      });
                      return beforeRow ? [beforeRow, renderLineRow(line)] : [renderLineRow(line)];
                    })
                    : null}
                  {renderLineDropZoneRow({
                    dropKey: `end:${quotationId}:${stage.id}`,
                    quotationId,
                    onDropAction: (sourceLineIds) => {
                      moveLinesToGroupEnd(sourceLineIds, quotationId, stage.id);
                    },
                  })}
                  
                  {renderCompactTotalsRows(subtotalCost, subtotalAmount, stageMarkups, () => addLineToGroup(quotationId, stage.id))[0]}
                  {renderMarkupRowsInTable(
                    subtotalCost,
                    subtotalAmount,
                    stageMarkups,
                    (type, value) => isNoPhaseGroup ? handleProjectMarkupChange(quotationId, type, value) : handleStageMarkupChange(quotationId, stage.id, stage.phaseMarkups ?? {}, type, value),
                  )}
                  {renderCompactTotalsRows(subtotalCost, subtotalAmount, stageMarkups)[1]}
                </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }
  function renderQuotationGroup(quotation: Quotation) {
    const isOpen = expandedQuotationIds.includes(quotation.id);
    const lockedQuotation = getLockedQuotationInfo(quotation.id);
    const lines = activeLines
      .filter((line) => line.quotationId === quotation.id)
      .sort((a, b) => (a.order !== b.order ? a.order - b.order : a.id.localeCompare(b.id, 'nl')));
    const subtotalCost = lines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.costTotal ?? 0), 0);
    const subtotalAmount = lines.reduce((sum, line) => sum + (lineComputed.get(line.id)?.priceTotal ?? 0), 0);
    const quotationTotals = getQuotationHeaderTotals(quotation.id);

    const isActivePopupBlock = activeCalculatorLine?.quotationId === quotation.id;
    const isLibraryDropTarget = libraryDropTarget === `lib:${quotation.id}:NO_STAGE`;

    return (
      <section key={quotation.id} className={`relative overflow-visible rounded border ${isLibraryDropTarget ? 'border-brand-500 ring-1 ring-brand-200' : 'border-slate-200'} ${isActivePopupBlock ? 'z-50' : 'z-0'}`}> 
        <div className="relative flex items-center gap-2 bg-slate-50 px-3 py-2">
          <button type="button" className="flex flex-1 items-center gap-3 text-left text-sm font-semibold text-slate-700" onClick={() => toggleQuotationExpand(quotation.id)}>
            <span>{quotation.number} - {quotation.name}</span>
            <span className={`ml-auto text-[11px] ${isOpen ? 'font-medium text-slate-600' : 'font-bold text-slate-900'}`}>KOSTEN {formatAmount(quotationTotals.cost)} | BEDRAG {formatAmount(quotationTotals.amount)} | MARGE {formatMarginPct(quotationTotals.cost, quotationTotals.amount)}</span>
            <span>{isOpen ? '▾' : '▸'}</span>
          </button>
          {renderLockedQuotationBadge(quotation.id)}
          <div className="relative">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={(event) => {
                event.stopPropagation();
                openQuotationMenu(quotation.id);
              }}
              aria-label="Voorcalculatie acties"
              title="Voorcalculatie acties"
              disabled={Boolean(lockedQuotation)}
            >
              ⋯
            </button>
            {openContainerMenu?.type === 'quotation' && openContainerMenu.quotationId === quotation.id ? (
              <div className="container-action-menu absolute right-0 top-8 z-30 w-64 rounded border border-slate-200 bg-white p-1 shadow-lg">
                <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Acties</div>
                <ul className="space-y-0.5">
                  <li>
                    <button
                      type="button"
                      className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                      onClick={() => startCopyQuotation(quotation.id)}
                    >
                      <span className="mr-2 text-slate-400">•</span>
                      <span>Kopie maken</span>
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                      onClick={() => startRenameQuotation(quotation.id)}
                    >
                      <span className="mr-2 text-slate-400">•</span>
                      <span>Naam wijzigen</span>
                    </button>
                  </li>
                </ul>
              </div>
            ) : null}
          </div>
        </div>
        {isOpen ? (
          <div className="relative p-3">
            <div
              className={`group relative z-0 w-full max-w-full overflow-x-hidden overflow-y-visible rounded border border-slate-200 ${lockedQuotation ? 'pointer-events-none opacity-45 select-none' : ''}`}
              onMouseEnter={() => {
                addLineHotkeyRef.current = () => addLineToGroup(quotation.id, 'NO_STAGE');
              }}
              onFocusCapture={() => {
                addLineHotkeyRef.current = () => addLineToGroup(quotation.id, 'NO_STAGE');
              }}
              onMouseLeave={() => {
                if (addLineHotkeyRef.current) addLineHotkeyRef.current = null;
              }}
              onDragOver={(event) => {
                if (!draggedLibraryQuotationId) return;
                event.preventDefault();
                if (libraryDropTarget !== `lib:${quotation.id}:NO_STAGE`) setLibraryDropTarget(`lib:${quotation.id}:NO_STAGE`);
              }}
              onDragLeave={() => {
                if (libraryDropTarget === `lib:${quotation.id}:NO_STAGE`) setLibraryDropTarget(null);
              }}
              onDrop={(event) => {
                if (!draggedLibraryQuotationId) return;
                event.preventDefault();
                insertLibraryQuotationIntoGroup(draggedLibraryQuotationId, quotation.id, 'NO_STAGE');
                setDraggedLibraryQuotationId(null);
                setLibraryDropTarget(null);
              }}
            >

              <div className="w-full" style={{ fontSize: `${Math.max(10, Math.round(12 * FIXED_TABLE_SCALE))}px` }}>
                <table className="w-full table-fixed text-left">
                  {renderColGroup()}
                  <thead className="bg-slate-100 text-xs uppercase text-slate-600">{renderTableHeader()}</thead>
                <tbody>
                  {lines.length
                    ? lines.flatMap((line) => {
                      const beforeKey = `before:${quotation.id}:NO_STAGE:${line.id}`;
                      const beforeRow = renderLineDropZoneRow({
                        dropKey: beforeKey,
                        quotationId: quotation.id,
                        onDropAction: (sourceLineIds) => {
                          moveLinesBeforeTarget(sourceLineIds, line.id);
                        },
                      });
                      return beforeRow ? [beforeRow, renderLineRow(line)] : [renderLineRow(line)];
                    })
                    : null}
                  {renderLineDropZoneRow({
                    dropKey: `end:${quotation.id}:NO_STAGE`,
                    quotationId: quotation.id,
                    onDropAction: (sourceLineIds) => {
                      moveLinesToGroupEnd(sourceLineIds, quotation.id, 'NO_STAGE');
                    },
                  })}
                  
                  {!showPhasePanel ? renderCompactTotalsRows(subtotalCost, subtotalAmount, getAggregateMarkupsForGroup(quotation.id, NO_STAGE_ID, project?.projectMarkups ?? {}), () => addLineToGroup(quotation.id, 'NO_STAGE'))[0] : null}
                  {!showPhasePanel ? renderMarkupRowsInTable(subtotalCost, subtotalAmount, getAggregateMarkupsForGroup(quotation.id, NO_STAGE_ID, project?.projectMarkups ?? {}), (type, value) => handleProjectMarkupChange(quotation.id, type, value)) : null}
                  {!showPhasePanel ? renderCompactTotalsRows(subtotalCost, subtotalAmount, getAggregateMarkupsForGroup(quotation.id, NO_STAGE_ID, project?.projectMarkups ?? {}))[1] : null}
                </tbody>
                </table>
              </div>
            </div>
            {renderLockedQuotationOverlay(quotation.id)}
          </div>
        ) : null}
      </section>
    );
  }

  const selectableProjects = useMemo(() => projects.filter((option) => option.id !== 'BIB'), [projects]);
  const showQuotationSelector = quotations.length > 1;

  const layoutGridClass = useMemo(() => {
    if (showPhasePanel && showLibraryPanel) {
      if (isPhasePanelCollapsed && isLibraryPanelCollapsed) return 'md:grid-cols-[46px_1fr_46px]';
      if (isPhasePanelCollapsed && !isLibraryPanelCollapsed) return 'md:grid-cols-[46px_1fr_280px]';
      if (!isPhasePanelCollapsed && isLibraryPanelCollapsed) return 'md:grid-cols-[280px_1fr_46px]';
      return 'md:grid-cols-[280px_1fr_280px]';
    }
    if (showPhasePanel) return isPhasePanelCollapsed ? 'md:grid-cols-[46px_1fr]' : 'md:grid-cols-[280px_1fr]';
    if (showLibraryPanel) return isLibraryPanelCollapsed ? 'md:grid-cols-[1fr_46px]' : 'md:grid-cols-[1fr_280px]';
    return 'md:grid-cols-1';
  }, [showPhasePanel, showLibraryPanel, isPhasePanelCollapsed, isLibraryPanelCollapsed]);
  if (loading) return <div className="p-6 text-sm text-slate-700">Laden...</div>;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 p-3">
      {saving || showSaveSuccess ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-[1px]">
          {saving ? (
            <div className="flex min-w-[240px] items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-lg">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-slate-800">Opslaan in uitvoering</p>
                <p className="text-xs text-slate-600">De wijzigingen worden nu verwerkt.</p>
              </div>
            </div>
          ) : (
            <div className="flex min-w-[220px] items-center gap-3 rounded-lg border border-emerald-200 bg-white px-5 py-4 shadow-lg">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700" aria-hidden="true">✓</span>
              <div>
                <p className="text-sm font-semibold text-emerald-800">Opgeslagen</p>
                <p className="text-xs text-slate-600">Wijzigingen zijn verwerkt.</p>
              </div>
            </div>
          )}
        </div>
      ) : null}
      <header className="mb-3 flex flex-none flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-4 py-3 shadow-sm">
        <div className="text-sm">
          {!isProjectLockedFromUrl ? <label className="mb-0.5 block text-slate-500" htmlFor="project-select">Project</label> : null}
          <div className="flex flex-wrap items-center gap-2.5">
            {!isProjectLockedFromUrl ? (
              <select id="project-select" className="w-72 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs" value={prId} onChange={(e) => setPrId(e.target.value)}>
                <option value="">Selecteer project</option>
                {selectableProjects.map((option) => (<option key={option.id} value={option.id}>{option.id} - {option.name}</option>))}
              </select>
            ) : null}
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-slate-800">{project ? `${project.id} - ${project.name}` : 'Nog geen project geselecteerd'}</h1>
              {project ? (
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                  <span className={`font-medium ${sessionStatusSummary.modeClassName}`}>{sessionStatusSummary.modeLabel}</span>
                  <span aria-hidden="true">•</span>
                  <span>{sessionStatusSummary.detail}</span>
                  {iframeSession ? (
                    <>
                      <span aria-hidden="true">•</span>
                      <span>Ingelogd als {iframeSession.userId}</span>
                    </>
                  ) : iframeContextMode === 'method2' ? (
                    <>
                      <span aria-hidden="true">•</span>
                      <span>iFrame methode 2: projectcontext</span>
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">•</span>
                      <span>Geen iFrame sessieprofiel</span>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          <NavLink to="/" end className={({ isActive }) => navLinkClassName(isActive)}>Voorcalculatie</NavLink>
          <NavLink to="/bestellen" className={({ isActive }) => navLinkClassName(isActive)}>Bestellen</NavLink>
          <button type="button" className="rounded bg-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-300" onClick={() => void toggleFullscreen()} title="Fullscreen" aria-label="Fullscreen">⛶</button>
          <NavLink to="/settings/advanced" className={({ isActive }) => navLinkClassName(isActive)} title="Instellingen" aria-label="Instellingen">⚙</NavLink>
        </nav>
      </header>
      <div className={`grid min-h-0 flex-1 gap-3 ${layoutGridClass}`}>
        {showPhasePanel ? (
          <aside className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${isPhasePanelCollapsed ? 'p-1.5' : 'p-3'}`}>
            <div className={`mb-2 flex items-center ${isPhasePanelCollapsed ? 'justify-center' : 'justify-between'}`}>
              {!isPhasePanelCollapsed ? (
                <button
                  type="button"
                  className="rounded border border-brand-300 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                  onClick={() => { const next = stages.length + 1; setNewStageCode(`F${String(next).padStart(3, '0')}`); setNewStageName(`Nieuwe fase ${next}`); setNewStageChargeMode('0'); setIsCreateStageModalOpen(true); }}
                  disabled={!hasProject}
                >
                  + Nieuwe fase
                </button>
              ) : null}
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                onClick={() => setIsPhasePanelCollapsed((prev) => !prev)}
                aria-label={isPhasePanelCollapsed ? 'Fasepaneel uitklappen' : 'Fasepaneel inklappen'}
                title={isPhasePanelCollapsed ? 'Uitklappen' : 'Inklappen'}
              >
                {isPhasePanelCollapsed ? '>' : '<'}
              </button>
            </div>

            {isPhasePanelCollapsed ? (
              <div className="flex h-[220px] items-center justify-center">
                <span className="text-[10px] font-semibold tracking-[0.25em] text-slate-500 [writing-mode:vertical-rl] [text-orientation:mixed] rotate-180">
                  FASES
                </span>
              </div>
            ) : (
              <div className="min-h-0 overflow-y-auto pr-1">
                <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fasefilter</div>
                <div className="space-y-1">
                  <div className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs transition ${selectableStageIds.length > 0 && selectableStageIds.every((id) => selectedStageIds.includes(id)) ? 'border-slate-300 bg-white text-slate-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                    <div className="flex min-w-0 items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={selectableStageIds.length > 0 && selectableStageIds.every((id) => selectedStageIds.includes(id))}
                        disabled={!selectableStageIds.length}
                        onClick={() => {
                          const allSelected = selectableStageIds.length > 0 && selectableStageIds.every((id) => selectedStageIds.includes(id));
                          setSelectedStageIds(allSelected ? [] : selectableStageIds);
                        }}
                        className={`relative inline-flex h-3 w-5 shrink-0 items-center rounded-full transition ${selectableStageIds.length > 0 && selectableStageIds.every((id) => selectedStageIds.includes(id)) ? 'bg-brand-600/80' : 'bg-slate-300'} disabled:opacity-40`}
                      >
                        <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition ${selectableStageIds.length > 0 && selectableStageIds.every((id) => selectedStageIds.includes(id)) ? 'translate-x-2.5' : 'translate-x-0.5'}`} />
                      </button>
                      <span className="truncate">Alle fases</span>
                    </div>
                  </div>
                  {stages.map((stage) => {
                    const count = stageLineCount.get(stage.id) ?? 0;
                    const isSelected = selectedStageIds.includes(stage.id);
                    return (
                      <div key={stage.id} className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs transition ${isSelected ? 'border-slate-300 bg-white text-slate-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                        <div className="flex min-w-0 items-center gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isSelected}
                            onClick={() => toggleStageFilter(stage.id, !isSelected)}
                            className={`relative inline-flex h-3 w-5 shrink-0 items-center rounded-full transition ${isSelected ? 'bg-brand-600/80' : 'bg-slate-300'}`}
                          >
                            <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition ${isSelected ? 'translate-x-2.5' : 'translate-x-0.5'}`} />
                          </button>
                          <span className="truncate">{stage.code} - {stage.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`min-w-6 rounded border px-1.5 py-0.5 text-center text-[11px] font-semibold ${count > 0 ? 'border-slate-300 bg-slate-100 text-slate-700' : 'border-slate-200 bg-white text-slate-500'}`}>{count}</span>
                        </div>
                      </div>
                    );
                  })}
                  {hasVisibleNoPhaseLines ? (() => {
                    const count = stageLineCount.get(NO_STAGE_ID) ?? 0;
                    const isSelected = selectedStageIds.includes(NO_STAGE_ID);
                    return (
                      <div className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs transition ${isSelected ? 'border-slate-300 bg-white text-slate-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                        <div className="flex min-w-0 items-center gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isSelected}
                            onClick={() => toggleStageFilter(NO_STAGE_ID, !isSelected)}
                            className={`relative inline-flex h-3 w-5 shrink-0 items-center rounded-full transition ${isSelected ? 'bg-brand-600/80' : 'bg-slate-300'}`}
                          >
                            <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition ${isSelected ? 'translate-x-2.5' : 'translate-x-0.5'}`} />
                          </button>
                          <span className="truncate">Geen fase</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`min-w-6 rounded border px-1.5 py-0.5 text-center text-[11px] font-semibold ${count > 0 ? 'border-slate-300 bg-slate-100 text-slate-700' : 'border-slate-200 bg-white text-slate-500'}`}>{count}</span>
                        </div>
                      </div>
                    );
                  })() : null}
                </div>
              </div>
            )}
          </aside>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-col">
          <section className="mb-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              {showQuotationSelector ? (
                <div className="relative text-sm">
                  <button
                    type="button"
                    className={`quotation-picker-trigger inline-flex w-80 items-center justify-between rounded border px-2.5 py-1.5 text-left text-xs font-medium transition ${isQuotationDropdownOpen ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                    onClick={() => setIsQuotationDropdownOpen((prev) => !prev)}
                    aria-expanded={isQuotationDropdownOpen}
                    aria-label="Voorcalculaties selecteren"
                  >
                    <span className="flex items-center gap-2">
                      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-slate-200 px-1 text-[10px] font-semibold text-slate-700">
                        {selectedQuotationIds.length}
                      </span>
                      <span>{selectedQuotationIds.length} van {quotations.length} voorcalculaties</span>
                    </span>
                    <span className={`text-[11px] transition ${isQuotationDropdownOpen ? 'rotate-180' : ''}`}>▼</span>
                  </button>
                  {isQuotationDropdownOpen ? (
                    <div className="quotation-picker-menu absolute z-20 mt-1 max-h-64 w-80 overflow-auto rounded border border-slate-300 bg-white p-2 shadow-lg">
                      {quotations.map((quotation) => {
                        const lockState = quotationLocks[quotation.id];
                        return (
                          <label key={quotation.id} className="quotation-picker-item mb-1 flex items-center gap-2 rounded border border-transparent p-1.5 hover:border-slate-200 hover:bg-slate-50">
                            <input type="checkbox" checked={selectedQuotationIds.includes(quotation.id)} onChange={() => toggleQuotationSelection(quotation.id)} />
                            <span>{quotation.number} - {quotation.name}</span>
                            {lockState?.lock && !lockState.mine ? (
                              <span className="ml-auto rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                                Bezet: {lockState.lock.ownerDisplayName}
                              </span>
                            ) : null}
                            {lockState?.mine ? (
                              <span className="ml-auto rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                Jouw lock
                              </span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                className="rounded border border-brand-300 px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                onClick={() => {
                  setNewQuotationName(`Voorcalculatie ${quotations.length + 1}`);
                  setCreateQuotationError('');
                  setIsCreateQuotationModalOpen(true);
                }}
                disabled={!hasProject || creatingQuotation}
              >
                {creatingQuotation ? 'Aanmaken...' : '+ Nieuwe voorcalculatie'}
              </button>
              <div className="ml-auto flex items-center gap-2 text-sm">
                <button
                  type="button"
                  className="collapse-toggle-btn rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  onClick={toggleAllExpanded}
                  title={allExpanded ? 'Alles inklappen' : 'Alles uitklappen'}
                  aria-label={allExpanded ? 'Alles inklappen' : 'Alles uitklappen'}
                >
                  {allExpanded ? '▾' : '▸'}
                </button>
              </div>
            </div>
          </section>

          <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {saveError ? <p className="mb-3 text-sm text-rose-700">{saveError}</p> : null}
              <div className="space-y-3">
                {visibleQuotations.map((quotation) => (showPhasePanel ? (
                  <section key={quotation.id} className="relative overflow-visible rounded border border-slate-200">
                    <div className="relative flex items-center gap-2 bg-slate-50 px-3 py-2">
                      <button
                        type="button"
                        className="flex flex-1 items-center gap-3 text-left text-sm font-semibold text-slate-700"
                        onClick={() => toggleQuotationExpand(quotation.id)}
                      >
                        <span>{quotation.number} - {quotation.name}</span>
                        <span className={`ml-auto text-[11px] ${expandedQuotationIds.includes(quotation.id) ? 'font-medium text-slate-600' : 'font-bold text-slate-900'}`}>
                          KOSTEN {formatAmount(getQuotationHeaderTotals(quotation.id).cost)} | BEDRAG {formatAmount(getQuotationHeaderTotals(quotation.id).amount)} | MARGE {formatMarginPct(getQuotationHeaderTotals(quotation.id).cost, getQuotationHeaderTotals(quotation.id).amount)}
                        </span>
                        <span>{expandedQuotationIds.includes(quotation.id) ? '▾' : '▸'}</span>
                      </button>
                      {renderLockedQuotationBadge(quotation.id)}
                      <div className="relative">
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-slate-200 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={(event) => {
                            event.stopPropagation();
                            openQuotationMenu(quotation.id);
                          }}
                          aria-label="Voorcalculatie acties"
                          title="Voorcalculatie acties"
                          disabled={Boolean(getLockedQuotationInfo(quotation.id))}
                        >
                          ⋯
                        </button>
                        {openContainerMenu?.type === 'quotation' && openContainerMenu.quotationId === quotation.id ? (
                          <div className="container-action-menu absolute right-0 top-8 z-30 w-64 rounded border border-slate-200 bg-white p-1 shadow-lg">
                            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Acties</div>
                            <ul className="space-y-0.5">
                              <li>
                                <button
                                  type="button"
                                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                                  onClick={() => startCopyQuotation(quotation.id)}
                                >
                                  <span className="mr-2 text-slate-400">•</span>
                                  <span>Kopie maken</span>
                                </button>
                              </li>
                              <li>
                                <button
                                  type="button"
                                  className="flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                                  onClick={() => startRenameQuotation(quotation.id)}
                                >
                                  <span className="mr-2 text-slate-400">•</span>
                                  <span>Naam wijzigen</span>
                                </button>
                              </li>
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {expandedQuotationIds.includes(quotation.id) ? (
                      <div className="relative space-y-3 p-3">
                        <div className={getLockedQuotationInfo(quotation.id) ? 'pointer-events-none opacity-45 select-none' : ''}>
                          {[...stages.filter((stage) => activeStageIds.includes(stage.id)), ...(activeLines.some((line) => line.quotationId === quotation.id && line.stageId === NO_STAGE_ID) ? [noPhaseStage] : [])]
                            .map((stage) => renderStageGroup(quotation.id, quotation.id, stage))}
                        </div>
                        {renderLockedQuotationOverlay(quotation.id)}
                      </div>
                    ) : null}
                  </section>
                ) : renderQuotationGroup(quotation)))}
              </div>
            </div>
            <div className="flex flex-none items-center justify-end gap-3 border-t border-slate-200 bg-white px-3 py-2">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                KOSTEN {formatAmount(overallTotals.cost)} | BEDRAG {formatAmount(overallTotals.amount)} | MARGE {formatMarginPct(overallTotals.cost, overallTotals.amount)}
              </div>
              <button type="button" className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700 disabled:opacity-50" onClick={() => void handleSave()} disabled={!hasDirtyChanges || saving || !hasProject || Boolean(dirtyQuotationWithoutLock)}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
            </div>
          </main>
        </div>

        {showLibraryPanel ? (
          <aside className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm ${isLibraryPanelCollapsed ? 'p-1.5' : 'p-3'}`}>
            <div className={`mb-2 flex ${isLibraryPanelCollapsed ? 'justify-center' : 'justify-start'}`}>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                onClick={() => setIsLibraryPanelCollapsed((prev) => !prev)}
                aria-label={isLibraryPanelCollapsed ? 'Bibliotheek uitklappen' : 'Bibliotheek inklappen'}
                title={isLibraryPanelCollapsed ? 'Uitklappen' : 'Inklappen'}
              >
                {isLibraryPanelCollapsed ? '<' : '>'}
              </button>
            </div>

            {isLibraryPanelCollapsed ? (
              <div className="flex h-[220px] items-center justify-center">
                <span className="text-[10px] font-semibold tracking-[0.25em] text-slate-500 [writing-mode:vertical-rl] [text-orientation:mixed] rotate-180">
                  BIBLIOTHEEK
                </span>
              </div>
            ) : (
              <div className="min-h-0 overflow-y-auto pr-1">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  BIB - {libraryProject?.name ?? 'Bibliotheek'}
                </div>
                <p className="mb-3 text-xs text-slate-600">
                  Sleep een bibliotheek-voorcalculatie naar een onderdeel om alle regels toe te voegen.
                </p>
                <div className="space-y-2">
                  {libraryQuotations.map((quotation) => {
                    const count = libraryLineCountByQuotation.get(quotation.id) ?? 0;
                    return (
                      <div
                        key={quotation.id}
                        draggable
                        className={`cursor-grab rounded border px-2 py-2 text-sm transition ${draggedLibraryQuotationId === quotation.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50/50'}`}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'copy';
                          setDraggedLibraryQuotationId(quotation.id);
                        }}
                        onDragEnd={() => {
                          setDraggedLibraryQuotationId(null);
                          setLibraryDropTarget(null);
                        }}
                        title="Sleep naar een onderdeel"
                      >
                        <div className="font-medium text-slate-800">{quotation.number}</div>
                        <div className="text-xs text-slate-600">{quotation.name}</div>
                        <div className="mt-1 text-[11px] font-semibold text-brand-700">{count} regels</div>
                      </div>
                    );
                  })}
                  {!libraryQuotations.length ? (
                    <div className="rounded border border-dashed border-slate-300 px-2 py-3 text-xs text-slate-500">
                      Geen bibliotheekvoorcalculaties gevonden (project BIB).
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </aside>
        ) : null}
      </div>

      {isCreateStageModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-base font-semibold text-slate-800">Nieuwe fase aanmaken</h3>
            <div className="mt-3 grid gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Fasecode</span>
                <input className="w-full rounded border border-slate-300 px-2 py-1" value={newStageCode} onChange={(e) => setNewStageCode(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Fasenaam</span>
                <input className="w-full rounded border border-slate-300 px-2 py-1" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Doorbelasting nacalculatie</span>
                <select
                  className="w-full rounded border border-slate-300 px-2 py-1"
                  value={newStageChargeMode}
                  onChange={(e) => setNewStageChargeMode(e.target.value as StageChargeMode)}
                >
                  {STAGE_CHARGE_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value} - {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100" onClick={() => { setIsCreateStageModalOpen(false); setNewStageChargeMode('0'); }} disabled={creatingStage}>Annuleren</button>
              <button className="rounded bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50" onClick={() => void handleCreateStage()} disabled={creatingStage || !newStageCode.trim() || !newStageName.trim()}>{creatingStage ? 'Aanmaken...' : 'Aanmaken'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateQuotationModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-base font-semibold text-slate-800">Nieuwe voorcalculatie aanmaken</h3>
            <div className="mt-3 grid gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Naam</span>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1"
                  value={newQuotationName}
                  onChange={(e) => setNewQuotationName(e.target.value)}
                />
              </label>
              {createQuotationError ? <p className="text-sm text-rose-700">{createQuotationError}</p> : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
                onClick={() => {
                  setIsCreateQuotationModalOpen(false);
                  setNewQuotationName('');
                  setCreateQuotationError('');
                }}
                disabled={creatingQuotation}
              >
                Annuleren
              </button>
              <button
                className="rounded bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                onClick={() => void handleCreateQuotation()}
                disabled={creatingQuotation || !newQuotationName.trim()}
              >
                {creatingQuotation ? 'Aanmaken...' : 'Aanmaken'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {copyActionModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-base font-semibold text-slate-800">
              {copyActionModal.type === 'quotation' ? 'Voorcalculatie kopieren' : 'Fase kopieren'}
            </h3>
            <div className="mt-3 grid gap-3">
              {copyActionModal.type === 'quotation' ? (
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Nieuwe naam</span>
                  <input
                    className="w-full rounded border border-slate-300 px-2 py-1"
                    value={copyActionModal.name}
                    onChange={(event) =>
                      setCopyActionModal((prev) =>
                        prev && prev.type === 'quotation'
                          ? { ...prev, name: event.target.value, error: '' }
                          : prev,
                      )
                    }
                  />
                </label>
              ) : (
                <>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Nieuwe fasecode</span>
                    <input
                      className="w-full rounded border border-slate-300 px-2 py-1"
                      value={copyActionModal.code}
                      onChange={(event) =>
                        setCopyActionModal((prev) =>
                          prev && prev.type === 'stage'
                            ? { ...prev, code: event.target.value, error: '' }
                            : prev,
                        )
                      }
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Nieuwe fasenaam</span>
                    <input
                      className="w-full rounded border border-slate-300 px-2 py-1"
                      value={copyActionModal.name}
                      onChange={(event) =>
                        setCopyActionModal((prev) =>
                          prev && prev.type === 'stage'
                            ? { ...prev, name: event.target.value, error: '' }
                            : prev,
                        )
                      }
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Doorbelasting nacalculatie</span>
                    <select
                      className="w-full rounded border border-slate-300 px-2 py-1"
                      value={copyActionModal.chargeMode}
                      onChange={(event) =>
                        setCopyActionModal((prev) =>
                          prev && prev.type === 'stage'
                            ? { ...prev, chargeMode: event.target.value as StageChargeMode, error: '' }
                            : prev,
                        )
                      }
                    >
                      {STAGE_CHARGE_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.value} - {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {copyActionModal.error ? <p className="text-sm text-rose-700">{copyActionModal.error}</p> : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
                onClick={() => setCopyActionModal(null)}
                disabled={copyActionBusy}
              >
                Annuleren
              </button>
              <button
                className="rounded bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                onClick={() => void handleConfirmCopyAction()}
                disabled={copyActionBusy}
              >
                {copyActionBusy ? 'Bezig...' : 'Kopieren'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renameActionModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h3 className="text-base font-semibold text-slate-800">
              {renameActionModal.type === 'quotation' ? 'Voorcalculatie naam wijzigen' : 'Fase naam wijzigen'}
            </h3>
            <div className="mt-3 grid gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-slate-700">Naam</span>
                <input
                  className="w-full rounded border border-slate-300 px-2 py-1"
                  value={renameActionModal.name}
                  onChange={(event) =>
                    setRenameActionModal((prev) =>
                      prev ? { ...prev, name: event.target.value, error: '' } : prev,
                    )
                  }
                />
              </label>
              {renameActionModal.type === 'stage' ? (
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-slate-700">Doorbelasting nacalculatie</span>
                  <select
                    className="w-full rounded border border-slate-300 px-2 py-1"
                    value={renameActionModal.chargeMode}
                    onChange={(event) =>
                      setRenameActionModal((prev) =>
                        prev && prev.type === 'stage'
                          ? { ...prev, chargeMode: event.target.value as StageChargeMode, error: '' }
                          : prev,
                      )
                    }
                  >
                    {STAGE_CHARGE_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.value} - {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {renameActionModal.error ? <p className="text-sm text-rose-700">{renameActionModal.error}</p> : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
                onClick={() => setRenameActionModal(null)}
                disabled={renameActionBusy}
              >
                Annuleren
              </button>
              <button
                className="rounded bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                onClick={() => void handleConfirmRenameAction()}
                disabled={renameActionBusy}
              >
                {renameActionBusy ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
        ) : null}

      </div>
    );
  }

function serializeQtyFormulaMemo(formula: QtyFormula): string {
  const normalizedRows =
    formula.mode === 'm1' || formula.mode === 'm2'
      ? (formula.rows ?? []).map((row) => ({
          id: row.id || crypto.randomUUID(),
          length: toNonNegative(Number(row.length) || 0),
          width: formula.mode === 'm2' ? toNonNegative(Number(row.width) || 0) : 0,
        }))
      : undefined;
  return JSON.stringify({
    version: 1,
    mode: formula.mode,
    length: toNonNegative(Number(formula.length) || 0),
    width: toNonNegative(Number(formula.width) || 0),
    height: formula.mode === 'm3' ? toNonNegative(Number(formula.height) || 0) : undefined,
    rows: normalizedRows,
  });
}

function parseQtyFormulaMemo(memo?: string): QtyFormula | undefined {
  if (!memo) return undefined;
  try {
    const parsed = JSON.parse(memo) as Record<string, unknown>;
    const mode = parsed.mode === 'm1' || parsed.mode === 'm2' || parsed.mode === 'm3' ? parsed.mode : undefined;
    if (!mode) return undefined;
    const parsedRows = Array.isArray(parsed.rows)
      ? parsed.rows
          .map((row) => {
            if (!row || typeof row !== 'object') return null;
            const candidate = row as Record<string, unknown>;
            return {
              id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : crypto.randomUUID(),
              length: toNonNegative(Number(candidate.length) || 0),
              width: mode === 'm2' ? toNonNegative(Number(candidate.width) || 0) : 0,
            };
          })
          .filter((row): row is { id: string; length: number; width: number } => Boolean(row))
      : [];
    return {
      mode,
      length: toNonNegative(Number(parsed.length) || 0),
      width: mode === 'm1' ? 0 : toNonNegative(Number(parsed.width) || 0),
      height: mode === 'm3' ? toNonNegative(Number(parsed.height) || 0) : undefined,
      rows: mode === 'm1' || mode === 'm2' ? parsedRows : undefined,
    };
  } catch {
    return undefined;
  }
}





















































