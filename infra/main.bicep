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

@description('Application name used in AFAS Key Vault secret naming.')
param afasSecretAppName string = 'solvaters-voorcalculatie'

@description('Optional override for the OAuth redirect URI. Leave empty to use https://<webapp>/api/afas/oauth/callback.')
param afasOauthRedirectUri string = ''

@description('Optional OAuth scope.')
param afasOauthScope string = ''

@description('Table name for pending OAuth state.')
param azureTableStorageOAuthStateTable string = 'AfasOAuthState'

@description('Table name for persisted OAuth sessions.')
param azureTableStorageOAuthSessionTable string = 'AfasOAuthSession'

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

var resolvedFrontendUrl = empty(frontendAppUrl) ? 'https://${staticWebApp.properties.defaultHostname}' : frontendAppUrl

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
          name: 'CORS_ORIGIN'
          value: resolvedFrontendUrl
        }
      ]
    }
  }
}

resource keyVaultSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, webApp.id, 'KeyVaultSecretsOfficer')
  scope: keyVault
  properties: {
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7')
  }
}

output webAppName string = webApp.name
output webAppDefaultHostname string = webApp.properties.defaultHostName
output staticWebAppName string = staticWebApp.name
output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
