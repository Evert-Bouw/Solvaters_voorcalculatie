targetScope = 'resourceGroup'

var location = 'westeurope'

@description('No-op parameter kept so the same parameters file can drive the infra workflow.')
param resourceGroupName string = ''

@description('Application slug used in resource names and Key Vault secret names.')
param afasSecretAppName string = 'solvaters-basis-app'

@description('Globally unique name for the Key Vault created for this app.')
param keyVaultName string

@description('Globally unique name for the Storage Account created for this app.')
param storageAccountName string

@description('Optional override for the App Service plan name. Leave empty to derive from afasSecretAppName.')
param appServicePlanName string = ''

@description('Optional override for the backend Web App name. Leave empty to derive from afasSecretAppName.')
param webAppName string = ''

@description('Optional override for the frontend Static Web App name. Leave empty to derive from afasSecretAppName.')
param staticWebAppName string = ''

@description('SKU for the App Service plan.')
@allowed([
  'B1'
  'S1'
  'P1v3'
])
param appServicePlanSku string = 'B1'

@description('Node runtime version for the backend Web App.')
param linuxFxVersion string = 'NODE|24-lts'

@description('Optional override for the OAuth redirect URI. Leave empty to use https://<webapp>/api/afas/oauth/callback.')
param afasOauthRedirectUri string = ''

@description('Optional OAuth scope.')
param afasOauthScope string = ''

@description('Optional frontend API base URL used by the frontend deployment workflow. This parameter is stored alongside infra settings but is not used by the Bicep template itself.')
param frontendApiBaseUrl string = ''

@description('Optional JSON object with extra frontend build variables for the frontend deployment workflow. This parameter is stored alongside app settings but is not used by the Bicep template itself.')
param frontendBuildVariables string = '{}'

@description('Optional backend session-flow debug toggle. Leave false in normal production use.')
param debugSessionFlow string = 'false'

@description('Optional explicit table name for pending OAuth state. Leave empty to use the default table name.')
param azureTableStorageOAuthStateTable string = ''

@description('Optional explicit table name for persisted OAuth sessions. Leave empty to use the default table name.')
param azureTableStorageOAuthSessionTable string = ''

@description('Optional explicit table name for persisted iFrame sessions and code mappings. Leave empty to use the default table name.')
param azureTableStorageIframeTable string = ''

@description('Optional explicit table name for persisted app settings. Leave empty to use the default table name.')
param azureTableStorageAppSettingsTable string = ''

@description('Optional override for the Key Vault secret name that stores the backend session secret. Leave empty to derive from afasSecretAppName.')
param sessionSecretSecretName string = ''

@description('Optional extra allowed frontend origins for backend CORS, comma-separated. Leave empty to allow only the Azure-generated Static Web App hostname.')
param additionalCorsOrigins string = ''

@description('Comma-separated list of allowed parent origins for embedding this app via iframe.')
param allowedFrameAncestors string = 'https://*.afasinsite.nl,https://*.insitetest.afas.online,https://*.insiteaccept.afas.online,https://*.outsitetijdelijk.afas.online,https://*.outsitetest.afas.online,https://*.outsiteaccept.afas.online,https://*.solvatersapps.nl'

var resolvedAppServicePlanName = empty(appServicePlanName) ? '${afasSecretAppName}-plan' : appServicePlanName
var resolvedWebAppName = empty(webAppName) ? '${afasSecretAppName}-api' : webAppName
var resolvedStaticWebAppName = empty(staticWebAppName) ? '${afasSecretAppName}-web' : staticWebAppName
var resolvedOauthRedirectUri = empty(afasOauthRedirectUri) ? 'https://${resolvedWebAppName}.azurewebsites.net/api/afas/oauth/callback' : afasOauthRedirectUri
var resolvedSessionSecretSecretName = empty(sessionSecretSecretName) ? 'afas-${afasSecretAppName}-session-secret' : sessionSecretSecretName

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    accessTier: 'Hot'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enabledForDeployment: false
    enabledForTemplateDeployment: false
    enabledForDiskEncryption: false
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: resolvedAppServicePlanName
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

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: resolvedStaticWebAppName
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

var resolvedFrontendUrl = 'https://${staticWebApp.properties.defaultHostname}'
var resolvedCorsOrigins = empty(additionalCorsOrigins) ? resolvedFrontendUrl : '${resolvedFrontendUrl},${additionalCorsOrigins}'

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: resolvedWebAppName
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
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'AZURE_KEY_VAULT_NAME'
          value: keyVaultName
        }
        {
          name: 'AFAS_SECRET_APP_NAME'
          value: afasSecretAppName
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
          name: 'AZURE_TABLE_STORAGE_OAUTH_STATE_TABLE'
          value: azureTableStorageOAuthStateTable
        }
        {
          name: 'AZURE_TABLE_STORAGE_OAUTH_SESSION_TABLE'
          value: azureTableStorageOAuthSessionTable
        }
        {
          name: 'AZURE_TABLE_STORAGE_IFRAME_TABLE'
          value: azureTableStorageIframeTable
        }
        {
          name: 'AZURE_TABLE_STORAGE_APP_SETTINGS_TABLE'
          value: azureTableStorageAppSettingsTable
        }
        {
          name: 'CORS_ORIGIN'
          value: resolvedCorsOrigins
        }
        {
          name: 'ALLOWED_FRAME_ANCESTORS'
          value: allowedFrameAncestors
        }
        {
          name: 'SESSION_SECRET'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=${resolvedSessionSecretSecretName})'
        }
        {
          name: 'DEBUG_SESSION_FLOW'
          value: debugSessionFlow
        }
      ]
    }
  }
}

resource keyVaultSecretsOfficerRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, webApp.id, 'KeyVaultSecretsOfficer')
  scope: keyVault
  properties: {
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
  }
}

output location string = location
output resourceGroupName string = resourceGroup().name
output webAppName string = webApp.name
output webAppDefaultHostname string = webApp.properties.defaultHostName
output staticWebAppName string = staticWebApp.name
output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
output keyVaultName string = keyVault.name
output storageAccountName string = storageAccount.name
output sessionSecretSecretName string = resolvedSessionSecretSecretName
