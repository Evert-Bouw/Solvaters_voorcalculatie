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
- `AFAS_SECRET_APP_NAME`
- `AFAS_SECRET_ENVIRONMENT_NUMBER`
- `AZURE_FRONTEND_APP_URL`
- `AFAS_OAUTH_REDIRECT_URI`
- `AFAS_OAUTH_SCOPE`
- `VITE_API_BASE_URL`

### Required Azure setup

- An Entra ID app or federated identity credential for GitHub OIDC
- Contributor rights on the target resource group
- Rights to read Key Vault secrets and manage deployments in the resource group

The workflow creates or updates the Web App, App Service plan and Static Web App, then deploys backend and frontend.
It also creates missing Key Vault secret names with placeholder value `__SET_REAL_VALUE__`, so you only need to replace the values afterward.

Required Key Vault secrets for the backend include at least:

- `afas-<appnaam>-<omgevingsnummer>-environment-id`
- `afas-<appnaam>-<omgevingsnummer>-environment-type`
- `afas-<appnaam>-<omgevingsnummer>-token`
- `afas-<appnaam>-<omgevingsnummer>-publickey-secrets`
- `afas-<appnaam>-<omgevingsnummer>-oauth-client-id`
- `afas-<appnaam>-<omgevingsnummer>-oauth-client-secret`
- `afas-<appnaam>-<omgevingsnummer>-encryption-key`
- `afas-<appnaam>-<omgevingsnummer>-azure-table-storage-connection-string`
