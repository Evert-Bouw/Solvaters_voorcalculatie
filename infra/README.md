## Deploy Scope

Dit Bicep-template gaat uit van een bestaande:

- Resource Group
- Storage Account
- Key Vault

Het template maakt of beheert:

- App Service Plan
- Web App (backend)
- Static Web App (frontend)
- System-assigned managed identity op de Web App
- Key Vault Secrets Officer rol op de Key Vault voor de Web App identity
- Web App app settings voor `AZURE_KEY_VAULT_NAME` en `AFAS_SECRET_APP_NAME`

## Verwachte Key Vault Secrets

De backend gebruikt eerst dit centrale secret:

- `afas-<appnaam>-active-environment-number`

Dat verwijst naar de actieve AFAS-omgeving voor de app.

Daarna gebruikt de backend secrets met dit patroon:

- `afas-<appnaam>-<omgevingsnummer>-<doel>`

Verwachte doelen:

- `environment-id`
- `environment-type`
- `token`
- `publickey-secrets`
- `oauth-client-id`
- `oauth-client-secret`
- `encryption-key`
- `azure-table-storage-connection-string`

## Parameters

Gebruik [infra/parameters.example.json](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/infra/parameters.example.json) als startpunt.

Voor de volledige deploymentstappen en de Solvaters-waarden:

- [GITHUB_SETUP_SOLVATERS.md](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/GITHUB_SETUP_SOLVATERS.md)
