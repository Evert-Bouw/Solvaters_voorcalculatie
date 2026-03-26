import {
  AfasConfig,
  AfasRequestAuth,
  callAfas,
  fetchConnectorRows,
} from '../afas.js';
import {
  AfasConnectorFieldInfo,
  AfasGetConnectorInfo,
  AfasUpdateConnectorInfo,
} from '../types/index.js';

function readField(row: Record<string, unknown>, fieldName: string) {
  const value = row[fieldName];
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function readLooseString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return undefined;
}

function walkObjectArrays(
  payload: unknown,
  visit: (path: string[], rows: Array<Record<string, unknown>>) => void,
  path: string[] = [],
) {
  if (Array.isArray(payload)) {
    const objectRows = payload.filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
    );
    if (objectRows.length) visit(path, objectRows);
    payload.forEach((entry, index) => walkObjectArrays(entry, visit, [...path, String(index)]));
    return;
  }
  if (!payload || typeof payload !== 'object') return;
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    walkObjectArrays(value, visit, [...path, key]);
  }
}

function walkObjects(
  payload: unknown,
  visit: (path: string[], record: Record<string, unknown>) => void,
  path: string[] = [],
) {
  if (!payload || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((entry, index) => walkObjects(entry, visit, [...path, String(index)]));
    return;
  }
  const record = payload as Record<string, unknown>;
  visit(path, record);
  for (const [key, value] of Object.entries(record)) {
    walkObjects(value, visit, [...path, key]);
  }
}

function extractConnectorEntries(payload: unknown, mode: 'get' | 'update') {
  const found = new Map<string, { name: string; label?: string; description?: string }>();
  const modeHint = mode.toLowerCase();
  const source =
    payload && typeof payload === 'object'
      ? (
          mode === 'get'
            ? (payload as Record<string, unknown>).getConnectors
            : (payload as Record<string, unknown>).updateConnectors
        )
      : undefined;

  if (Array.isArray(source)) {
    source.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const row = entry as Record<string, unknown>;
      const name = readLooseString(row, ['id', 'Id', 'name', 'Name', 'connectorId', 'ConnectorId']);
      if (!name) return;
      found.set(name, {
        name,
        label: readLooseString(row, ['description', 'Description', 'label', 'Label']),
        description: readLooseString(row, ['description', 'Description', 'notes', 'Notes']),
      });
    });
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  }

  const remember = (name: string, row: Record<string, unknown>) => {
    if (found.has(name)) return;
    found.set(name, {
      name,
      label: readLooseString(row, ['description', 'Description', 'label', 'Label', 'caption', 'Caption']),
      description: readLooseString(row, ['description', 'Description', 'notes', 'Notes']),
    });
  };

  walkObjectArrays(payload, (path, rows) => {
    const pathHint = path.join('.').toLowerCase();
    const pathMatchesMode = pathHint.includes(modeHint);
    rows.forEach((row) => {
      const name = readLooseString(row, [
        'connectorId',
        'ConnectorId',
        'connectorID',
        'ConnectorID',
        'connectorName',
        'ConnectorName',
        'name',
        'Name',
        'id',
        'Id',
      ]);
      if (!name) return;

      const inferredMode =
        pathMatchesMode
          ? mode
          : name.toLowerCase().startsWith('get')
            ? 'get'
            : name.toLowerCase().startsWith('update') || name.toLowerCase().startsWith('upd')
              ? 'update'
              : '';
      if (inferredMode !== mode) return;
      remember(name, row);
    });
  });

  walkObjects(payload, (path, record) => {
    const pathHint = path.join('.').toLowerCase();
    const matchesMode = pathHint.includes(modeHint);
    if (!matchesMode) return;
    for (const [key, value] of Object.entries(record)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const name = key.trim();
      const inferredMode =
        name.toLowerCase().startsWith('get')
          ? 'get'
          : name.toLowerCase().startsWith('update') || name.toLowerCase().startsWith('upd')
            ? 'update'
            : matchesMode
              ? mode
              : '';
      if (inferredMode !== mode) continue;
      remember(name, value as Record<string, unknown>);
    }
  });

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

function extractFieldInfos(payload: unknown) {
  const fields = new Map<string, AfasConnectorFieldInfo>();
  if (payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).fields)) {
    ((payload as Record<string, unknown>).fields as unknown[]).forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const row = entry as Record<string, unknown>;
      const name = readLooseString(row, ['id', 'Id', 'fieldId', 'FieldId', 'name', 'Name']);
      if (!name) return;
      fields.set(name, {
        name,
        label: readLooseString(row, ['label', 'Label', 'description', 'Description']),
        type: readLooseString(row, ['dataType', 'DataType', 'type', 'Type']),
        required:
          readLooseString(row, ['mandatory', 'Mandatory', 'required', 'Required', 'isRequired', 'IsRequired']) ===
          'true',
      });
    });
  }
  walkObjectArrays(payload, (_path, rows) => {
    rows.forEach((row) => {
      const name = readLooseString(row, [
        'fieldId',
        'FieldId',
        'id',
        'Id',
        '@fieldId',
        '@FieldId',
        'name',
        'Name',
        'propertyName',
        'PropertyName',
      ]);
      if (!name) return;
      if (!fields.has(name)) {
        fields.set(name, {
          name,
          label: readLooseString(row, ['label', 'Label', 'description', 'Description', 'caption', 'Caption']),
          type: readLooseString(row, ['type', 'Type', 'dataType', 'DataType']),
          required:
            readLooseString(row, ['mandatory', 'Mandatory', 'required', 'Required', 'isRequired', 'IsRequired']) ===
            'true',
        });
      }
    });
  });
  walkObjects(payload, (path, record) => {
    const lastPath = path[path.length - 1]?.toLowerCase() || '';
    const name =
      readLooseString(record, [
        'fieldId',
        'FieldId',
        '@fieldId',
        '@FieldId',
        'name',
        'Name',
        'propertyName',
        'PropertyName',
      ]) || (lastPath && !['fields', 'properties', 'items', 'value'].includes(lastPath) ? path[path.length - 1] : '');
    if (!name) return;
    if (!fields.has(name)) {
      fields.set(name, {
        name,
        label: readLooseString(record, ['label', 'Label', 'description', 'Description', 'caption', 'Caption']),
        type: readLooseString(record, ['type', 'Type', 'dataType', 'DataType']),
        required:
          readLooseString(record, ['mandatory', 'Mandatory', 'required', 'Required', 'isRequired', 'IsRequired']) ===
          'true',
      });
    }
  });
  return [...fields.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

export async function fetchAfasGetConnectors(
  afasConfig: AfasConfig,
  auth: AfasRequestAuth = { type: 'classic' },
): Promise<AfasGetConnectorInfo[]> {
  const metainfoPayload = await callAfas<unknown>(afasConfig, '/metainfo', undefined, auth);
  const connectors = extractConnectorEntries(metainfoPayload, 'get');

  return Promise.all(
    connectors.map(async (connector) => {
      const metadata = await callAfas<unknown>(
        afasConfig,
        `/Metainfo/get/${encodeURIComponent(connector.name)}`,
        undefined,
        auth,
      );
      let firstRow: Record<string, unknown> | null = null;
      let firstRowError: string | undefined;
      try {
        firstRow = (
          await fetchConnectorRows(
            afasConfig,
            connector.name,
            {
              skip: 0,
              take: 1,
            },
            auth,
          )
        )[0] ?? null;
      } catch (error) {
        firstRowError = (error as Error).message;
      }

      return {
        name: connector.name,
        label: connector.label,
        description: connector.description,
        fields: extractFieldInfos(metadata),
        firstRow,
        firstRowError,
        metadata,
      } satisfies AfasGetConnectorInfo;
    }),
  );
}

export async function fetchAfasUpdateConnectors(
  afasConfig: AfasConfig,
  auth: AfasRequestAuth = { type: 'classic' },
): Promise<AfasUpdateConnectorInfo[]> {
  const metainfoPayload = await callAfas<unknown>(afasConfig, '/metainfo', undefined, auth);
  const connectors = extractConnectorEntries(metainfoPayload, 'update');

  return Promise.all(
    connectors.map(async (connector) => {
      const metadata = await callAfas<unknown>(
        afasConfig,
        `/Metainfo/update/${encodeURIComponent(connector.name)}`,
        undefined,
        auth,
      );
      return {
        name: connector.name,
        label: connector.label,
        description: connector.description,
        fields: extractFieldInfos(metadata),
        metadata,
      } satisfies AfasUpdateConnectorInfo;
    }),
  );
}

export async function fetchContextRecord(args: {
  afasConfig: AfasConfig;
  context: {
    key: string;
    label: string;
    connectorName: string;
    idField: string;
    nameField: string;
  };
  recordId: string;
  auth?: AfasRequestAuth;
}) {
  const { afasConfig, context, recordId, auth = { type: 'classic' } } = args;
  const rows = await fetchConnectorRows(
    afasConfig,
    context.connectorName,
    {
      filterFieldId: context.idField,
      filterValue: recordId,
      operatorType: 1,
    },
    auth,
  );

  const row =
    rows.find((entry) => readField(entry, context.idField).toLowerCase() === recordId.trim().toLowerCase()) ?? rows[0];
  if (!row) throw new Error(`${context.label} ${recordId} is niet gevonden.`);

  return {
    id: readField(row, context.idField) || recordId,
    name: readField(row, context.nameField),
    entityKey: context.key,
    entityLabel: context.label,
  };
}
