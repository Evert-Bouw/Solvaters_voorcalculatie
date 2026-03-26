## Deploy Scope

Deze infra-opzet volgt dezelfde scheiding als de basisrepo:

- `infra/core/main.bicep`: gedeelde generieke infra
- `infra/app/parameters.example.json`: app-specifiek voorbeeld
- `infra/app/parameters.prod.json`: app-specifieke productieparameters

Per app-instance maakt deze opzet in `westeurope` aan:

- Resource Group
- Storage Account
- Key Vault
- App Service Plan
- backend Web App
- frontend Static Web App

De backend krijgt daarnaast:

- een system-assigned managed identity
- `Key Vault Secrets Officer` rechten op de eigen Key Vault
- app settings voor `AZURE_KEY_VAULT_NAME`, `AFAS_SECRET_APP_NAME`, `CORS_ORIGIN` en optionele tabelnamen
- een Key Vault reference voor `SESSION_SECRET`

## Parameters

Gebruik als startpunt:

- [infra/app/parameters.example.json](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/infra/app/parameters.example.json)

Voor deze app staat een eerste invulling in:

- [infra/app/parameters.prod.json](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/infra/app/parameters.prod.json)

Het generieke Bicep-template staat in:

- [infra/core/main.bicep](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/infra/core/main.bicep)

Voor de volledige deploymentstappen en de Solvaters-waarden:

- [GITHUB_SETUP_SOLVATERS.md](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/GITHUB_SETUP_SOLVATERS.md)
