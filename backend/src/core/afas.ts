import { Buffer } from 'buffer';
import { AfasEnvironmentType } from './types/index.js';

export type AfasRequestAuth =
  | { type: 'classic' }
  | { type: 'oauth_bearer'; accessToken: string };

export interface AfasConfig {
  mode: 'afas';
  environmentId?: string;
  environmentType: AfasEnvironmentType;
  token?: string;
  usersConnector?: string;
  userIdField?: string;
  userNameField?: string;
}

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
    return trimmed.slice('AfasToken '.length).trim() || undefined;
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
    usersConnector: getEnv('AFAS_CONNECTOR_USERS') || 'Profit_Users',
    userIdField: getEnv('AFAS_FIELD_USER_ID') || 'UserId',
    userNameField: getEnv('AFAS_FIELD_USER_NAME') || 'Description',
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

function getAfasHeaders(config: AfasConfig, auth: AfasRequestAuth = { type: 'classic' }) {
  if (auth.type === 'oauth_bearer') {
    if (!auth.accessToken.trim()) throw new Error('AFAS OAuth access token ontbreekt.');
    return {
      Authorization: `Bearer ${auth.accessToken.trim()}`,
      Accept: 'application/json',
      'Accept-Language': 'nl-nl',
      'Content-Type': 'application/json',
    };
  }

  const encodedToken = normalizeTokenValue(config.token);
  if (!encodedToken) throw new Error('AFAS_TOKEN ontbreekt.');
  return {
    Authorization: `AfasToken ${encodedToken}`,
    Accept: 'application/json',
    'Accept-Language': 'nl-nl',
    'Content-Type': 'application/json',
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

export async function callAfas<T = unknown>(
  config: AfasConfig,
  path: string,
  init?: RequestInit,
  auth: AfasRequestAuth = { type: 'classic' },
): Promise<T> {
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

export async function fetchConnectorRows(
  config: AfasConfig,
  connector: string,
  options?: { filterFieldId?: string; filterValue?: string; operatorType?: number; skip?: number; take?: number },
  auth: AfasRequestAuth = { type: 'classic' },
) {
  const params = new URLSearchParams();
  params.set('skip', String(options?.skip ?? -1));
  params.set('take', String(options?.take ?? -1));
  if (options?.filterFieldId && options.filterValue) {
    params.set('filterfieldids', options.filterFieldId);
    params.set('filtervalues', options.filterValue);
    params.set('operatortypes', String(options?.operatorType ?? 1));
  }
  const query = params.toString();
  const payload = await callAfas(
    config,
    `/connectors/${encodeURIComponent(connector)}${query ? `?${query}` : ''}`,
    undefined,
    auth,
  );
  return extractRows(payload);
}

export async function probeAfas(config: AfasConfig, auth: AfasRequestAuth = { type: 'classic' }) {
  return callAfas<Record<string, unknown>>(config, '/profitversion', undefined, auth);
}
