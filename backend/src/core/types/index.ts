export type DataMode = 'afas';
export type AfasEnvironmentType = 'production' | 'test' | 'accept';
export type AfasWriteAuthMode = 'classic' | 'oauth_user';
export type UiThemeMode = 'standard' | 'standard_dark' | 'custom';

export interface ThemeColors {
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
}

export interface ContextEntitySettings {
  key: string;
  label: string;
  paramId: string;
  connectorName: string;
  idField: string;
  nameField: string;
  queryParamName: string;
}

export interface CoreSettings {
  dataMode: DataMode;
  writeAuthMode: AfasWriteAuthMode;
  contextEntity: ContextEntitySettings;
  uiThemeMode: UiThemeMode;
  uiColors: ThemeColors;
}

export interface AfasRuntimeConfig {
  environmentId: string;
  environmentType: AfasEnvironmentType;
}

export interface ParamIdOption {
  id: string;
  description: string;
  notes: string;
  paramId: string;
}

export interface ContextRecord {
  id: string;
  name: string;
  entityKey: string;
  entityLabel: string;
}

export interface IframeSessionProfile {
  sessionId: string;
  userId: string;
  personCode?: string;
  employeeId?: string;
  environmentId?: string;
  displayName?: string;
  lastSeenAt: string;
  raw?: unknown;
}

export interface AfasConnectionConfig {
  mode: DataMode;
  environmentId: string;
  environmentType: AfasEnvironmentType;
  hasToken: boolean;
  tokenPreview: string;
}

export interface AfasConnectionInput {
  mode?: DataMode;
  environmentId?: unknown;
  environmentType?: unknown;
  token?: unknown;
}

export interface AfasWriteAuthStatus {
  mode: AfasWriteAuthMode;
  oauthConfigured: boolean;
  oauthClientIdConfigured: boolean;
  oauthClientSecretConfigured: boolean;
  keyVaultConfigured: boolean;
  authenticated: boolean;
  displayName?: string;
  userId?: string;
  accessTokenExpiresAt?: string;
  message: string;
}

export type BootstrapBlockReason =
  | 'ready'
  | 'iframe_required'
  | 'classic_token_missing'
  | 'oauth_config_missing'
  | 'oauth_login_required';

export interface BootstrapStatus {
  ready: boolean;
  writeAuthMode: AfasWriteAuthMode;
  blockReason: BootstrapBlockReason;
  message: string;
  hasIframeSession: boolean;
  iframeUserId?: string;
  classicConfigured: boolean;
  oauthConfigured: boolean;
  oauthAuthenticated: boolean;
  settingsAllowed: boolean;
  bootstrapRequired: boolean;
  bootstrapAllowed: boolean;
}

export interface AfasUserDebugStatus {
  iframeSessionId?: string;
  userId: string;
  displayName: string;
  existsInProfitUsers: boolean;
  hasAdminRole: boolean;
  adminRoleCode: string;
  checkedAt: string;
}

export interface AfasConnectorFieldInfo {
  name: string;
  label?: string;
  type?: string;
  required?: boolean;
}

export interface AfasGetConnectorInfo {
  name: string;
  label?: string;
  description?: string;
  fields: AfasConnectorFieldInfo[];
  firstRow?: Record<string, unknown> | null;
  firstRowError?: string;
  metadata: unknown;
}

export interface AfasUpdateConnectorInfo {
  name: string;
  label?: string;
  description?: string;
  fields: AfasConnectorFieldInfo[];
  metadata: unknown;
}
