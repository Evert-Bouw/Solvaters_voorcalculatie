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

export function isKeyVaultConfigured() {
  return Boolean(getSecretClient()) && Boolean(process.env.AFAS_SECRET_APP_NAME?.trim());
}

export function getActiveEnvironmentNumberSecretName() {
  const appName = process.env.AFAS_SECRET_APP_NAME?.trim();
  if (!appName) throw new Error('AFAS_SECRET_APP_NAME ontbreekt.');
  return `afas-${appName}-active-environment-number`;
}

export function buildAfasScopedSecretName(environmentNumber: string, suffix: string) {
  const appName = process.env.AFAS_SECRET_APP_NAME?.trim();
  if (!appName) throw new Error('AFAS_SECRET_APP_NAME ontbreekt.');
  return `afas-${appName}-${environmentNumber.trim()}-${suffix}`;
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

export async function ensurePlaceholderSecret(secretName: string, tags?: Record<string, string>) {
  const current = await getSecretValue(secretName);
  if (current !== undefined) return;
  await setSecretValue(secretName, placeholderSecretValue, tags);
}

export async function listBootstrapSecretValues(environmentNumber: string) {
  const envNumber = environmentNumber.trim();
  if (!envNumber) return {};
  const suffixes = [
    'environment-id',
    'environment-type',
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
      const name = buildAfasScopedSecretName(envNumber, suffix);
      const value = await getSecretValue(name);
      return [suffix, isPlaceholderSecretValue(value) ? undefined : value] as const;
    }),
  );
  return Object.fromEntries(entries);
}
