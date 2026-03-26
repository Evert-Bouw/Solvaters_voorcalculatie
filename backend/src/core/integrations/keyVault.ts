import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

const placeholderSecretValue = '__SET_REAL_VALUE__';

let secretClient: SecretClient | null = null;

function getKeyVaultUrl() {
  const explicitUrl = process.env.AZURE_KEY_VAULT_URL?.trim();
  if (explicitUrl) return explicitUrl;
  const keyVaultName = process.env.AZURE_KEY_VAULT_NAME?.trim();
  if (!keyVaultName) return '';
  return `https://${keyVaultName}.vault.azure.net`;
}

function getSecretClient() {
  const keyVaultUrl = getKeyVaultUrl();
  if (!keyVaultUrl) return null;
  if (!secretClient) {
    secretClient = new SecretClient(keyVaultUrl, new DefaultAzureCredential());
  }
  return secretClient;
}

function getAppSecretPrefix() {
  const appName = process.env.AFAS_SECRET_APP_NAME?.trim();
  if (!appName) throw new Error('AFAS_SECRET_APP_NAME ontbreekt.');
  return `afas-${appName}`;
}

export function isKeyVaultConfigured() {
  return Boolean(getSecretClient()) && Boolean(process.env.AFAS_SECRET_APP_NAME?.trim());
}

export function buildAfasSecretName(suffix: string) {
  return `${getAppSecretPrefix()}-${suffix.trim()}`;
}

export function isPlaceholderSecretValue(value?: string) {
  return !value?.trim() || value.trim() === placeholderSecretValue;
}

export async function getSecretValue(secretName: string) {
  const client = getSecretClient();
  if (!client) return undefined;
  try {
    const secret = await client.getSecret(secretName);
    return secret.value?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function setSecretValue(secretName: string, value: string, tags?: Record<string, string>) {
  const client = getSecretClient();
  if (!client) throw new Error('Azure Key Vault is niet geconfigureerd voor deze backend.');
  await client.setSecret(secretName, value, { tags });
}

export async function setPlaceholderSecretValue(secretName: string, tags?: Record<string, string>) {
  await setSecretValue(secretName, placeholderSecretValue, tags);
}

export async function ensurePlaceholderSecret(secretName: string, tags?: Record<string, string>) {
  const current = await getSecretValue(secretName);
  if (current !== undefined) return;
  await setPlaceholderSecretValue(secretName, tags);
}

export async function listBootstrapSecretValues() {
  const suffixes = [
    'token',
    'publickey-secrets',
    'oauth-client-id',
    'oauth-client-secret',
    'encryption-key',
    'azure-table-storage-connection-string',
    'bootstrap-admin-user-ids',
  ] as const;

  const entries = await Promise.all(
    suffixes.map(async (suffix) => {
      const value = await getSecretValue(buildAfasSecretName(suffix));
      return [suffix, isPlaceholderSecretValue(value) ? undefined : value] as const;
    }),
  );
  return Object.fromEntries(entries);
}
