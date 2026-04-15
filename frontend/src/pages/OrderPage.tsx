import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  DEFAULT_BOOTSTRAP_STATUS,
  fetchBootstrapStatus,
  fetchCreditors,
  fetchProject,
  fetchProjects,
  fetchProjectStages,
  fetchQuotationLines,
  fetchQuotations,
  fetchSettings,
  saveQuotationLines,
} from '../api/client';
import { BootstrapStatus } from '../core/types';
import { Creditor, Project, ProjectStage, Quotation, QuotationLine, QuotationLineMutation, Settings } from '../types';
import { normalizeMeasurementLine, SELECTED_PROJECT_STORAGE_KEY } from '../utils/measurement';
import { aggregatePurchaseLines } from '../utils/purchasing';
import { applyThemeColors } from '../utils/theme';

const NO_STAGE_ID = 'NO_STAGE';

function compareQuotationLines(a: { quotationId: string; stageId: string; order: number; id: string; orderHasLineNo?: boolean }, b: { quotationId: string; stageId: string; order: number; id: string; orderHasLineNo?: boolean }) {
  if (a.quotationId !== b.quotationId) return a.quotationId.localeCompare(b.quotationId, 'nl');
  if (a.stageId !== b.stageId) return a.stageId.localeCompare(b.stageId, 'nl');
  if (Boolean(a.orderHasLineNo) !== Boolean(b.orderHasLineNo)) return a.orderHasLineNo ? -1 : 1;
  if (a.order !== b.order) return a.order - b.order;
  return a.id.localeCompare(b.id, 'nl');
}

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

function buildPdfFileName(projectId?: string) {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `Bestellen-${projectId?.trim() || 'Project'}-${stamp}`;
}

function formatAmount(value: number) {
  return value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDimension(value: number) {
  return value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseFormulaDimensions(specKey: string): { length?: number; width?: number } {
  const parts = specKey.split(':');
  if (parts.length < 3) return {};
  if (parts[0] === 'm2' && parts[1] === 'formula') {
    if (parts[2] === 'row' && parts.length >= 5) {
      return { length: Number(parts[3]) || 0, width: Number(parts[4]) || 0 };
    }
    if (parts.length >= 4) {
      return { length: Number(parts[2]) || 0, width: Number(parts[3]) || 0 };
    }
  }
  if (parts[0] === 'm1' && parts[1] === 'formula') {
    if (parts[2] === 'row' && parts.length >= 4) {
      return { length: Number(parts[3]) || 0 };
    }
    if (parts.length >= 3) {
      return { length: Number(parts[2]) || 0 };
    }
  }
  return {};
}

function isNonPurchasableLineType(lineType?: string) {
  return lineType?.trim() === '3';
}

function isPhaseMarkupLine(markupFormulaMemo?: string) {
  if (!markupFormulaMemo?.trim()) return false;
  try {
    const parsed = JSON.parse(markupFormulaMemo) as { kind?: string };
    return parsed.kind === 'phase_markup_line';
  } catch {
    return false;
  }
}

function isNonPurchasableLine(line: Pick<QuotationLine, 'lineType' | 'markupFormulaMemo'> | undefined) {
  if (!line) return false;
  return isNonPurchasableLineType(line.lineType) || isPhaseMarkupLine(line.markupFormulaMemo);
}

function formatCreditorOption(creditor: Creditor) {
  return `${creditor.id} - ${creditor.name}`;
}

function formatSupplierDisplay(supplierId?: string, supplierName?: string) {
  if (supplierId && supplierName) return `${supplierId} - ${supplierName}`;
  return supplierId || supplierName || '';
}

function getProjectIdFromUrlContext() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const direct =
    params.get('PrId')?.trim() ??
    params.get('prId')?.trim() ??
    params.get('prid')?.trim() ??
    '';
  if (direct) return direct;
  for (const [key, value] of params.entries()) {
    if (key.toLowerCase() !== 'prid') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export default function OrderPage() {
  const urlProjectId = useMemo(() => getProjectIdFromUrlContext(), []);
  const isProjectLockedFromUrl = Boolean(urlProjectId);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>(DEFAULT_BOOTSTRAP_STATUS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [prId, setPrId] = useState(() => urlProjectId || localStorage.getItem(SELECTED_PROJECT_STORAGE_KEY) || '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [stages, setStages] = useState<ProjectStage[]>([]);
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [selectedQuotationIds, setSelectedQuotationIds] = useState<string[]>([]);
  const [isQuotationDropdownOpen, setIsQuotationDropdownOpen] = useState(false);
  const [lines, setLines] = useState<QuotationLine[]>([]);
  const [draftPurchaseByLineId, setDraftPurchaseByLineId] = useState<Record<string, boolean>>({});
  const [draftSupplierByLineId, setDraftSupplierByLineId] = useState<Record<string, { supplierId?: string; supplierName?: string }>>({});
  const [creditorQueriesByRowKey, setCreditorQueriesByRowKey] = useState<Record<string, string>>({});
  const [creditorOptionsByRowKey, setCreditorOptionsByRowKey] = useState<Record<string, Creditor[]>>({});
  const [creditorSuggestions, setCreditorSuggestions] = useState<{ rowKey: string | null; query: string; open: boolean; loading: boolean }>({
    rowKey: null,
    query: '',
    open: false,
    loading: false,
  });
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState('');
  const [isPhasePanelCollapsed, setIsPhasePanelCollapsed] = useState(false);
  const [rowCalculationMode, setRowCalculationMode] = useState<Record<string, 'theoretical' | 'optimized'>>({});
  const [rowDetailsCollapsed, setRowDetailsCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      setLoading(true);
      try {
        const nextBootstrapStatus = await fetchBootstrapStatus();
        if (!mounted) return;
        setBootstrapStatus(nextBootstrapStatus);
        if (!nextBootstrapStatus.ready) {
          setError('');
          return;
        }
        const [settingsData, projectOptions] = await Promise.all([fetchSettings(), fetchProjects()]);
        if (!mounted) return;
        setSettings(settingsData);
        setProjects(projectOptions);
        setError('');
      } catch (loadError) {
        if (!mounted) return;
        setError((loadError as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [refreshVersion]);

  useEffect(() => {
    if (!settings) return;
    applyThemeColors(settings);
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(SELECTED_PROJECT_STORAGE_KEY, prId);
  }, [prId]);

  useEffect(() => {
    if (!urlProjectId) return;
    if (prId === urlProjectId) return;
    setPrId(urlProjectId);
  }, [urlProjectId, prId]);

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
        setLines([]);
        setDraftPurchaseByLineId({});
        setDraftSupplierByLineId({});
        setCreditorQueriesByRowKey({});
        setCreditorOptionsByRowKey({});
        setCreditorSuggestions({ rowKey: null, query: '', open: false, loading: false });
        setRowCalculationMode({});
        setRowDetailsCollapsed({});
        return;
      }

      setLoading(true);
      try {
        const [projectData, stagesData, quotationsData, linesData] = await Promise.all([
          fetchProject(prId),
          fetchProjectStages(prId),
          fetchQuotations(prId),
          fetchQuotationLines(prId),
        ]);
        if (!mounted) return;

        const sortedStages = [...stagesData].sort((a, b) => a.order - b.order);
        const stageIdSet = new Set(sortedStages.map((stage) => stage.id));
        const sortedQuotations = [...quotationsData].sort((a, b) => a.order - b.order);
        const normalizedLines = [...linesData]
          .map((line, idx) => ({
            ...normalizeMeasurementLine(line),
            stageId: stageIdSet.has(line.stageId) ? line.stageId : NO_STAGE_ID,
            order: Number.isFinite(line.order) ? line.order : idx + 1,
          }))
          .sort(compareQuotationLines);

        const hasNoPhaseLines = normalizedLines.some((line) => line.stageId === NO_STAGE_ID);
        setProject(projectData);
        setStages(sortedStages);
        setSelectedStageIds([...sortedStages.map((stage) => stage.id), ...(hasNoPhaseLines ? [NO_STAGE_ID] : [])]);
        setQuotations(sortedQuotations);
        setSelectedQuotationIds(sortedQuotations.map((quotation) => quotation.id));
        setLines(normalizedLines);
        setDraftPurchaseByLineId({});
        setDraftSupplierByLineId({});
        setCreditorQueriesByRowKey({});
        setCreditorOptionsByRowKey({});
        setCreditorSuggestions({ rowKey: null, query: '', open: false, loading: false });
        setRowCalculationMode({});
        setRowDetailsCollapsed({});
        setSaveFeedback('');
        setError('');
      } catch (loadError) {
        if (!mounted) return;
        setError((loadError as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadProjectContext();
    return () => {
      mounted = false;
    };
  }, [prId, bootstrapStatus.ready]);

  const selectableProjects = useMemo(() => projects.filter((option) => option.id !== 'BIB'), [projects]);
  const showPhasePanel = settings?.usePhases ?? true;
  const showQuotationSelector = quotations.length > 1;
  const layoutGridClass = useMemo(() => {
    if (!showPhasePanel) return 'md:grid-cols-1';
    return isPhasePanelCollapsed ? 'md:grid-cols-[46px_1fr]' : 'md:grid-cols-[280px_1fr]';
  }, [showPhasePanel, isPhasePanelCollapsed]);
  const hasVisibleNoPhaseLines = useMemo(
    () => lines.some((line) => line.stageId === NO_STAGE_ID && selectedQuotationIds.includes(line.quotationId)),
    [lines, selectedQuotationIds],
  );

  const selectableStageIds = useMemo(
    () => [...stages.map((stage) => stage.id), ...(hasVisibleNoPhaseLines ? [NO_STAGE_ID] : [])],
    [stages, hasVisibleNoPhaseLines],
  );

  const activeStageIds = useMemo(() => {
    if (!showPhasePanel) return selectableStageIds;
    return selectedStageIds;
  }, [showPhasePanel, selectableStageIds, selectedStageIds]);

  const linesWithDraft = useMemo(
    () =>
      lines.map((line) => ({
        ...line,
        supplierId: Object.prototype.hasOwnProperty.call(draftSupplierByLineId, line.id)
          ? draftSupplierByLineId[line.id]?.supplierId
          : line.supplierId,
        supplierName: Object.prototype.hasOwnProperty.call(draftSupplierByLineId, line.id)
          ? draftSupplierByLineId[line.id]?.supplierName
          : line.supplierName,
        purchaseEnabled:
          isNonPurchasableLine(line)
            ? false
            : (draftPurchaseByLineId[line.id] !== undefined
              ? draftPurchaseByLineId[line.id]
              : line.purchaseEnabled !== false),
      })),
    [lines, draftPurchaseByLineId, draftSupplierByLineId],
  );

  const linesWithDraftById = useMemo(() => new Map(linesWithDraft.map((line) => [line.id, line] as const)), [linesWithDraft]);

  const filteredLines = useMemo(
    () =>
      linesWithDraft.filter(
        (line) =>
          selectedQuotationIds.includes(line.quotationId) &&
          (!showPhasePanel || activeStageIds.includes(line.stageId)),
      ),
    [linesWithDraft, selectedQuotationIds, showPhasePanel, activeStageIds],
  );

  const purchaseRowsEnabled = useMemo(
    () => aggregatePurchaseLines(filteredLines.filter((line) => line.purchaseEnabled !== false)),
    [filteredLines],
  );
  const purchaseRowsDisabled = useMemo(
    () => aggregatePurchaseLines(filteredLines.filter((line) => line.purchaseEnabled === false)),
    [filteredLines],
  );

  const stageLineCount = useMemo(() => {
    const map = new Map<string, number>();
    stages.forEach((stage) => map.set(stage.id, 0));
    lines.forEach((line) => {
      if (!selectedQuotationIds.includes(line.quotationId)) return;
      map.set(line.stageId, (map.get(line.stageId) ?? 0) + 1);
    });
    return map;
  }, [stages, lines, selectedQuotationIds]);

  const specificationCount = useMemo(
    () => [...purchaseRowsEnabled, ...purchaseRowsDisabled].reduce((sum, row) => sum + row.specGroups.length, 0),
    [purchaseRowsEnabled, purchaseRowsDisabled],
  );
  const purchaseRowsEnabledBySupplier = useMemo(() => {
    const groups = new Map<string, { label: string; rows: ReturnType<typeof aggregatePurchaseLines> }>();
    purchaseRowsEnabled.forEach((row) => {
      const summary = getRowSupplierSummary(row);
      const label = summary.display?.trim() || 'Geen inkooprelatie';
      const key = summary.isMixed ? 'MIXED' : label;
      const current = groups.get(key) ?? { label, rows: [] };
      current.rows.push(row);
      groups.set(key, current);
    });
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'nl'));
  }, [purchaseRowsEnabled, linesWithDraftById]);

  const changedLineIds = useMemo(
    () =>
      lines
        .filter((line) => {
          const next = linesWithDraftById.get(line.id);
          if (!next) return false;
          const purchaseChanged = (line.purchaseEnabled !== false) !== (next.purchaseEnabled !== false);
          const supplierChanged = (line.supplierId ?? '') !== (next.supplierId ?? '') || (line.supplierName ?? '') !== (next.supplierName ?? '');
          return purchaseChanged || supplierChanged;
        })
        .map((line) => line.id),
    [lines, linesWithDraftById],
  );

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

  function setPurchaseEnabledForRow(lineIds: string[], value: boolean) {
    setDraftPurchaseByLineId((prev) => {
      const next = { ...prev };
      lineIds.forEach((lineId) => {
        const line = lines.find((entry) => entry.id === lineId);
        if (isNonPurchasableLine(line)) {
          next[lineId] = false;
          return;
        }
        next[lineId] = value;
      });
      return next;
    });
    setSaveFeedback('');
  }

  function getEffectivePurchaseEnabled(lineId: string) {
    const line = lines.find((entry) => entry.id === lineId);
    if (isNonPurchasableLine(line)) return false;
    const draftValue = draftPurchaseByLineId[lineId];
    if (draftValue !== undefined) return draftValue;
    return line?.purchaseEnabled !== false;
  }

  function isContainerFullySelected(rows: ReturnType<typeof aggregatePurchaseLines>, purchaseEnabled: boolean) {
    if (!rows.length) return false;
    return rows.every((row) => row.sourceLineIds.every((lineId) => getEffectivePurchaseEnabled(lineId) === purchaseEnabled));
  }

  function getRowSupplierSummary(row: { sourceLineIds: string[] }) {
    const uniqueSuppliers = new Map<string, { supplierId?: string; supplierName?: string }>();
    row.sourceLineIds.forEach((lineId) => {
      const line = linesWithDraftById.get(lineId);
      if (!line) return;
      const key = `${line.supplierId ?? ''}\u0000${line.supplierName ?? ''}`;
      uniqueSuppliers.set(key, { supplierId: line.supplierId, supplierName: line.supplierName });
    });
    if (!uniqueSuppliers.size) return { display: '', isMixed: false };
    if (uniqueSuppliers.size > 1) return { display: 'Meerdere inkooprelaties', isMixed: true };
    const only = [...uniqueSuppliers.values()][0];
    return {
      display: formatSupplierDisplay(only.supplierId, only.supplierName),
      isMixed: false,
      supplierId: only.supplierId,
      supplierName: only.supplierName,
    };
  }

  async function loadCreditorSuggestions(rowKey: string, rawQuery: string) {
    const query = rawQuery.trim();
    if (!query) {
      setCreditorOptionsByRowKey((prev) => ({ ...prev, [rowKey]: [] }));
      setCreditorSuggestions((prev) => (prev.rowKey === rowKey ? { rowKey, query: '', open: false, loading: false } : prev));
      return;
    }
    setCreditorSuggestions({ rowKey, query, open: true, loading: true });
    try {
      const creditors = await fetchCreditors(query);
      setCreditorOptionsByRowKey((prev) => ({ ...prev, [rowKey]: creditors }));
      setCreditorSuggestions({ rowKey, query, open: true, loading: false });
    } catch {
      setCreditorOptionsByRowKey((prev) => ({ ...prev, [rowKey]: [] }));
      setCreditorSuggestions({ rowKey, query, open: true, loading: false });
    }
  }

  function setSupplierForRow(lineIds: string[], supplier?: { supplierId?: string; supplierName?: string }) {
    setDraftSupplierByLineId((prev) => {
      const next = { ...prev };
      lineIds.forEach((lineId) => {
        next[lineId] = {
          supplierId: supplier?.supplierId,
          supplierName: supplier?.supplierName,
        };
      });
      return next;
    });
    setSaveFeedback('');
  }

  function toMutation(line: QuotationLine): QuotationLineMutation {
    return {
      id: line.id,
      quotationId: line.quotationId,
      stageId: line.stageId,
      order: line.order,
      lineType: line.lineType,
      itemCode: line.itemCode,
      description: line.description,
      supplierId: line.supplierId,
      supplierName: line.supplierName,
      purchaseEnabled: isNonPurchasableLine(line) ? false : (line.purchaseEnabled !== false),
      baseQty: line.baseQty,
      unit: line.unit,
      qtyFormula: line.qtyFormula,
      qtyFormulaMemo: line.qtyFormulaMemo,
      costFormula: line.costFormula,
      costFormulaMemo: line.costFormulaMemo,
      markupFormulaMemo: line.markupFormulaMemo,
      unitCost: line.unitCost,
      purchasePrice: line.purchasePrice,
      unitPrice: line.unitPrice,
    };
  }

  async function savePurchaseToggles() {
    if (!prId || !changedLineIds.length) return;
    setSaving(true);
    setSaveFeedback('');
    try {
      const updates: QuotationLineMutation[] = [];
      changedLineIds.forEach((lineId) => {
        const line = linesWithDraftById.get(lineId);
        if (!line) return;
        updates.push(toMutation(line));
      });
      await saveQuotationLines(prId, { create: [], update: updates, delete: [] });
      setLines((prev) =>
        prev.map((line) => {
          const next = linesWithDraftById.get(line.id);
          if (!next) return line;
          return {
            ...line,
            purchaseEnabled: next.purchaseEnabled,
            supplierId: next.supplierId,
            supplierName: next.supplierName,
          };
        }),
      );
      setDraftPurchaseByLineId({});
      setDraftSupplierByLineId({});
      setCreditorQueriesByRowKey({});
      setCreditorOptionsByRowKey({});
      setSaveFeedback('Wijzigingen opgeslagen.');
    } catch (saveError) {
      setSaveFeedback((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadPdf() {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const fileName = buildPdfFileName(project?.id || prId);
    const projectLabel = project ? `${project.id} - ${project.name}` : (prId || '-');
    const exportDate = new Date().toLocaleString('nl-NL');

    let cursorY = 14;
    doc.setFontSize(15);
    doc.text('Besteloverzicht', 14, cursorY);
    cursorY += 6;
    doc.setFontSize(10);
    doc.text(`Project: ${projectLabel}`, 14, cursorY);
    cursorY += 5;
    doc.text(`Export: ${exportDate}`, 14, cursorY);
    cursorY += 6;

    const drawRowsTable = (title: string, rows: ReturnType<typeof aggregatePurchaseLines>) => {
      doc.setFontSize(11);
      doc.text(`${title} (${rows.length})`, 14, cursorY);
      cursorY += 1;
      const pdfBody = rows.map((row) => {
        const activeMode = rowCalculationMode[row.key] ?? (row.optimization ? 'optimized' : 'theoretical');
        const calculatedPieces = activeMode === 'optimized'
          ? row.optimization?.orderedPieces
          : row.theoreticalPieces;
        const calculationInfo = activeMode === 'optimized' && row.optimization
          ? [
              `Geoptimaliseerd: ${row.optimization.orderedPieces} stuks (${row.optimization.stockLabel})`,
              `Benutting ${formatAmount(row.optimization.utilizationPct)}% | Rest ${formatAmount(row.optimization.wasteQty)} ${row.optimization.mode === 'm1' ? 'm' : 'm2'}`,
              ...row.optimization.planLines.slice(0, 2),
            ]
          : row.theoreticalPieces !== undefined
            ? [`Theoretisch: ${formatAmount(row.theoreticalPieces)} stuks (${row.theoreticalStockLabel ?? '-'})`]
            : [];
        const totalInfo = calculatedPieces !== undefined ? [`Stuks: ${formatAmount(calculatedPieces)}`] : [];
        return [
          row.itemCode || '-',
          { primary: row.description || '-', secondary: calculationInfo },
          row.orderUnit || '-',
          { primary: formatAmount(row.totalQty), secondary: totalInfo },
          String(row.lineCount),
        ];
      }) as unknown as Array<Array<unknown>>;
      autoTable(doc, {
        startY: cursorY + 1,
        head: [['Code', 'Omschrijving', 'Eenheid', 'Totaal', 'Regels']],
        body: pdfBody as never,
        styles: { fontSize: 8, cellPadding: 1.6, lineColor: [226, 232, 240], lineWidth: 0.1 },
        bodyStyles: { valign: 'top' },
        didParseCell: (hookData) => {
          if (hookData.section !== 'body') return;
          const raw = hookData.cell.raw as { primary?: string; secondary?: string[] } | string;
          if (raw && typeof raw === 'object' && 'primary' in raw) {
            const secondaryLines = Array.isArray(raw.secondary) ? raw.secondary.filter(Boolean) : [];
            hookData.cell.text = [raw.primary ?? ''];
            if (secondaryLines.length) {
              hookData.cell.styles.minCellHeight = Math.max(
                Number(hookData.cell.styles.minCellHeight ?? 0),
                6 + secondaryLines.length * 3.2,
              );
            }
          }
        },
        didDrawCell: (hookData) => {
          if (hookData.section !== 'body') return;
          const raw = hookData.cell.raw as { primary?: string; secondary?: string[] } | string;
          if (!raw || typeof raw !== 'object' || !('primary' in raw)) return;
          const secondaryLines = Array.isArray(raw.secondary) ? raw.secondary.filter(Boolean) : [];
          if (!secondaryLines.length) return;
          const docInstance = hookData.doc;
          const leftPadding = Number(hookData.cell.padding('left'));
          const topPadding = Number(hookData.cell.padding('top'));
          const startX = hookData.cell.x + leftPadding;
          let startY = hookData.cell.y + topPadding + 5.2;
          docInstance.setFontSize(6.3);
          docInstance.setTextColor(110, 110, 110);
          secondaryLines.forEach((line) => {
            docInstance.text(line, startX, startY);
            startY += 3.0;
          });
          docInstance.setFontSize(8);
          docInstance.setTextColor(20, 20, 20);
        },
        headStyles: { fillColor: [248, 250, 252], textColor: [71, 85, 105], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: {
          0: { cellWidth: 32 },
          1: { cellWidth: 94 },
          2: { cellWidth: 18, halign: 'center' },
          3: { cellWidth: 22, halign: 'right' },
          4: { cellWidth: 14, halign: 'center' },
        },
        margin: { left: 14, right: 14 },
      });
      cursorY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? cursorY + 8;
      cursorY += 8;
    };

    doc.setFontSize(10);
    doc.text('Inkopen - subgroepering per inkooprelatie', 14, cursorY);
    cursorY += 5;
    purchaseRowsEnabledBySupplier.forEach((group) => {
      if (cursorY > 250) {
        doc.addPage();
        cursorY = 14;
      }
      drawRowsTable(group.label, group.rows);
    });

    if (cursorY > 235) {
      doc.addPage();
      cursorY = 14;
    }
    drawRowsTable('Niet inkopen', purchaseRowsDisabled);

    doc.save(`${fileName}.pdf`);
  }

  function renderPurchaseTable(rows: ReturnType<typeof aggregatePurchaseLines>, purchaseEnabled: boolean) {
    return (
      <div className="order-table-wrap overflow-x-auto rounded border border-slate-200">
        <table className="order-purchase-table min-w-full border-collapse text-xs">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2">Inkopen</th>
              <th className="border-b border-slate-200 px-3 py-2">Code</th>
              <th className="border-b border-slate-200 px-3 py-2">Omschrijving</th>
              <th className="border-b border-slate-200 px-3 py-2">Inkooprelatie</th>
              <th className="border-b border-slate-200 px-3 py-2">Eenheid</th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">Totaal</th>
              <th className="border-b border-slate-200 px-3 py-2">Unieke delen / specificaties</th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">Regels</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const enteredSpecs = row.specGroups.filter((spec) => spec.key.includes(':formula:'));
              const rowSupplierSummary = getRowSupplierSummary(row);
              const rowQueryValue = creditorQueriesByRowKey[row.key] ?? rowSupplierSummary.display;
              const creditorOptions = creditorOptionsByRowKey[row.key] ?? [];
              const rowHasOnlyNonPurchasableTypes = row.sourceLineIds.every((lineId) =>
                isNonPurchasableLine(linesWithDraftById.get(lineId)),
              );
              const activeMode = rowCalculationMode[row.key] ?? (row.optimization ? 'optimized' : 'theoretical');
              const calculatedPieces = activeMode === 'optimized' ? row.optimization?.orderedPieces : row.theoreticalPieces;
              const detailsCollapsed = rowDetailsCollapsed[row.key] ?? false;
              return (
                <tr key={row.key} className="align-top">
                  <td className="border-b border-slate-200 px-2 py-2">
                    <label className={`inline-flex items-center gap-2 text-xs ${rowHasOnlyNonPurchasableTypes ? 'text-slate-400' : 'text-slate-700'}`}>
                      <input
                        type="checkbox"
                        checked={purchaseEnabled}
                        disabled={rowHasOnlyNonPurchasableTypes}
                        onChange={(e) => setPurchaseEnabledForRow(row.sourceLineIds, e.target.checked)}
                      />
                      <span>{purchaseEnabled ? 'Ja' : 'Nee'}</span>
                    </label>
                  </td>
                  <td className="border-b border-slate-200 px-2 py-2 font-semibold text-slate-800">{row.itemCode || '-'}</td>
                  <td className="border-b border-slate-200 px-2 py-2 text-slate-700">
                    <div>{row.description || '-'}</div>
                    {row.standardSpecLabel ? (
                      <div className="mt-0.5 text-[11px] text-slate-500">Standaard maat: {row.standardSpecLabel}</div>
                    ) : null}
                  </td>
                  <td className="group relative border-b border-slate-200 px-2 py-2 text-slate-700">
                    <input
                      className="w-full min-w-[14rem] rounded border border-slate-300 px-2 py-1 text-xs"
                      value={rowQueryValue}
                      placeholder="Zoek inkooprelatie"
                      onFocus={(e) => {
                        const value = e.target.value.trim();
                        if (!value) return;
                        void loadCreditorSuggestions(row.key, value);
                      }}
                      onBlur={() => {
                        window.setTimeout(() => {
                          setCreditorSuggestions((prev) => (prev.rowKey === row.key ? { rowKey: null, query: '', open: false, loading: false } : prev));
                        }, 120);
                      }}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setCreditorQueriesByRowKey((prev) => ({ ...prev, [row.key]: nextValue }));
                        if (!nextValue.trim()) {
                          setSupplierForRow(row.sourceLineIds, undefined);
                          setCreditorOptionsByRowKey((prev) => ({ ...prev, [row.key]: [] }));
                          setCreditorSuggestions({ rowKey: null, query: '', open: false, loading: false });
                          return;
                        }
                        void loadCreditorSuggestions(row.key, nextValue);
                        const exactMatch =
                          creditorOptions.find((creditor) => formatCreditorOption(creditor) === nextValue) ??
                          creditorOptions.find((creditor) => creditor.id === nextValue.trim());
                        if (!exactMatch) return;
                        setSupplierForRow(row.sourceLineIds, { supplierId: exactMatch.id, supplierName: exactMatch.name });
                        setCreditorQueriesByRowKey((prev) => {
                          const next = { ...prev };
                          delete next[row.key];
                          return next;
                        });
                      }}
                    />
                    {creditorSuggestions.open && creditorSuggestions.rowKey === row.key ? (
                      <div className="absolute left-2 top-10 z-[140] w-[28rem] max-w-[min(28rem,calc(100vw-3rem))] overflow-hidden rounded border border-slate-300 bg-white shadow-lg">
                        <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
                          {creditorSuggestions.loading
                            ? `Zoeken op "${creditorSuggestions.query}"...`
                            : `${creditorOptions.length} inkooprelatie(s)`}
                        </div>
                        <div className="max-h-72 overflow-auto">
                          {creditorOptions.map((creditor) => (
                            <button
                              key={`${row.key}-${creditor.id}`}
                              type="button"
                              className="grid w-full grid-cols-[110px_1fr] gap-3 border-b border-slate-100 px-3 py-2 text-left hover:bg-brand-50"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                setSupplierForRow(row.sourceLineIds, { supplierId: creditor.id, supplierName: creditor.name });
                                setCreditorQueriesByRowKey((prev) => {
                                  const next = { ...prev };
                                  delete next[row.key];
                                  return next;
                                });
                                setCreditorSuggestions({ rowKey: null, query: '', open: false, loading: false });
                              }}
                            >
                              <span className="text-xs font-semibold text-slate-700">{creditor.id}</span>
                              <span className="min-w-0 text-xs text-slate-600">{creditor.name}</span>
                            </button>
                          ))}
                          {!creditorSuggestions.loading && !creditorOptions.length ? (
                            <div className="px-3 py-2 text-xs text-slate-500">Geen inkooprelaties gevonden.</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {rowSupplierSummary.isMixed ? (
                      <div className="mt-1 text-[11px] text-amber-700">Meerdere relaties aanwezig, kies 1 relatie om te uniformeren.</div>
                    ) : null}
                  </td>
                  <td className="border-b border-slate-200 px-2 py-2 text-slate-700">{row.orderUnit || '-'}</td>
                  <td className="border-b border-slate-200 px-2 py-2 text-right font-semibold text-slate-900">
                    <div>{formatAmount(row.totalQty)}</div>
                    {calculatedPieces !== undefined ? (
                      <div className="mt-0.5 text-[11px] italic font-normal text-slate-500">
                        {formatAmount(calculatedPieces)} stuks
                      </div>
                    ) : null}
                  </td>
                  <td className="border-b border-slate-200 px-2 py-2">
                    <div className="space-y-2">
                      {row.optimization && row.theoreticalPieces !== undefined ? (
                        <div className="inline-flex rounded border border-slate-300 bg-white p-0.5">
                          <button
                            type="button"
                            className={`group relative rounded px-2 py-1 text-[11px] font-medium transition ${activeMode === 'theoretical' ? 'bg-sky-100 text-sky-800' : 'text-slate-600 hover:bg-slate-50'}`}
                            onClick={() => setRowCalculationMode((prev) => ({ ...prev, [row.key]: 'theoretical' }))}
                          >
                            Theoretisch
                            <span className="pointer-events-none absolute right-0 top-7 z-20 hidden w-72 rounded border border-slate-200 bg-white p-3 text-left text-[11px] leading-5 text-slate-700 shadow-lg group-hover:block">
                              De app rekent alleen met het totaal benodigde aantal meters of vierkante meters gedeeld door de standaard handelsmaat. Er is dus geen snij- of plaatoptimalisatie beschikbaar voor deze regel.
                            </span>
                          </button>
                          <button
                            type="button"
                            className={`group relative rounded px-2 py-1 text-[11px] font-medium transition ${activeMode === 'optimized' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-600 hover:bg-slate-50'}`}
                            onClick={() => setRowCalculationMode((prev) => ({ ...prev, [row.key]: 'optimized' }))}
                          >
                            Geoptimaliseerd
                            <span className="pointer-events-none absolute right-0 top-7 z-20 hidden w-72 rounded border border-slate-200 bg-white p-3 text-left text-[11px] leading-5 text-slate-700 shadow-lg group-hover:block">
                              De app gebruikt bekende standaard handelsmaten en probeert ingevoerde lengtes of plaatmaten zo slim mogelijk te verdelen. Daardoor zie je hoeveel stuks je echt moet bestellen, inclusief benutting en rest.
                            </span>
                          </button>
                          <button
                            type="button"
                            className="rounded px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            onClick={() => setRowDetailsCollapsed((prev) => ({ ...prev, [row.key]: !detailsCollapsed }))}
                            title={detailsCollapsed ? 'Details uitklappen' : 'Details inklappen'}
                            aria-label={detailsCollapsed ? 'Details uitklappen' : 'Details inklappen'}
                          >
                            {detailsCollapsed ? '▸' : '▾'}
                          </button>
                        </div>
                      ) : row.optimization || row.theoreticalPieces !== undefined ? (
                        <div className="inline-flex rounded border border-slate-300 bg-white p-0.5">
                          <button
                            type="button"
                            className="rounded px-2 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                            onClick={() => setRowDetailsCollapsed((prev) => ({ ...prev, [row.key]: !detailsCollapsed }))}
                            title={detailsCollapsed ? 'Details uitklappen' : 'Details inklappen'}
                            aria-label={detailsCollapsed ? 'Details uitklappen' : 'Details inklappen'}
                          >
                            {detailsCollapsed ? '▸' : '▾'}
                          </button>
                        </div>
                      ) : null}
                      {!detailsCollapsed && activeMode === 'optimized' && row.optimization ? (
                        <div className="relative rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold">Geoptimaliseerde bestelling</div>
                            <div className="group relative">
                              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-emerald-300 bg-white text-[10px] font-semibold text-emerald-700">i</span>
                              <div className="pointer-events-none absolute right-0 top-5 z-20 hidden w-72 rounded border border-slate-200 bg-white p-3 text-[11px] leading-5 text-slate-700 shadow-lg group-hover:block">
                                De app gebruikt bekende standaard handelsmaten en probeert ingevoerde lengtes of plaatmaten zo slim mogelijk te verdelen. Daardoor zie je hoeveel stuks je echt moet bestellen, inclusief benutting en rest.
                              </div>
                            </div>
                          </div>
                          <div className="mt-0.5">Handelsmaat: {row.optimization.stockLabel}</div>
                          <div>Te bestellen: {row.optimization.orderedPieces} stuks</div>
                          <div>Benutting: {formatAmount(row.optimization.utilizationPct)}%</div>
                          <div>
                            Rest: {formatAmount(row.optimization.wasteQty)} {row.optimization.mode === 'm1' ? 'm' : 'm2'}
                          </div>
                          <div className="mt-1 space-y-0.5 text-[11px] text-emerald-800">
                            {row.optimization.planLines.slice(0, 4).map((planLine) => (
                              <div key={planLine}>{planLine}</div>
                            ))}
                            {row.optimization.planLines.length > 4 ? <div>+ {row.optimization.planLines.length - 4} extra snijregels</div> : null}
                          </div>
                        </div>
                      ) : !detailsCollapsed && row.theoreticalPieces !== undefined ? (
                        <div className="relative rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-semibold">Theoretische bestelling</div>
                            <div className="group relative">
                              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-sky-300 bg-white text-[10px] font-semibold text-sky-700">i</span>
                              <div className="pointer-events-none absolute right-0 top-5 z-20 hidden w-72 rounded border border-slate-200 bg-white p-3 text-[11px] leading-5 text-slate-700 shadow-lg group-hover:block">
                                De app rekent hier alleen met het totaal benodigde aantal meters of vierkante meters gedeeld door de standaard handelsmaat. Er is dus geen snij- of plaatoptimalisatie beschikbaar voor deze regel.
                              </div>
                            </div>
                          </div>
                          <div className="mt-0.5">Handelsmaat: {row.theoreticalStockLabel ?? '-'}</div>
                          <div>Benodigd: {formatAmount(row.theoreticalPieces)} stuks</div>
                        </div>
                      ) : null}
                      {!detailsCollapsed && enteredSpecs.length > 0 ? (
                        <div className="overflow-hidden rounded border border-slate-200">
                          <table className="order-inline-table w-full border-collapse text-xs">
                            <thead className="bg-slate-50 text-slate-500">
                              <tr>
                                <th className="border-b border-slate-200 px-1.5 py-1 text-right font-semibold">Lengte</th>
                                <th className="border-b border-slate-200 px-1.5 py-1 text-right font-semibold">Breedte</th>
                                <th className="border-b border-slate-200 px-1.5 py-1 text-right font-semibold">Totaal</th>
                                <th className="border-b border-slate-200 px-1.5 py-1 text-right font-semibold">Stuks</th>
                              </tr>
                            </thead>
                            <tbody>
                              {enteredSpecs.map((spec) => {
                                const dimensions = parseFormulaDimensions(spec.key);
                                return (
                                  <tr key={spec.key} className="border-b border-slate-100 last:border-b-0">
                                    <td className="px-1.5 py-1 text-right text-slate-800">
                                      {dimensions.length && dimensions.length > 0 ? `${formatDimension(dimensions.length)} m` : '-'}
                                    </td>
                                    <td className="px-1.5 py-1 text-right text-slate-800">
                                      {dimensions.width && dimensions.width > 0 ? `${formatDimension(dimensions.width)} m` : '-'}
                                    </td>
                                    <td className="px-1.5 py-1 text-right font-semibold text-slate-700">
                                      {formatAmount(spec.totalQty)} {row.orderUnit}
                                    </td>
                                    <td className="px-1.5 py-1 text-right font-semibold text-slate-700">
                                      {formatAmount(spec.totalPieces)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : !detailsCollapsed && row.hasMeasurement ? (
                        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                          {row.standardSpecLabel ? (
                            <>Standaard maat: {row.standardSpecLabel}. Geen ingevoerde maatregels gevonden.</>
                          ) : (
                            <>Geen standaardmaat vastgelegd. Daarom is alleen het totaal in {row.orderUnit} opgeteld.</>
                          )}
                        </div>
                      ) : !detailsCollapsed ? (
                        <div className="text-xs text-slate-500">Geen extra specificaties van toepassing.</div>
                      ) : null}
                    </div>
                  </td>
                  <td className="border-b border-slate-200 px-2 py-2 text-right text-slate-600">{row.lineCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (loading && !settings) return <div className="p-6 text-sm text-slate-700">Laden...</div>;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100 p-3">
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
            <h1 className="text-lg font-semibold text-slate-800">{project ? `${project.id} - ${project.name}` : 'Nog geen project geselecteerd'}</h1>
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
            <div className={`mb-2 flex ${isPhasePanelCollapsed ? 'justify-center' : 'justify-end'}`}>
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
                      {quotations.map((quotation) => (
                        <label key={quotation.id} className="quotation-picker-item mb-1 flex items-center gap-2 rounded border border-transparent p-1.5 hover:border-slate-200 hover:bg-slate-50">
                          <input type="checkbox" checked={selectedQuotationIds.includes(quotation.id)} onChange={() => toggleQuotationSelection(quotation.id)} />
                          {quotation.number} - {quotation.name}
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="ml-auto grid gap-2 text-right text-xs text-slate-600 sm:grid-cols-3">
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="font-semibold text-slate-800">{purchaseRowsEnabled.length}</div>
                  <div>Inkopen: Ja</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="font-semibold text-slate-800">{purchaseRowsDisabled.length}</div>
                  <div>Inkopen: Nee</div>
                </div>
                <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="font-semibold text-slate-800">{specificationCount}</div>
                  <div>Specificaties totaal</div>
                </div>
              </div>
            </div>
          </section>

          <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}
              {purchaseRowsEnabled.length === 0 && purchaseRowsDisabled.length === 0 ? (
                <div className="rounded border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  Geen bestelregels gevonden binnen de huidige selectie.
                </div>
              ) : (
                <div className="space-y-4">
                  <section className="rounded border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold text-slate-800">Inkopen ({purchaseRowsEnabled.length})</h2>
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={isContainerFullySelected(purchaseRowsEnabled, true)}
                          onChange={(e) => setPurchaseEnabledForRow(purchaseRowsEnabled.flatMap((row) => row.sourceLineIds), e.target.checked ? true : false)}
                          disabled={!purchaseRowsEnabled.length}
                        />
                        <span>Alles selecteren</span>
                      </label>
                    </div>
                    {purchaseRowsEnabled.length ? (
                      <div className="space-y-3">
                        {purchaseRowsEnabledBySupplier.map((group) => (
                          <section key={group.label} className="rounded border border-slate-200 bg-white p-2">
                            <div className="mb-2 flex items-center justify-between">
                              <h3 className="text-xs font-semibold text-slate-700">{group.label}</h3>
                              <span className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] text-slate-600">
                                {group.rows.length} regel(s)
                              </span>
                            </div>
                            {renderPurchaseTable(group.rows, true)}
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded border border-dashed border-slate-300 bg-white px-3 py-5 text-center text-sm text-slate-600">
                        Geen regels met Inkopen = Ja.
                      </div>
                    )}
                  </section>
                  <section className="rounded border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold text-slate-800">Niet inkopen ({purchaseRowsDisabled.length})</h2>
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={isContainerFullySelected(purchaseRowsDisabled, false)}
                          onChange={(e) => setPurchaseEnabledForRow(purchaseRowsDisabled.flatMap((row) => row.sourceLineIds), e.target.checked ? false : true)}
                          disabled={!purchaseRowsDisabled.length}
                        />
                        <span>Alles selecteren</span>
                      </label>
                    </div>
                    {purchaseRowsDisabled.length ? (
                      renderPurchaseTable(purchaseRowsDisabled, false)
                    ) : (
                      <div className="rounded border border-dashed border-slate-300 bg-white px-3 py-5 text-center text-sm text-slate-600">
                        Geen regels met Inkopen = Nee.
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
            <div className="flex flex-none items-center justify-end gap-3 border-t border-slate-200 bg-white px-3 py-2">
              {saveFeedback ? (
                <span className={`text-sm ${saveFeedback.includes('opgeslagen') ? 'text-emerald-700' : 'text-rose-700'}`}>{saveFeedback}</span>
              ) : null}
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => void handleDownloadPdf()}
              >
                PDF downloaden
              </button>
              <button
                type="button"
                className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                onClick={() => void savePurchaseToggles()}
                disabled={!changedLineIds.length || saving || !prId}
              >
                {saving ? 'Opslaan...' : `Opslaan${changedLineIds.length ? ` (${changedLineIds.length})` : ''}`}
              </button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
