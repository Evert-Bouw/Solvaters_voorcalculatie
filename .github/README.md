## GitHub Actions bootstrap

### GitHub Secrets

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

### GitHub Variables

- `AZURE_RESOURCE_GROUP`
- `AZURE_LOCATION`
- `AZURE_APP_SERVICE_PLAN_NAME`
- `AZURE_WEBAPP_NAME`
- `AZURE_STATIC_WEB_APP_NAME`
- `AZURE_KEY_VAULT_NAME`
- `AZURE_FRONTEND_APP_URL`
- `AFAS_OAUTH_REDIRECT_URI`
- `AFAS_OAUTH_SCOPE`
- `VITE_API_BASE_URL`

### Required Azure setup

- An Entra ID app or federated identity credential for GitHub OIDC
- Contributor rights on the target resource group
- Rights to read Key Vault secrets and manage deployments in the resource group

The workflow creates or updates the Web App, App Service plan and Static Web App, then deploys backend and frontend.

Required Key Vault secrets for the backend include at least:

- `AFAS-ENVIRONMENT-ID`
- `AFAS-ENVIRONMENT-TYPE`
- `AFAS-TOKEN`
- `AFAS-PUBLICKEY-SECRETS`
- `AFAS-OAUTH-CLIENT-ID`
- `AFAS-OAUTH-CLIENT-SECRET`
- `AFAS-ENCRYPTION-KEY`
- `AZURE-TABLE-STORAGE-CONNECTION-STRING`
