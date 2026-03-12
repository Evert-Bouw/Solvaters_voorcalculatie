import { Buffer } from 'buffer';

export type AfasEnvironmentType = 'production' | 'test' | 'accept';
export type AfasRequestAuth =
  | { type: 'classic' }
  | { type: 'oauth_bearer'; accessToken: string };

type ConnectorFieldMap = Record<string, string | undefined>;

export type AfasConfig = {
  mode: 'afas';
  environmentId?: string;
  environmentType: AfasEnvironmentType;
  token?: string;
  connectors: {
    projects?: string;
    stages?: string;
    quotations?: string;
    quotationLines?: string;
    items?: string;
    creditors?: string;
    users?: string;
  };
  fields: {
    project: ConnectorFieldMap;
    stage: ConnectorFieldMap;
    quotation: ConnectorFieldMap;
    line: ConnectorFieldMap;
    item: ConnectorFieldMap;
    creditor: ConnectorFieldMap;
    user: ConnectorFieldMap;
  };
};

const defaultConnectorConfig = {
  projects: 'Solvaters_Projects',
  stages: 'Solvaters_Projectstage',
  quotations: 'Solvaters_Quotations',
  quotationLines: 'Solvaters_QuotationLines',
  items: 'Solvaters_Items',
  creditors: 'Solvaters_Creditor',
  users: 'Solvaters_Users',
} as const;

const defaultFieldConfig = {
  project: {
    id: 'ProjectId',
    name: 'Description',
  },
  stage: {
    id: 'ProjectStage',
    projectId: 'ProjectId',
    code: 'ProjectStage',
    name: 'Description',
    order: 'ProjectStage',
  },
  quotation: {
    id: 'QuotationId',
    projectId: 'ProjectId',
    number: 'QuotationId',
    name: 'QuotationDescription',
    order: 'QuotationId',
  },
  line: {
    id: 'SeqNo',
    projectId: 'ProjectId',
    quotationId: 'QuotationId',
    stageId: 'ProjectStage',
    order: 'order',
    lineType: 'LineType',
    itemCode: 'ItemCodeId',
    description: 'Description',
    supplier: 'CreditorId',
    supplierName: undefined,
    purchaseEnabled: 'PurchaseTrueFalse',
    baseQty: 'Qty',
    unit: 'UnitId',
    unitCost: 'CostPrice',
    purchasePrice: undefined,
    unitPrice: 'SalesPrice',
  },
  item: {
    code: 'ItemCode',
    description: 'Description',
    lineType: 'LineType',
    defaultUnit: 'UnitId',
    fixedLength: 'FxLength',
    fixedWidth: 'FxWidth',
    lengthWidthSpecCode: 'L_B_Spec_code',
    lengthWidthSpec: 'L_B_Spec',
    defaultUnitCost: 'DefaultCostPrice',
    defaultUnitPrice: 'DefaultSalesPrice',
    defaultPurchasePrice: 'DefaultPurchasePrice',
    preferredSupplierId: 'PreCreditorId',
    preferredSupplierName: 'PreCreditorName',
  },
  creditor: {
    id: 'CreditorId',
    name: 'CreditorName',
  },
  user: {
    id: 'UserId',
    personId: 'PersonId',
    employeeId: 'EmployeeId',
    name: 'Description',
  },
} as const;

function getEnv(name: string) {
  return process.env[name]?.trim() || undefined;
}

export function sanitizeAfasEnvironmentType(value?: string): AfasEnvironmentType {
  if (value === 'test' || value === 'accept') return value;
  return 'production';
}

function tryDecodeBase64(value: string) {
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    return decoded.trim() ? decoded : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeTokenValue(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith('AfasToken ')) {
    const base64Part = trimmed.slice('AfasToken '.length).trim();
    const decoded = tryDecodeBase64(base64Part);
    if (decoded?.includes('<token>')) return base64Part;
    return base64Part;
  }

  if (trimmed.includes('<token>')) {
    return Buffer.from(trimmed, 'utf8').toString('base64');
  }

  const decoded = tryDecodeBase64(trimmed);
  if (decoded?.includes('<token>')) {
    return trimmed;
  }

  const tokenDataMatch = trimmed.match(/<data>([^<]+)<\/data>/i);
  const tokenData = tokenDataMatch?.[1]?.trim() || trimmed;
  const xmlToken = `<token><version>1</version><data>${tokenData}</data></token>`;
  return Buffer.from(xmlToken, 'utf8').toString('base64');
}

function decodeTokenData(encodedToken?: string) {
  if (!encodedToken) return undefined;
  const decoded = tryDecodeBase64(encodedToken);
  const tokenDataMatch = decoded?.match(/<data>([^<]+)<\/data>/i);
  return tokenDataMatch?.[1]?.trim() || undefined;
}

export function getTokenPreview(value?: string) {
  const encodedToken = normalizeTokenValue(value);
  const tokenData = decodeTokenData(encodedToken);
  if (!tokenData) return '';
  if (tokenData.length <= 8) return tokenData;
  return `${tokenData.slice(0, 4)}...${tokenData.slice(-4)}`;
}

export function getAfasConfig(): AfasConfig {
  return {
    mode: 'afas',
    environmentId: getEnv('AFAS_ENVIRONMENT_ID'),
    environmentType: sanitizeAfasEnvironmentType(getEnv('AFAS_ENVIRONMENT_TYPE')),
    token: getEnv('AFAS_TOKEN'),
    connectors: {
      projects: getEnv('AFAS_CONNECTOR_PROJECTS') ?? defaultConnectorConfig.projects,
      stages: getEnv('AFAS_CONNECTOR_STAGES') ?? defaultConnectorConfig.stages,
      quotations: getEnv('AFAS_CONNECTOR_QUOTATIONS') ?? defaultConnectorConfig.quotations,
      quotationLines: getEnv('AFAS_CONNECTOR_QUOTATION_LINES') ?? defaultConnectorConfig.quotationLines,
      items: getEnv('AFAS_CONNECTOR_ITEMS') ?? defaultConnectorConfig.items,
      creditors: getEnv('AFAS_CONNECTOR_CREDITORS') ?? defaultConnectorConfig.creditors,
      users: getEnv('AFAS_CONNECTOR_USERS') ?? defaultConnectorConfig.users,
    },
    fields: {
      project: {
        id: getEnv('AFAS_FIELD_PROJECT_ID') ?? defaultFieldConfig.project.id,
        name: getEnv('AFAS_FIELD_PROJECT_NAME') ?? defaultFieldConfig.project.name,
      },
      stage: {
        id: getEnv('AFAS_FIELD_STAGE_ID') ?? defaultFieldConfig.stage.id,
        projectId: getEnv('AFAS_FIELD_STAGE_PROJECT_ID') ?? defaultFieldConfig.stage.projectId,
        code: getEnv('AFAS_FIELD_STAGE_CODE') ?? defaultFieldConfig.stage.code,
        name: getEnv('AFAS_FIELD_STAGE_NAME') ?? defaultFieldConfig.stage.name,
        order: getEnv('AFAS_FIELD_STAGE_ORDER') ?? defaultFieldConfig.stage.order,
      },
      quotation: {
        id: getEnv('AFAS_FIELD_QUOTATION_ID') ?? defaultFieldConfig.quotation.id,
        projectId: getEnv('AFAS_FIELD_QUOTATION_PROJECT_ID') ?? defaultFieldConfig.quotation.projectId,
        number: getEnv('AFAS_FIELD_QUOTATION_NUMBER') ?? defaultFieldConfig.quotation.number,
        name: getEnv('AFAS_FIELD_QUOTATION_NAME') ?? defaultFieldConfig.quotation.name,
        order: getEnv('AFAS_FIELD_QUOTATION_ORDER') ?? defaultFieldConfig.quotation.order,
      },
      line: {
        id: getEnv('AFAS_FIELD_LINE_ID') ?? defaultFieldConfig.line.id,
        projectId: getEnv('AFAS_FIELD_LINE_PROJECT_ID') ?? defaultFieldConfig.line.projectId,
        quotationId: getEnv('AFAS_FIELD_LINE_QUOTATION_ID') ?? defaultFieldConfig.line.quotationId,
        stageId: getEnv('AFAS_FIELD_LINE_STAGE_ID') ?? defaultFieldConfig.line.stageId,
        order: getEnv('AFAS_FIELD_LINE_ORDER') ?? defaultFieldConfig.line.order,
        lineType: getEnv('AFAS_FIELD_LINE_LINE_TYPE') ?? defaultFieldConfig.line.lineType,
        itemCode: getEnv('AFAS_FIELD_LINE_ITEM_CODE') ?? defaultFieldConfig.line.itemCode,
        description: getEnv('AFAS_FIELD_LINE_DESCRIPTION') ?? defaultFieldConfig.line.description,
        supplier: getEnv('AFAS_FIELD_LINE_SUPPLIER') ?? defaultFieldConfig.line.supplier,
        supplierName: getEnv('AFAS_FIELD_LINE_SUPPLIER_NAME'),
        purchaseEnabled: getEnv('AFAS_FIELD_LINE_PURCHASE_ENABLED') ?? defaultFieldConfig.line.purchaseEnabled,
        baseQty: getEnv('AFAS_FIELD_LINE_BASE_QTY'),
        unit: getEnv('AFAS_FIELD_LINE_UNIT') ?? defaultFieldConfig.line.unit,
        unitCost: getEnv('AFAS_FIELD_LINE_UNIT_COST'),
        purchasePrice: getEnv('AFAS_FIELD_LINE_PURCHASE_PRICE'),
        unitPrice: getEnv('AFAS_FIELD_LINE_UNIT_PRICE') ?? defaultFieldConfig.line.unitPrice,
      },
      item: {
        code: getEnv('AFAS_FIELD_ITEM_CODE') ?? defaultFieldConfig.item.code,
        description: getEnv('AFAS_FIELD_ITEM_DESCRIPTION') ?? defaultFieldConfig.item.description,
        lineType: getEnv('AFAS_FIELD_ITEM_LINE_TYPE') ?? defaultFieldConfig.item.lineType,
        defaultUnit: getEnv('AFAS_FIELD_ITEM_UNIT') ?? defaultFieldConfig.item.defaultUnit,
        fixedLength: getEnv('AFAS_FIELD_ITEM_FIXED_LENGTH') ?? defaultFieldConfig.item.fixedLength,
        fixedWidth: getEnv('AFAS_FIELD_ITEM_FIXED_WIDTH') ?? defaultFieldConfig.item.fixedWidth,
        lengthWidthSpecCode: getEnv('AFAS_FIELD_ITEM_LB_SPEC_CODE') ?? defaultFieldConfig.item.lengthWidthSpecCode,
        lengthWidthSpec: getEnv('AFAS_FIELD_ITEM_LB_SPEC') ?? defaultFieldConfig.item.lengthWidthSpec,
        defaultUnitCost: getEnv('AFAS_FIELD_ITEM_UNIT_COST') ?? defaultFieldConfig.item.defaultUnitCost,
        defaultUnitPrice: getEnv('AFAS_FIELD_ITEM_UNIT_PRICE') ?? defaultFieldConfig.item.defaultUnitPrice,
        defaultPurchasePrice: getEnv('AFAS_FIELD_ITEM_PURCHASE_PRICE') ?? defaultFieldConfig.item.defaultPurchasePrice,
        preferredSupplierId: getEnv('AFAS_FIELD_ITEM_PREFERRED_SUPPLIER_ID') ?? defaultFieldConfig.item.preferredSupplierId,
        preferredSupplierName: getEnv('AFAS_FIELD_ITEM_PREFERRED_SUPPLIER_NAME') ?? defaultFieldConfig.item.preferredSupplierName,
      },
      creditor: {
        id: getEnv('AFAS_FIELD_CREDITOR_ID') ?? defaultFieldConfig.creditor.id,
        name: getEnv('AFAS_FIELD_CREDITOR_NAME') ?? defaultFieldConfig.creditor.name,
      },
      user: {
        id: getEnv('AFAS_FIELD_USER_ID') ?? defaultFieldConfig.user.id,
        personId: getEnv('AFAS_FIELD_USER_PERSON_ID') ?? defaultFieldConfig.user.personId,
        employeeId: getEnv('AFAS_FIELD_USER_EMPLOYEE_ID') ?? defaultFieldConfig.user.employeeId,
        name: getEnv('AFAS_FIELD_USER_NAME') ?? defaultFieldConfig.user.name,
      },
    },
  };
}

function getEnvironmentSuffix(environmentType: AfasEnvironmentType) {
  if (environmentType === 'test') return 'resttest';
  if (environmentType === 'accept') return 'restaccept';
  return '';
}

export function getAfasBaseUrl(config: AfasConfig) {
  if (!config.environmentId) throw new Error('AFAS_ENVIRONMENT_ID ontbreekt.');
  const suffix = getEnvironmentSuffix(config.environmentType);
  const host = suffix
    ? `${config.environmentId}.${suffix}.afas.online`
    : `${config.environmentId}.rest.afas.online`;
  return `https://${host}/ProfitRestServices`;
}

export function getAfasHeaders(config: AfasConfig, auth: AfasRequestAuth = { type: 'classic' }) {
  if (auth.type === 'oauth_bearer') {
    if (!auth.accessToken.trim()) throw new Error('AFAS OAuth access token ontbreekt.');
    return {
      Authorization: `Bearer ${auth.accessToken.trim()}`,
      Accept: 'application/json',
    };
  }
  if (!config.token) throw new Error('AFAS_TOKEN ontbreekt.');
  const encodedToken = normalizeTokenValue(config.token);
  if (!encodedToken) throw new Error('AFAS_TOKEN kon niet genormaliseerd worden.');
  return {
    Authorization: `AfasToken ${encodedToken}`,
    Accept: 'application/json',
  };
}

function extractRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
  }
  if (!payload || typeof payload !== 'object') return [];
  const source = payload as Record<string, unknown>;
  const candidates = [source.rows, source.Rows, source.items, source.Items, source.value];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
    }
  }
  if (source.response && typeof source.response === 'object') {
    return extractRows(source.response);
  }
  return [];
}

export async function callAfas<T = unknown>(config: AfasConfig, path: string, init?: RequestInit, auth: AfasRequestAuth = { type: 'classic' }): Promise<T> {
  const url = `${getAfasBaseUrl(config)}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      ...getAfasHeaders(config, auth),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`AFAS request failed (${response.status}): ${message || response.statusText}`);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text.trim()) return undefined as T;
  return JSON.parse(text) as T;
}

export async function callAfasRaw(config: AfasConfig, path: string, init?: RequestInit, auth: AfasRequestAuth = { type: 'classic' }) {
  const url = `${getAfasBaseUrl(config)}${path.startsWith('/') ? path : `/${path}`}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      ...getAfasHeaders(config, auth),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`AFAS request failed (${response.status}): ${message || response.statusText}`);
  }
  return response;
}

type CreateAfasProjectStageInput = {
  projectId: string;
  code: string;
  name: string;
  chargeMode: '0' | '1' | '2';
};

type CreateAfasQuotationInput = {
  projectId: string;
  name: string;
  date?: string;
};

type UpdateAfasProjectStageInput = {
  projectId: string;
  stageCode: string;
  name: string;
  chargeMode: '0' | '1' | '2';
};

type UpdateAfasQuotationInput = {
  quotationId: string;
  name: string;
};

export async function createAfasProjectStage(config: AfasConfig, input: CreateAfasProjectStageInput, auth: AfasRequestAuth = { type: 'classic' }) {
  await callAfasRaw(config, '/connectors/PtProject/PtProjectStage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': 'nl-nl',
    },
    body: JSON.stringify({
      PtProject: {
        Element: {
          Fields: {
            PrId: input.projectId,
          },
          Objects: [
            {
              PtProjectStage: {
                Element: {
                  '@PrId': input.projectId,
                  '@PrSt': input.code,
                  Fields: {
                    Ds: input.name,
                    PsCh: input.chargeMode,
                  },
                },
              },
            },
          ],
        },
      },
    }),
  }, auth);
}

export async function createAfasQuotation(config: AfasConfig, input: CreateAfasQuotationInput, auth: AfasRequestAuth = { type: 'classic' }) {
  const quotationDate = input.date?.trim() || new Date().toISOString().slice(0, 10);
  const itemCodeField = config.fields.item.code ?? defaultFieldConfig.item.code;
  const itemLineTypeField = config.fields.item.lineType ?? defaultFieldConfig.item.lineType;
  const itemRows = await fetchConnectorRows(config, config.connectors.items ?? defaultConnectorConfig.items, {
    filterFieldId: itemCodeField,
    filterValue: 'T',
  });
  const exactTextItem =
    itemRows.find((row) => String(row[itemCodeField] ?? '').trim().toUpperCase() === 'T') ??
    itemRows[0];
  const textItemLineType = String(exactTextItem?.[itemLineTypeField] ?? '').trim() || '3';
  await callAfasRaw(config, '/connectors/KnQuotation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': 'nl-nl',
    },
    body: JSON.stringify({
      KnQuotation: {
        Element: {
          Fields: {
            QuDa: quotationDate,
            PrId: input.projectId,
            Ds: input.name,
          },
          Objects: [
            {
              KnQuotationLine: {
                Element: {
                  Fields: {
                    VaIt: textItemLineType,
                    ItCd: 'T',
                    Ds: 'Tekst',
                  },
                },
              },
            },
          ],
        },
      },
    }),
  }, auth);
}

export async function updateAfasProjectStage(config: AfasConfig, input: UpdateAfasProjectStageInput, auth: AfasRequestAuth = { type: 'classic' }) {
  await callAfasRaw(config, '/connectors/PtProject/PtProjectStage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': 'nl-nl',
    },
    body: JSON.stringify({
      PtProject: {
        Element: {
          Fields: {
            PrId: input.projectId,
          },
          Objects: [
            {
              PtProjectStage: {
                Element: {
                  '@PrId': input.projectId,
                  '@PrSt': input.stageCode,
                  Fields: {
                    '@Action': 'update',
                    Ds: input.name,
                    PsCh: input.chargeMode,
                  },
                },
              },
            },
          ],
        },
      },
    }),
  }, auth);
}

export async function updateAfasQuotation(config: AfasConfig, input: UpdateAfasQuotationInput, auth: AfasRequestAuth = { type: 'classic' }) {
  await callAfasRaw(config, '/connectors/KnQuotation', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': 'nl-nl',
    },
    body: JSON.stringify({
      KnQuotation: {
        Element: {
          Fields: {
            '@Action': 'update',
            QuId: input.quotationId,
            Ds: input.name,
          },
        },
      },
    }),
  }, auth);
}

export async function fetchConnectorRows(
  config: AfasConfig,
  connector: string,
  options?: { filterFieldId?: string; filterValue?: string },
) {
  const params = new URLSearchParams();
  params.set('skip', '-1');
  params.set('take', '-1');
  if (options?.filterFieldId && options.filterValue) {
    params.set('filterfieldids', options.filterFieldId);
    params.set('filtervalues', options.filterValue);
  }
  const query = params.toString();
  const payload = await callAfas(config, `/connectors/${encodeURIComponent(connector)}${query ? `?${query}` : ''}`);
  return extractRows(payload);
}

export async function probeAfas(config: AfasConfig) {
  const payload = await callAfas<Record<string, unknown>>(config, '/profitversion');
  return payload;
}

export async function fetchAfasMetainfo(config: AfasConfig) {
  return callAfas<Record<string, unknown>>(config, '/metainfo');
}

export async function fetchAfasGetConnectorMetainfo(config: AfasConfig, connector: string) {
  return callAfas<Record<string, unknown>>(config, `/metainfo/get/${encodeURIComponent(connector)}`);
}
