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
- Key Vault Secrets User rol op de Key Vault voor de Web App identity
- Web App app settings inclusief Key Vault references

## Verwachte Key Vault Secrets

Standaard bouwt het template secret-namen op met dit patroon:

- `afas-<appnaam>-<omgevingsnummer>-<doel>`

Voorbeeld:

- `afas-solvaters-voorcalculatie-93567-token`

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

Gebruik `infra/parameters.example.json` als startpunt en maak daar een eigen parametersbestand van buiten Git of met omgevingsspecifieke waarden.
