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

- `AFAS-ENVIRONMENT-ID`
- `AFAS-ENVIRONMENT-TYPE`
- `AFAS-TOKEN`
- `AFAS-PUBLICKEY-SECRETS`
- `AFAS-OAUTH-CLIENT-ID`
- `AFAS-OAUTH-CLIENT-SECRET`
- `AFAS-ENCRYPTION-KEY`
- `AZURE-TABLE-STORAGE-CONNECTION-STRING`

## Parameters

Gebruik `infra/parameters.example.json` als startpunt en maak daar een eigen parametersbestand van buiten Git of met omgevingsspecifieke waarden.
