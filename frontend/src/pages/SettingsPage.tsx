import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { fetchAfasConnectionConfig, fetchAfasWriteAuthStatus, fetchIframeSessionProfile, fetchItems, fetchQuotationLineFieldMappings, fetchSettings, getAfasOAuthStartUrl, logoutAfasOAuthSession, saveAfasConnectionConfig, saveSettings } from '../api/client';
import { AfasConnectionConfig, AfasConnectionInput, AfasWriteAuthStatus, IframeSessionProfile, Item, MarkupType, QuotationLineFieldMapping, Settings, UiThemeMode } from '../types';
import { ALL_MARKUPS, getMarkupBasis, getMarkupValueType, getMarkupValueTypeSuffix, getOrderedMarkupTypes, getUniversalMarkupName, MARKUP_LABELS, sanitizeSettings } from '../utils/markups';
import { applyColumnOrder, getLineMarkupColumnKey, isColumnVisible, STATIC_COLUMN_KEYS } from '../utils/tableColumns';
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
  markupOrder: [...ALL_MARKUPS],
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

const DEFAULT_QUOTATION_LINE_AFAS_IDS: Record<string, string> = {
  'QL-PURCHASE_ENABLED': 'UC61B5DF54390117579CF9AA289E985F0',
  'QL-SUPPLIER_ID': 'U69BD7B0B402F2007FEC9E485BB4B59C9',
  'QL-ORDER': 'UE18C19A4B1AC406FBC49C7F9D519B1D1',
  'QL-QTY_BASE': 'U6C0B0BC992D94EB888CA826DC1CE1426',
  'QL-UNIT_COST_BASE': 'U0EEBF798211342FFB2B5C74EFBA22D2A',
  'QL-UNIT_PRICE_BASE': 'UFFA1E73D0A4D4C9E9D119A22418AD32B',
  'QL-PURCHASE_PRICE': 'U66FC679C66C84BD4AA8D3EE20356DA63',
  'QL-QTY_FORMULA_MEMO': 'U00108B80E94D4363B595D4C2AEF55513',
  'QL-COST_FORMULA_MEMO': 'U8DB55FAE37624EFD9F3875A345A641B5',
  'QL-MARKUP_FORMULA_MEMO': 'UD62451864A61411DB69C2C03F440BD3E',
};

const DEFAULT_AFAS_CONNECTION: AfasConnectionConfig = {
  mode: 'afas',
  environmentId: '',
  environmentType: 'production',
  hasToken: false,
  tokenPreview: '',
};

const DEFAULT_AFAS_FORM: AfasConnectionInput = {
  mode: 'afas',
  environmentId: '',
  environmentType: 'production',
  token: '',
};
const DEFAULT_WRITE_AUTH_STATUS: AfasWriteAuthStatus = {
  mode: 'classic',
  oauthConfigured: false,
  authenticated: false,
  message: '',
};
const IFRAME_SESSION_STORAGE_KEY = 'solvaters_basis_iframe_session_id';

function navLinkClassName(isActive: boolean) {
  return `rounded px-3 py-2 text-xs font-medium ${isActive ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`;
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

function scopeLabel(scope: 'line' | 'phase', type: MarkupType) {
  return getUniversalMarkupName(type, scope);
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [afasConnection, setAfasConnection] = useState<AfasConnectionConfig>(DEFAULT_AFAS_CONNECTION);
  const [afasForm, setAfasForm] = useState<AfasConnectionInput>(DEFAULT_AFAS_FORM);
  const [saving, setSaving] = useState(false);
  const [savingAfas, setSavingAfas] = useState(false);
  const [afasStatus, setAfasStatus] = useState('');
  const [writeAuthStatus, setWriteAuthStatus] = useState<AfasWriteAuthStatus>(DEFAULT_WRITE_AUTH_STATUS);
  const [writeAuthBusy, setWriteAuthBusy] = useState(false);
  const [iframeSessionProfile, setIframeSessionProfile] = useState<IframeSessionProfile | null>(null);
  const [iframeSessionId, setIframeSessionId] = useState('');
  const [iframeSessionStatus, setIframeSessionStatus] = useState('');
  const [openLineMarkupType, setOpenLineMarkupType] = useState<MarkupType | null>(null);
  const [openPhaseMarkupType, setOpenPhaseMarkupType] = useState<MarkupType | null>(null);
  const [lineMarkupAfasIdWarningType, setLineMarkupAfasIdWarningType] = useState<MarkupType | null>(null);
  const [phaseMarkupItems, setPhaseMarkupItems] = useState<Partial<Record<MarkupType, Item[]>>>({});
  const [isAfasConnectionSectionOpen, setIsAfasConnectionSectionOpen] = useState(false);
  const [isColumnOrderSectionOpen, setIsColumnOrderSectionOpen] = useState(false);
  const [isPhaseMarkupSectionOpen, setIsPhaseMarkupSectionOpen] = useState(false);
  const [quotationLineFieldMappings, setQuotationLineFieldMappings] = useState<QuotationLineFieldMapping[]>([]);
  const [quotationLineFieldMappingsOpen, setQuotationLineFieldMappingsOpen] = useState(false);
  const [unlockedMappingFieldIds, setUnlockedMappingFieldIds] = useState<Record<string, boolean>>({});
  const [isColorSettingsSectionOpen, setIsColorSettingsSectionOpen] = useState(false);
  const orderedMarkups = useMemo(() => getOrderedMarkupTypes(settings), [settings]);
  const allOrderableColumnKeys = useMemo(
    () => [...STATIC_COLUMN_KEYS, ...orderedMarkups.map((type) => getLineMarkupColumnKey(settings, type))],
    [orderedMarkups, settings],
  );
  const orderedColumnKeys = useMemo(
    () => applyColumnOrder(allOrderableColumnKeys, Array.isArray(settings.columnOrder) ? settings.columnOrder : []),
    [allOrderableColumnKeys, settings.columnOrder],
  );
  const hasUnsavedSettingsChanges = useMemo(
    () => JSON.stringify(sanitizeSettings(settings)) !== JSON.stringify(sanitizeSettings(savedSettings)),
    [savedSettings, settings],
  );

  useEffect(() => {
    void fetchSettings().then((loaded) => {
      setSettings(loaded);
      setSavedSettings(loaded);
    });
    void fetchQuotationLineFieldMappings().then(setQuotationLineFieldMappings).catch(() => setQuotationLineFieldMappings([]));
    void fetchAfasWriteAuthStatus().then(setWriteAuthStatus).catch(() => setWriteAuthStatus(DEFAULT_WRITE_AUTH_STATUS));
    void fetchAfasConnectionConfig().then((loaded) => {
      setAfasConnection(loaded);
      setAfasForm({
        mode: loaded.mode,
        environmentId: loaded.environmentId,
        environmentType: loaded.environmentType,
        token: '',
      });
      setSettings((prev) => ({ ...prev, dataMode: 'afas' }));
    });
  }, []);

  useEffect(() => {
    const querySessionId = new URLSearchParams(window.location.search).get('sessionid')?.trim() ?? '';
    const storedSessionId = localStorage.getItem(IFRAME_SESSION_STORAGE_KEY)?.trim() ?? '';
    const sessionId = querySessionId || storedSessionId;
    setIframeSessionId(sessionId);
    if (querySessionId) localStorage.setItem(IFRAME_SESSION_STORAGE_KEY, querySessionId);
    if (!sessionId) {
      setIframeSessionProfile(null);
      setIframeSessionStatus('Geen actieve iFrame-sessie gevonden.');
      return;
    }
    void fetchIframeSessionProfile(sessionId)
      .then((result) => {
        setIframeSessionProfile(result.session);
        setIframeSessionStatus('');
      })
      .catch((error) => {
        setIframeSessionProfile(null);
        setIframeSessionStatus((error as Error).message);
      });
  }, []);

  useEffect(() => {
    applyThemeColors(settings);
  }, [settings]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const payload = event.data as { type?: string; ok?: boolean; message?: string } | null;
      if (!payload || payload.type !== 'afas-oauth-complete') return;
      setWriteAuthBusy(false);
      setAfasStatus(payload.message ?? '');
      void refreshWriteAuthStatus();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  async function refreshWriteAuthStatus() {
    try {
      setWriteAuthStatus(await fetchAfasWriteAuthStatus());
    } catch (error) {
      setWriteAuthStatus({
        ...DEFAULT_WRITE_AUTH_STATUS,
        mode: settings.writeAuthMode,
        message: (error as Error).message,
      });
    }
  }

  async function onSave() {
    setSaving(true);
    try {
      const saved = await saveSettings(sanitizeSettings(settings));
      setSettings(saved);
      setSavedSettings(saved);
      await refreshWriteAuthStatus();
      const mappings = await fetchQuotationLineFieldMappings();
      setQuotationLineFieldMappings(mappings);
    } finally {
      setSaving(false);
    }
  }

  async function onSaveAfas() {
    setSavingAfas(true);
    setAfasStatus('');
    try {
      const saved = await saveAfasConnectionConfig({
        mode: 'afas',
        environmentId: afasForm.environmentId ?? '',
        environmentType: afasForm.environmentType ?? 'production',
        token: afasForm.token?.trim() || undefined,
      });
      setAfasConnection(saved);
      setAfasForm((prev) => ({ ...prev, mode: 'afas', environmentId: saved.environmentId, environmentType: saved.environmentType, token: '' }));
      setSettings((prev) => ({ ...prev, dataMode: 'afas' }));
      await refreshWriteAuthStatus();
      setAfasStatus(saved.hasToken ? `AFAS-instellingen opgeslagen. Token actief: ${saved.tokenPreview}` : 'AFAS-instellingen opgeslagen zonder token.');
    } catch (error) {
      setAfasStatus((error as Error).message);
    } finally {
      setSavingAfas(false);
    }
  }

  async function onStartOauthLogin() {
    setWriteAuthBusy(true);
    setAfasStatus('');
    try {
      const popupUrl = await getAfasOAuthStartUrl();
      const popup = window.open(popupUrl, 'afas-oauth-login', 'popup=yes,width=720,height=820');
      if (!popup) throw new Error('Popup geblokkeerd. Sta popups toe voor AFAS-login.');
      popup.focus();
    } catch (error) {
      setAfasStatus((error as Error).message);
      setWriteAuthBusy(false);
      return;
    }
    window.setTimeout(() => setWriteAuthBusy(false), 500);
  }

  async function onLogoutOauth() {
    setWriteAuthBusy(true);
    setAfasStatus('');
    try {
      await logoutAfasOAuthSession();
      await refreshWriteAuthStatus();
      setAfasStatus('AFAS OAuth-sessie verwijderd voor deze browser.');
    } catch (error) {
      setAfasStatus((error as Error).message);
    } finally {
      setWriteAuthBusy(false);
    }
  }

  function moveMarkup(type: MarkupType, direction: -1 | 1) {
    setSettings((prev) => {
      const order = getOrderedMarkupTypes(prev);
      const index = order.indexOf(type);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= order.length) return prev;
      const next = [...order];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, markupOrder: next };
    });
  }

  function moveColumn(key: string, direction: -1 | 1) {
    setSettings((prev) => {
      const current = applyColumnOrder([...STATIC_COLUMN_KEYS, ...getOrderedMarkupTypes(prev).map((type) => getLineMarkupColumnKey(prev, type))], Array.isArray(prev.columnOrder) ? prev.columnOrder : []);
      const index = current.indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return prev;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, columnOrder: next };
    });
  }

  function getCode(scope: 'line' | 'phase', type: MarkupType) {
    const value = scope === 'line' ? settings.lineMarkupItemCodes[type] : settings.phaseMarkupItemCodes[type];
    return value?.trim() || MARKUP_LABELS[type];
  }

  function getDescription(scope: 'line' | 'phase', type: MarkupType) {
    const value = scope === 'line' ? settings.lineMarkupDescriptions[type] : settings.phaseMarkupDescriptions[type];
    return value?.trim() || scopeLabel(scope, type);
  }

  function getAfasId(scope: 'line' | 'phase', type: MarkupType) {
    return (scope === 'line' ? settings.lineMarkupAfasIds[type] : settings.phaseMarkupAfasIds[type]) ?? '';
  }

  function hasAfasId(scope: 'line' | 'phase', type: MarkupType) {
    return getAfasId(scope, type).trim().length > 0;
  }

  function getPreferenceValue(scope: 'line' | 'phase', type: MarkupType) {
    const value = scope === 'line' ? settings.lineMarkupPreferenceValues[type] : settings.phaseMarkupPreferenceValues[type];
    return value ?? 0;
  }

  async function loadPhaseMarkupItems(type: MarkupType, query: string) {
    try {
      const items = await fetchItems(query.trim());
      setPhaseMarkupItems((prev) => ({ ...prev, [type]: items }));
    } catch {
      setPhaseMarkupItems((prev) => ({ ...prev, [type]: [] }));
    }
  }

  function setMarkupField(scope: 'line' | 'phase', type: MarkupType, field: 'code' | 'description' | 'afasId' | 'preference', value: string) {
    if (scope === 'line' && field === 'afasId' && lineMarkupAfasIdWarningType === type && value.trim()) {
      setLineMarkupAfasIdWarningType(null);
    }
    setSettings((prev) => {
      if (scope === 'line') {
        if (field === 'code') return { ...prev, lineMarkupItemCodes: { ...prev.lineMarkupItemCodes, [type]: value } };
        if (field === 'description') return { ...prev, lineMarkupDescriptions: { ...prev.lineMarkupDescriptions, [type]: value } };
        if (field === 'afasId') return { ...prev, lineMarkupAfasIds: { ...prev.lineMarkupAfasIds, [type]: value } };
        return { ...prev, lineMarkupPreferenceValues: { ...prev.lineMarkupPreferenceValues, [type]: Number(value) || 0 } };
      }
      if (field === 'code') return { ...prev, phaseMarkupItemCodes: { ...prev.phaseMarkupItemCodes, [type]: value } };
      if (field === 'description') return { ...prev, phaseMarkupDescriptions: { ...prev.phaseMarkupDescriptions, [type]: value } };
      if (field === 'afasId') return { ...prev, phaseMarkupAfasIds: { ...prev.phaseMarkupAfasIds, [type]: value } };
      return { ...prev, phaseMarkupPreferenceValues: { ...prev.phaseMarkupPreferenceValues, [type]: Number(value) || 0 } };
    });
  }

  function toggleColumnVisibility(key: string, checked: boolean) {
    setSettings((prev) => ({
      ...prev,
      columnVisibility: { ...prev.columnVisibility, [key]: checked },
      supplierColumnEnabled: key === 'supplier' ? checked : prev.supplierColumnEnabled,
      purchasePriceColumnEnabled: key === 'purchasePrice' ? checked : prev.purchasePriceColumnEnabled,
    }));
  }

  function toggleMarkupVisibility(scope: 'line' | 'phase', type: MarkupType, checked: boolean) {
    if (scope === 'line' && checked && !hasAfasId(scope, type)) {
      setOpenLineMarkupType(type);
      setLineMarkupAfasIdWarningType(type);
      return;
    }
    if (scope === 'line' && !checked && lineMarkupAfasIdWarningType === type) {
      setLineMarkupAfasIdWarningType(null);
    }
    setSettings((prev) => {
      if (scope === 'line') return { ...prev, lineMarkups: { ...prev.lineMarkups, [type]: checked }, lineMarkupCount: Object.values({ ...prev.lineMarkups, [type]: checked }).filter(Boolean).length };
      return { ...prev, phaseMarkups: { ...prev.phaseMarkups, [type]: checked }, phaseMarkupCount: Object.values({ ...prev.phaseMarkups, [type]: checked }).filter(Boolean).length };
    });
  }

  function getMarkupTypeFromColumnKey(key: string): MarkupType | null {
    if (key.startsWith('qty-')) return key.replace('qty-', '') as MarkupType;
    if (key.startsWith('cost-')) return key.replace('cost-', '') as MarkupType;
    if (key.startsWith('priceMarkup-')) return key.replace('priceMarkup-', '') as MarkupType;
    return null;
  }

  function columnLabel(key: string): string {
    if (key === 'item') return 'Item';
    if (key === 'description') return 'Omschrijving';
    if (key === 'purchaseEnabled') return 'Inkopen';
    if (key === 'supplier') return 'Inkooprelatie';
    if (key === 'unit') return 'Eenheid';
    if (key === 'baseQty') return 'Basis aantal';
    if (key === 'computedQty') return 'Aantal';
    if (key === 'unitCost') return 'Kostprijs';
    if (key === 'purchasePrice') return 'Inkoopprijs';
    if (key === 'computedUnitCost') return 'Bedrag na';
    if (key === 'costTotal') return 'Kosten';
    if (key === 'unitPrice') return 'Prijs';
    if (key === 'priceTotal') return 'Bedrag';
    if (key === 'actions') return 'Acties';
    if (key.startsWith('qty-')) {
      const type = key.replace('qty-', '') as MarkupType;
      return `${getDescription('line', type)} (${getCode('line', type)} ${getMarkupValueTypeSuffix(getMarkupValueType(settings, 'line', type))})`;
    }
    if (key.startsWith('cost-')) {
      const type = key.replace('cost-', '') as MarkupType;
      return `${getDescription('line', type)} (${getCode('line', type)} ${getMarkupValueTypeSuffix(getMarkupValueType(settings, 'line', type))})`;
    }
    if (key.startsWith('priceMarkup-')) {
      const type = key.replace('priceMarkup-', '') as MarkupType;
      return `${getDescription('line', type)} (${getCode('line', type)} ${getMarkupValueTypeSuffix(getMarkupValueType(settings, 'line', type))})`;
    }
    return key;
  }

  function renderMarkupSettings(scope: 'line' | 'phase', type: MarkupType, isOpen: boolean) {
    if (!isOpen) return null;
    return (
      <div className="mt-2 grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 md:grid-cols-2">
        {scope === 'line' && lineMarkupAfasIdWarningType === type ? (
          <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 md:col-span-2">
            Vul eerst een `AFAS ID` in voordat je deze vrije opslagkolom zichtbaar maakt.
          </div>
        ) : null}
        <label className="grid gap-1 text-xs">
          <span>Basis</span>
          <select
            className="rounded border border-slate-300 px-2 py-1"
            value={getMarkupBasis(settings, scope, type)}
            onChange={(e) =>
              setSettings((prev) => scope === 'line'
                ? { ...prev, lineMarkupBases: { ...prev.lineMarkupBases, [type]: e.target.value as 'quantity' | 'cost' | 'price' } }
                : { ...prev, phaseMarkupBases: { ...prev.phaseMarkupBases, [type]: e.target.value as 'quantity' | 'cost' | 'price' } })
            }
          >
            {scope === 'line' ? <option value="quantity">Aantal</option> : null}
            <option value="cost">Kostprijs</option>
            <option value="price">Prijs</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span>Invoer</span>
          <select
            className="rounded border border-slate-300 px-2 py-1"
            value={getMarkupValueType(settings, scope, type)}
            onChange={(e) =>
              setSettings((prev) => scope === 'line'
                ? { ...prev, lineMarkupValueTypes: { ...prev.lineMarkupValueTypes, [type]: e.target.value as 'percentage' | 'quantity' | 'amount' } }
                : { ...prev, phaseMarkupValueTypes: { ...prev.phaseMarkupValueTypes, [type]: e.target.value as 'percentage' | 'quantity' | 'amount' } })
            }
          >
            <option value="percentage">%</option>
            {getMarkupBasis(settings, scope, type) === 'quantity' ? <option value="quantity">Aantal</option> : null}
            {getMarkupBasis(settings, scope, type) !== 'quantity' ? <option value="amount">Bedrag</option> : null}
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span>Code</span>
          <input
            list={scope === 'phase' ? `phase-markup-items-${type}` : undefined}
            className="rounded border border-slate-300 px-2 py-1"
            value={getCode(scope, type)}
            onFocus={() => {
              if (scope === 'phase') void loadPhaseMarkupItems(type, getCode(scope, type));
            }}
            onChange={(e) => {
              setMarkupField(scope, type, 'code', e.target.value);
              if (scope === 'phase') void loadPhaseMarkupItems(type, e.target.value);
            }}
          />
          {scope === 'phase' ? (
            <datalist id={`phase-markup-items-${type}`}>
              {(phaseMarkupItems[type] ?? []).map((item) => (
                <option key={`${type}-${item.code}`} value={item.code}>
                  {item.description}
                </option>
              ))}
            </datalist>
          ) : null}
        </label>
        <label className="grid gap-1 text-xs">
          <span>Omschrijving</span>
          <input className="rounded border border-slate-300 px-2 py-1" value={getDescription(scope, type)} onChange={(e) => setMarkupField(scope, type, 'description', e.target.value)} />
        </label>
        {scope === 'line' ? (
          <label className="grid gap-1 text-xs">
            <span>AFAS ID</span>
            <input className="rounded border border-slate-300 px-2 py-1" value={getAfasId(scope, type)} onChange={(e) => setMarkupField(scope, type, 'afasId', e.target.value)} />
          </label>
        ) : null}
        <label className="grid gap-1 text-xs">
          <span>Voorkeurwaarde</span>
          <input type="number" step="0.01" className="rounded border border-slate-300 px-2 py-1" value={getPreferenceValue(scope, type)} onChange={(e) => setMarkupField(scope, type, 'preference', e.target.value)} />
        </label>
      </div>
    );
  }

  function afasModeBadgeClass(mode: QuotationLineFieldMapping['afasMode']) {
    if (mode === 'direct' || mode === 'header' || mode === 'configurable') {
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    }
    if (mode === 'unknown') {
      return 'bg-amber-100 text-amber-800 border-amber-200';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }

  function getResolvedFieldAfasId(field: QuotationLineFieldMapping) {
    if (field.appFieldId.startsWith('QL-MARKUP-')) {
      const type = field.appFieldId.replace('QL-MARKUP-', '') as MarkupType;
      return settings.lineMarkupAfasIds?.[type]?.trim() ?? '';
    }
    if (isEditableMappingField(field)) {
      return settings.quotationLineConfigurableAfasIds?.[field.appFieldId]?.trim() ?? '';
    }
    return field.afasFieldId?.trim() ?? '';
  }

  function getFieldDisplayState(field: QuotationLineFieldMapping): 'mapped' | 'via_field' | 'open' | 'app_only' {
    if (field.afasMode === 'configurable') {
      return getResolvedFieldAfasId(field) ? 'mapped' : 'via_field';
    }
    if (field.afasMode === 'direct' || field.afasMode === 'header') return 'mapped';
    if (field.afasMode === 'unknown') return 'open';
    return 'app_only';
  }

  function afasDisplayBadgeClass(field: QuotationLineFieldMapping) {
    const state = getFieldDisplayState(field);
    if (state === 'mapped') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (state === 'via_field' && isRequiredConfigurableField(field)) return 'bg-rose-100 text-rose-700 border-rose-200';
    if (state === 'via_field') return 'bg-sky-100 text-sky-700 border-sky-200';
    if (state === 'open') return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  }

  function afasModeLabel(mode: QuotationLineFieldMapping['afasMode']) {
    if (mode === 'direct') return 'Definitief';
    if (mode === 'header') return 'Via header';
    if (mode === 'configurable') return 'Via veld';
    if (mode === 'unknown') return 'Nog open';
    return 'Alleen app';
  }

  function isFieldMapped(field: QuotationLineFieldMapping) {
    return getFieldDisplayState(field) === 'mapped';
  }

  function isEditableMappingField(field: QuotationLineFieldMapping) {
    return [
      'QL-SUPPLIER_ID',
      'QL-ORDER',
      'QL-QTY_BASE',
      'QL-QTY_FORMULA_MEMO',
      'QL-COST_FORMULA_MEMO',
      'QL-MARKUP_FORMULA_MEMO',
      'QL-UNIT_COST_BASE',
      'QL-PURCHASE_PRICE',
      'QL-UNIT_PRICE_BASE',
      'QL-PURCHASE_ENABLED',
    ].includes(field.appFieldId);
  }

  function isOptionalViaField(field: QuotationLineFieldMapping) {
    return field.appFieldId.startsWith('QL-MARKUP-');
  }

  function isRequiredConfigurableField(field: QuotationLineFieldMapping) {
    return isEditableMappingField(field);
  }

  function isMappingFieldUnlocked(field: QuotationLineFieldMapping) {
    return Boolean(unlockedMappingFieldIds[field.appFieldId]);
  }

  function getEditableAfasFieldValue(field: QuotationLineFieldMapping) {
    if (isEditableMappingField(field)) return settings.quotationLineConfigurableAfasIds?.[field.appFieldId] ?? '';
    return getResolvedFieldAfasId(field);
  }

  function setEditableAfasFieldValue(field: QuotationLineFieldMapping, value: string) {
    setSettings((prev) => ({
      ...prev,
      quotationLineConfigurableAfasIds: {
        ...(prev.quotationLineConfigurableAfasIds ?? {}),
        [field.appFieldId]: value,
      },
    }));
  }

  function getDisplayedAfasPath(field: QuotationLineFieldMapping) {
    const resolvedFieldId = getResolvedFieldAfasId(field);
    if (field.afasMode === 'configurable' && resolvedFieldId) {
      return `KnQuotationLine.Fields.${resolvedFieldId}`;
    }
    return field.afasPath ?? '-';
  }

  function applyDefaultQuotationLineAfasIds() {
    setSettings((prev) => ({
      ...prev,
      quotationLineConfigurableAfasIds: {
        ...(prev.quotationLineConfigurableAfasIds ?? {}),
        ...DEFAULT_QUOTATION_LINE_AFAS_IDS,
      },
    }));
  }

  function setThemeMode(mode: UiThemeMode) {
    setSettings((prev) => ({ ...prev, uiThemeMode: mode }));
  }

  function setCustomColor(key: keyof Settings['uiColors'], value: string) {
    setSettings((prev) => ({
      ...prev,
      uiColors: {
        ...prev.uiColors,
        [key]: value,
      },
    }));
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-6xl rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">App instellingen</h1>
          <nav className="flex items-center gap-2">
            <NavLink to="/" end className={({ isActive }) => navLinkClassName(isActive)}>Voorcalculatie</NavLink>
            <NavLink to="/bestellen" className={({ isActive }) => navLinkClassName(isActive)}>Bestellen</NavLink>
            <button type="button" className="rounded bg-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-300" onClick={() => void toggleFullscreen()} title="Fullscreen" aria-label="Fullscreen">⛶</button>
            <NavLink to="/settings" className={({ isActive }) => navLinkClassName(isActive)} title="Instellingen" aria-label="Instellingen">⚙</NavLink>
          </nav>
        </div>

        <section className="afas-mapping-section mb-5 rounded border border-slate-200 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setIsAfasConnectionSectionOpen((prev) => !prev)}
          >
            <div>
              <h2 className="text-sm font-semibold">AFAS verbinding</h2>
              <p className="text-sm text-slate-600">Classic token blijft backend-only. De frontend ziet alleen of er een token is opgeslagen.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                AFAS actief
              </span>
              <span className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700">
                {isAfasConnectionSectionOpen ? 'Inklappen' : 'Uitklappen'}
              </span>
            </div>
          </button>
          {isAfasConnectionSectionOpen ? (
            <>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Omgevings-ID</span>
                  <input className="h-10 rounded border border-slate-300 px-2 py-2" value={afasForm.environmentId ?? ''} onChange={(e) => setAfasForm((prev) => ({ ...prev, environmentId: e.target.value }))} />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Omgevingstype</span>
                  <select className="rounded border border-slate-300 px-2 py-2" value={afasForm.environmentType ?? 'production'} onChange={(e) => setAfasForm((prev) => ({ ...prev, environmentType: e.target.value as AfasConnectionConfig['environmentType'] }))}>
                    <option value="production">Productie (live)</option>
                    <option value="test">Test</option>
                    <option value="accept">Accept</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Classic token</span>
                  <textarea className="h-10 resize-none rounded border border-slate-300 px-2 py-2 font-mono text-xs leading-5" value={afasForm.token ?? ''} onChange={(e) => setAfasForm((prev) => ({ ...prev, token: e.target.value }))} />
                </label>
                <div className="grid gap-1 text-sm">
                  <span className="font-medium">Huidige tokenstatus</span>
                  <div className="flex h-10 items-center rounded border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                    {afasConnection.hasToken ? `Token opgeslagen (${afasConnection.tokenPreview})` : 'Nog geen token opgeslagen'}
                  </div>
                </div>
              </div>
              {afasStatus ? <p className={`mt-3 text-sm ${afasStatus.includes('opgeslagen') ? 'text-emerald-700' : 'text-rose-700'}`}>{afasStatus}</p> : null}
              <div className="mt-3">
                <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-3">
                  <h3 className="text-sm font-semibold text-slate-800">AFAS authenticatie</h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Deze instelling bepaalt app-breed of AFAS-calls via classic token of via OAuth namens de gebruiker lopen, voor zowel ophalen als terugschrijven.
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,18rem)_1fr]">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Schrijfmethode</span>
                      <select
                        className="rounded border border-slate-300 px-2 py-2"
                        value={settings.writeAuthMode}
                        onChange={(e) => setSettings((prev) => ({ ...prev, writeAuthMode: e.target.value === 'oauth_user' ? 'oauth_user' : 'classic' }))}
                      >
                        <option value="classic">Classic token</option>
                        <option value="oauth_user">OAuth namens gebruiker</option>
                      </select>
                    </label>
                    <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-2 py-1 font-medium ${writeAuthStatus.authenticated ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                          {writeAuthStatus.authenticated ? 'Schrijfsessie actief' : 'Schrijfsessie ontbreekt'}
                        </span>
                        <span className={`rounded px-2 py-1 font-medium ${writeAuthStatus.oauthConfigured ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-700'}`}>
                          {writeAuthStatus.oauthConfigured ? 'OAuth backend klaar' : 'OAuth backend niet ingericht'}
                        </span>
                      </div>
                      <p className="mt-2">{writeAuthStatus.message}</p>
                      {writeAuthStatus.displayName || writeAuthStatus.userId || writeAuthStatus.accessTokenExpiresAt ? (
                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">Gebruiker</div>
                            <div>{writeAuthStatus.displayName || '-'}</div>
                          </div>
                          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">userId</div>
                            <div className="font-mono">{writeAuthStatus.userId || '-'}</div>
                          </div>
                          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">Token geldig tot</div>
                            <div>{writeAuthStatus.accessTokenExpiresAt ? new Date(writeAuthStatus.accessTokenExpiresAt).toLocaleString('nl-NL') : '-'}</div>
                          </div>
                        </div>
                      ) : null}
                      {settings.writeAuthMode === 'oauth_user' ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                            onClick={() => void onStartOauthLogin()}
                            disabled={writeAuthBusy || !writeAuthStatus.oauthConfigured}
                          >
                            {writeAuthBusy ? 'Bezig...' : writeAuthStatus.authenticated ? 'Opnieuw aanmelden via AFAS' : 'Aanmelden via AFAS'}
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            onClick={() => void onLogoutOauth()}
                            disabled={writeAuthBusy || !writeAuthStatus.authenticated}
                          >
                            OAuth-sessie verwijderen
                          </button>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-slate-500">
                          Classic: ophalen en mutaties lopen via de technische connectorgebruiker.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <button className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50" onClick={() => void onSaveAfas()} disabled={savingAfas}>
                  {savingAfas ? 'Opslaan...' : 'Omgeving + token opslaan'}
                </button>
              </div>
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
                <h3 className="text-sm font-semibold text-slate-800">AFAS iFrame context</h3>
                <p className="mt-1 text-xs text-slate-600">iFrame wordt gebruikt voor gebruikerscontext (wie is ingelogd). De gekozen AFAS-methode bepaalt daarna hoe ophalen en schrijven verlopen.</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div className="rounded border border-slate-200 bg-white px-2 py-1.5">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">SessionId</div>
                    <div className="font-mono text-xs text-slate-700">{iframeSessionId || '-'}</div>
                  </div>
                  <div className="rounded border border-slate-200 bg-white px-2 py-1.5">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">userId</div>
                    <div className="font-mono text-xs text-slate-700">{iframeSessionProfile?.userId || '-'}</div>
                  </div>
                  <div className="rounded border border-slate-200 bg-white px-2 py-1.5 md:col-span-2">
                    <div className="text-[11px] uppercase tracking-wide text-slate-500">Naam</div>
                    <div className="text-xs text-slate-700">{iframeSessionProfile?.displayName || iframeSessionProfile?.personCode || iframeSessionProfile?.employeeId || '-'}</div>
                  </div>
                </div>
                {iframeSessionStatus ? <p className="mt-2 text-xs text-amber-700">{iframeSessionStatus}</p> : null}
              </div>
            </>
          ) : null}
        </section>

        <section className="mb-5 rounded border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={settings.usePhases} onChange={(e) => setSettings((prev) => ({ ...prev, usePhases: e.target.checked }))} />
            Werken met fases
          </label>
        </section>

        <section className="mb-5 rounded border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={settings.libraryEnabled} onChange={(e) => setSettings((prev) => ({ ...prev, libraryEnabled: e.target.checked }))} />
            Bibliotheek paneel tonen
          </label>
        </section>

        <section className="mb-5 rounded border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={settings.unitCostCalculatorEnabled} onChange={(e) => setSettings((prev) => ({ ...prev, unitCostCalculatorEnabled: e.target.checked }))} />
            Kostprijs calculator in regels tonen
          </label>
        </section>

        <section className="mb-5 rounded border border-slate-200 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setIsColumnOrderSectionOpen((prev) => !prev)}
          >
            <div>
              <h2 className="text-sm font-semibold">Kolomvolgorde tabel</h2>
              <p className="mt-1 text-sm text-slate-600">Beheer hier de volgorde en zichtbaarheid van alle regelkolommen. Vrije kolommen hebben extra instellingen onder het symbool.</p>
            </div>
            <span className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700">
              {isColumnOrderSectionOpen ? 'Inklappen' : 'Uitklappen'}
            </span>
          </button>
          {isColumnOrderSectionOpen ? <div className="mt-3 grid gap-2 md:grid-cols-2">
            {orderedColumnKeys.map((key, index) => (
              <div key={key} className="rounded border border-slate-200 px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-6 text-xs font-semibold text-slate-500">{index + 1}</span>
                  {getMarkupTypeFromColumnKey(key) ? (
                    <input type="checkbox" checked={settings.lineMarkups[getMarkupTypeFromColumnKey(key) as MarkupType]} onChange={(e) => toggleMarkupVisibility('line', getMarkupTypeFromColumnKey(key) as MarkupType, e.target.checked)} />
                  ) : (
                    <input type="checkbox" checked={isColumnVisible(settings, key)} onChange={(e) => toggleColumnVisibility(key, e.target.checked)} />
                  )}
                  <span className="flex-1 text-sm">{columnLabel(key)}</span>
                  <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40" onClick={() => moveColumn(key, -1)} disabled={index === 0} title="Omhoog">↑</button>
                  <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40" onClick={() => moveColumn(key, 1)} disabled={index === orderedColumnKeys.length - 1} title="Omlaag">↓</button>
                  {getMarkupTypeFromColumnKey(key) ? (
                    <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-xs" onClick={() => setOpenLineMarkupType((prev) => prev === getMarkupTypeFromColumnKey(key) ? null : getMarkupTypeFromColumnKey(key))} title="Instellingen">⚙</button>
                  ) : null}
                </div>
                {getMarkupTypeFromColumnKey(key) ? renderMarkupSettings('line', getMarkupTypeFromColumnKey(key) as MarkupType, openLineMarkupType === getMarkupTypeFromColumnKey(key)) : null}
              </div>
            ))}
          </div> : null}
        </section>

        <section className="mb-5 rounded border border-slate-200 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setIsPhaseMarkupSectionOpen((prev) => !prev)}
          >
            <div>
              <h2 className="text-sm font-semibold">Vrije regel opslagen</h2>
              <p className="mt-1 text-sm text-slate-600">Zichtbaarheid en standaardinstellingen voor vrije regel-opslagen.</p>
            </div>
            <span className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700">
              {isPhaseMarkupSectionOpen ? 'Inklappen' : 'Uitklappen'}
            </span>
          </button>
          {isPhaseMarkupSectionOpen ? <div className="mt-3 grid gap-2">
            {orderedMarkups.map((type, index) => (
              <div key={`phase-${type}`} className="rounded border border-slate-200 px-3 py-2">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={settings.phaseMarkups[type]} onChange={(e) => toggleMarkupVisibility('phase', type, e.target.checked)} />
                  <span className="flex-1 text-sm">{getDescription('phase', type)}</span>
                  <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40" onClick={() => moveMarkup(type, -1)} disabled={index === 0} title="Omhoog">↑</button>
                  <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-xs disabled:opacity-40" onClick={() => moveMarkup(type, 1)} disabled={index === orderedMarkups.length - 1} title="Omlaag">↓</button>
                  <button type="button" className="rounded border border-slate-300 px-2 py-0.5 text-xs" onClick={() => setOpenPhaseMarkupType((prev) => prev === type ? null : type)} title="Instellingen">⚙</button>
                </div>
                {renderMarkupSettings('phase', type, openPhaseMarkupType === type)}
              </div>
            ))}
          </div> : null}
        </section>

        <section className="mb-5 rounded border border-slate-200 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setQuotationLineFieldMappingsOpen((prev) => !prev)}
          >
            <div>
              <h2 className="text-sm font-semibold">Regelveld koppeling AFAS</h2>
              <p className="text-sm text-slate-600">Overzicht van app-regelvelden, eigen app-ID en de huidige AFAS-koppeling.</p>
            </div>
            <span className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700">
              {quotationLineFieldMappingsOpen ? 'Inklappen' : 'Uitklappen'}
            </span>
          </button>
          {quotationLineFieldMappingsOpen ? (
            <div className="mt-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
                    Gekoppeld: {quotationLineFieldMappings.filter((field) => isFieldMapped(field)).length}
                  </span>
                  <span className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">
                    Nog invullen: {quotationLineFieldMappings.filter((field) => isRequiredConfigurableField(field) && getFieldDisplayState(field) === 'via_field').length}
                  </span>
                  <span className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-sky-700">
                    Via veld (optioneel): {quotationLineFieldMappings.filter((field) => isOptionalViaField(field) && getFieldDisplayState(field) === 'via_field').length}
                  </span>
                  <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                    Nog open: {quotationLineFieldMappings.filter((field) => getFieldDisplayState(field) === 'open').length}
                  </span>
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                    Alleen app: {quotationLineFieldMappings.filter((field) => getFieldDisplayState(field) === 'app_only').length}
                  </span>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded border border-brand-300 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                  onClick={applyDefaultQuotationLineAfasIds}
                  title="Vul standaard AFAS-veldwaardes"
                >
                  Standaardwaardes invullen
                </button>
              </div>
              <div className="overflow-x-auto rounded border border-slate-200">
              <table className="afas-mapping-table min-w-full border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">App ID</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Opslagkey</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Label</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Type</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">AFAS mode</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">AFAS veld</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Pad</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Bron</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold">Notitie</th>
                  </tr>
                </thead>
                <tbody>
                  {quotationLineFieldMappings.map((field) => (
                    <tr
                      key={field.appFieldId}
                      className={`align-top odd:bg-white even:bg-slate-50/40 ${
                        getFieldDisplayState(field) === 'open'
                          ? 'bg-amber-50/40'
                          : isRequiredConfigurableField(field) && getFieldDisplayState(field) === 'via_field'
                            ? 'bg-rose-50/40'
                            : ''
                      }`}
                    >
                      <td className="border-b border-slate-200 px-2 py-2 font-mono">{field.appFieldId}</td>
                      <td className="border-b border-slate-200 px-2 py-2 font-mono">{field.appStorageKey}</td>
                      <td className="border-b border-slate-200 px-2 py-2">{field.appLabel}</td>
                      <td className="border-b border-slate-200 px-2 py-2">{field.valueType}</td>
                      <td className="border-b border-slate-200 px-2 py-2">
                        <span className={`inline-flex rounded border px-2 py-0.5 font-medium ${afasDisplayBadgeClass(field)}`}>
                          {getFieldDisplayState(field) === 'mapped'
                            ? 'Gekoppeld'
                            : getFieldDisplayState(field) === 'via_field'
                              ? isRequiredConfigurableField(field)
                                ? 'Nog invullen'
                                : 'Via veld'
                              : afasModeLabel(field.afasMode)}
                        </span>
                      </td>
                      <td className="border-b border-slate-200 px-2 py-2 font-mono">
                        {isEditableMappingField(field) ? (
                          <div className="flex items-center gap-2">
                            {isMappingFieldUnlocked(field) ? (
                              <input
                                className="w-full min-w-[16rem] rounded border border-slate-300 px-2 py-1 text-xs"
                                value={getEditableAfasFieldValue(field)}
                                onChange={(e) => setEditableAfasFieldValue(field, e.target.value)}
                                placeholder="AFAS veld-ID"
                              />
                            ) : (
                              <span className="block max-w-[14rem] truncate text-slate-700">{getResolvedFieldAfasId(field) || '-'}</span>
                            )}
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                              onClick={() =>
                                setUnlockedMappingFieldIds((prev) => ({ ...prev, [field.appFieldId]: !prev[field.appFieldId] }))
                              }
                              title={isMappingFieldUnlocked(field) ? 'Slot sluiten' : 'Slot openen'}
                              aria-label={isMappingFieldUnlocked(field) ? 'Slot sluiten' : 'Slot openen'}
                            >
                              {isMappingFieldUnlocked(field) ? (
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <rect x="5" y="11" width="14" height="10" rx="2" />
                                  <path d="M9 11V8a3 3 0 0 1 5.5-1.7" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <rect x="5" y="11" width="14" height="10" rx="2" />
                                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                                </svg>
                              )}
                            </button>
                          </div>
                        ) : (
                          getResolvedFieldAfasId(field) || '-'
                        )}
                      </td>
                      <td className="border-b border-slate-200 px-2 py-2 font-mono">{getDisplayedAfasPath(field)}</td>
                      <td className="border-b border-slate-200 px-2 py-2">{field.source}</td>
                      <td className="border-b border-slate-200 px-2 py-2 text-slate-600">{field.notes}</td>
                    </tr>
                  ))}
                  {!quotationLineFieldMappings.length ? (
                    <tr>
                      <td colSpan={9} className="px-2 py-3 text-center text-slate-500">
                        Geen veldkoppelingen geladen.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            </div>
          ) : null}
        </section>

        <section className="mb-5 rounded border border-slate-200 p-3">
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setIsColorSettingsSectionOpen((prev) => !prev)}
          >
            <div>
              <h2 className="text-sm font-semibold">Kleur instellingen</h2>
              <p className="text-sm text-slate-600">Kies een preset of stel kleuren zelf in.</p>
            </div>
            <span className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700">
              {isColorSettingsSectionOpen ? 'Inklappen' : 'Uitklappen'}
            </span>
          </button>
          {isColorSettingsSectionOpen ? (
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1 text-sm md:max-w-sm">
                <span className="font-medium">Thema</span>
                <select
                  className="rounded border border-slate-300 px-2 py-2"
                  value={settings.uiThemeMode}
                  onChange={(e) => setThemeMode(e.target.value as UiThemeMode)}
                >
                  <option value="standard">Standaard</option>
                  <option value="standard_dark">Standaard (donkere modus)</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              {settings.uiThemeMode === 'custom' ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="grid gap-1 text-xs">
                    <span>Achtergrond app</span>
                    <input type="color" className="h-9 rounded border border-slate-300 px-1" value={settings.uiColors.appBg} onChange={(e) => setCustomColor('appBg', e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span>Achtergrond panelen</span>
                    <input type="color" className="h-9 rounded border border-slate-300 px-1" value={settings.uiColors.panelBg} onChange={(e) => setCustomColor('panelBg', e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span>Subtiele achtergrond</span>
                    <input type="color" className="h-9 rounded border border-slate-300 px-1" value={settings.uiColors.mutedBg} onChange={(e) => setCustomColor('mutedBg', e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span>Randen</span>
                    <input type="color" className="h-9 rounded border border-slate-300 px-1" value={settings.uiColors.panelBorder} onChange={(e) => setCustomColor('panelBorder', e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span>Primaire tekst</span>
                    <input type="color" className="h-9 rounded border border-slate-300 px-1" value={settings.uiColors.textPrimary} onChange={(e) => setCustomColor('textPrimary', e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span>Secundaire tekst</span>
                    <input type="color" className="h-9 rounded border border-slate-300 px-1" value={settings.uiColors.textSecondary} onChange={(e) => setCustomColor('textSecondary', e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span>Brand 50</span>
                    <input type="color" className="h-9 rounded border border-slate-300 px-1" value={settings.uiColors.brand50} onChange={(e) => setCustomColor('brand50', e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span>Brand 100</span>
                    <input type="color" className="h-9 rounded border border-slate-300 px-1" value={settings.uiColors.brand100} onChange={(e) => setCustomColor('brand100', e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span>Brand 600</span>
                    <input type="color" className="h-9 rounded border border-slate-300 px-1" value={settings.uiColors.brand600} onChange={(e) => setCustomColor('brand600', e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span>Brand 700</span>
                    <input type="color" className="h-9 rounded border border-slate-300 px-1" value={settings.uiColors.brand700} onChange={(e) => setCustomColor('brand700', e.target.value)} />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {hasUnsavedSettingsChanges ? (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Instellingen zijn lokaal gewijzigd maar nog niet opgeslagen. AFAS gebruikt pas na `Opslaan` de nieuwe veldkoppeling.
          </div>
        ) : null}
        <button className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50" onClick={() => void onSave()} disabled={saving}>
          {saving ? 'Opslaan...' : 'Opslaan'}
        </button>
      </div>
    </div>
  );
}
