targetScope = 'resourceGroup'

@description('Azure region for new resources.')
param location string = resourceGroup().location

@description('Name of the App Service plan.')
param appServicePlanName string

@description('Name of the backend Web App.')
param webAppName string

@description('Name of the frontend Static Web App.')
param staticWebAppName string

@description('Name of the existing Key Vault.')
param keyVaultName string

@description('SKU for the App Service plan.')
@allowed([
  'B1'
  'S1'
  'P1v3'
])
param appServicePlanSku string = 'B1'

@description('Node runtime version for the backend Web App.')
param linuxFxVersion string = 'NODE|20-lts'

@description('Frontend URL allowed by backend CORS.')
param frontendAppUrl string = ''

@description('Name of the Key Vault secret that contains AFAS_ENVIRONMENT_ID.')
param afasEnvironmentIdSecretName string = 'AFAS-ENVIRONMENT-ID'

@description('Name of the Key Vault secret that contains AFAS_ENVIRONMENT_TYPE.')
param afasEnvironmentTypeSecretName string = 'AFAS-ENVIRONMENT-TYPE'

@description('Name of the Key Vault secret that contains AFAS_TOKEN.')
param afasTokenSecretName string = 'AFAS-TOKEN'

@description('Name of the Key Vault secret that contains AFAS_PUBLICKEY_SECRETS.')
param afasPublicKeySecretsSecretName string = 'AFAS-PUBLICKEY-SECRETS'

@description('Name of the Key Vault secret that contains AFAS_OAUTH_CLIENT_ID.')
param afasOauthClientIdSecretName string = 'AFAS-OAUTH-CLIENT-ID'

@description('Name of the Key Vault secret that contains AFAS_OAUTH_CLIENT_SECRET.')
param afasOauthClientSecretSecretName string = 'AFAS-OAUTH-CLIENT-SECRET'

@description('Name of the Key Vault secret that contains AFAS_ENCRYPTION_KEY.')
param afasEncryptionKeySecretName string = 'AFAS-ENCRYPTION-KEY'

@description('Name of the Key Vault secret that contains AZURE_TABLE_STORAGE_CONNECTION_STRING.')
param azureTableStorageConnectionStringSecretName string = 'AZURE-TABLE-STORAGE-CONNECTION-STRING'

@description('Optional override for the OAuth redirect URI. Leave empty to use https://<webapp>/api/afas/oauth/callback.')
param afasOauthRedirectUri string = ''

@description('Optional OAuth scope.')
param afasOauthScope string = ''

@description('Table name for pending OAuth state.')
param azureTableStorageOAuthStateTable string = 'AfasOAuthState'

@description('Table name for persisted OAuth sessions.')
param azureTableStorageOAuthSessionTable string = 'AfasOAuthSession'

var keyVaultSecretUriBase = 'https://${keyVaultName}.vault.azure.net/secrets'
var resolvedFrontendUrl = empty(frontendAppUrl) ? 'https://${staticWebAppName}.azurestaticapps.net' : frontendAppUrl
var resolvedOauthRedirectUri = empty(afasOauthRedirectUri) ? 'https://${webAppName}.azurewebsites.net/api/afas/oauth/callback' : afasOauthRedirectUri

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: appServicePlanSku
    tier: contains(['B1'], appServicePlanSku) ? 'Basic' : contains(['S1'], appServicePlanSku) ? 'Standard' : 'PremiumV3'
  }
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: linuxFxVersion
      alwaysOn: true
      appCommandLine: 'npm start'
      appSettings: [
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'AFAS_ENVIRONMENT_ID'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUriBase}/${afasEnvironmentIdSecretName})'
        }
        {
          name: 'AFAS_ENVIRONMENT_TYPE'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUriBase}/${afasEnvironmentTypeSecretName})'
        }
        {
          name: 'AFAS_TOKEN'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUriBase}/${afasTokenSecretName})'
        }
        {
          name: 'AFAS_PUBLICKEY_SECRETS'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUriBase}/${afasPublicKeySecretsSecretName})'
        }
        {
          name: 'AFAS_OAUTH_CLIENT_ID'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUriBase}/${afasOauthClientIdSecretName})'
        }
        {
          name: 'AFAS_OAUTH_CLIENT_SECRET'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUriBase}/${afasOauthClientSecretSecretName})'
        }
        {
          name: 'AFAS_ENCRYPTION_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUriBase}/${afasEncryptionKeySecretName})'
        }
        {
          name: 'AFAS_OAUTH_REDIRECT_URI'
          value: resolvedOauthRedirectUri
        }
        {
          name: 'AFAS_OAUTH_SCOPE'
          value: afasOauthScope
        }
        {
          name: 'AZURE_TABLE_STORAGE_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUriBase}/${azureTableStorageConnectionStringSecretName})'
        }
        {
          name: 'AZURE_TABLE_STORAGE_OAUTH_STATE_TABLE'
          value: azureTableStorageOAuthStateTable
        }
        {
          name: 'AZURE_TABLE_STORAGE_OAUTH_SESSION_TABLE'
          value: azureTableStorageOAuthSessionTable
        }
        {
          name: 'CORS_ORIGIN'
          value: resolvedFrontendUrl
        }
      ]
    }
  }
}

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    allowConfigFileUpdates: true
    enterpriseGradeCdnStatus: 'Disabled'
  }
}

resource keyVaultSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, webApp.id, 'KeyVaultSecretsUser')
  scope: keyVault
  properties: {
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

output webAppName string = webApp.name
output webAppDefaultHostname string = webApp.properties.defaultHostName
output staticWebAppName string = staticWebApp.name
output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
