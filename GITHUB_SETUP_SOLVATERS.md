# GitHub Setup Solvaters

Dit project is voorbereid voor deployment via GitHub Actions naar Azure.

Huidige bestaande Azure-resources:

- Abonnement: `Azure-abonnement-Solvaters`
- Resource Group: `Solvaters`
- Storage Account: `solvatersopslag`
- Key Vault: `solvaters-kluis`

## Stap 1: repo naar GitHub zetten

Gebruik deze repo als eerste uploadbasis. Voor de eerste push heb je alleen nodig:

1. Maak een lege GitHub-repository aan, bijvoorbeeld `solvaters-voorcalculatie`.
2. Zorg dat je geen lokale `.env` bestanden mee commit.
3. Push deze projectmap naar GitHub.

Belangrijke bestanden voor de eerste push:

- `.github/workflows/deploy.yml`
- `.github/README.md`
- `infra/main.bicep`
- `infra/README.md`
- `backend/.env.example`
- `frontend/.env.example`

## GitHub Secrets

Deze moeten als `Repository secrets` in GitHub komen:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Toelichting:

- `AZURE_CLIENT_ID`: van de Entra ID app / service principal voor GitHub OIDC
- `AZURE_TENANT_ID`: tenant-id van jullie Entra omgeving
- `AZURE_SUBSCRIPTION_ID`: subscription-id van `Azure-abonnement-Solvaters`

## GitHub Variables

Deze moeten als `Repository variables` in GitHub komen.

Aanbevolen invulling voor jullie omgeving:

- `AZURE_RESOURCE_GROUP=Solvaters`
- `AZURE_LOCATION=westeurope`
- `AZURE_APP_SERVICE_PLAN_NAME=solvaters-voorcalculatie-plan`
- `AZURE_WEBAPP_NAME=solvaters-voorcalculatie-api`
- `AZURE_STATIC_WEB_APP_NAME=solvaters-voorcalculatie-web`
- `AZURE_KEY_VAULT_NAME=solvaters-kluis`
- `AFAS_SECRET_APP_NAME=solvaters-voorcalculatie`
- `AFAS_SECRET_ENVIRONMENT_NUMBER=93567`
- `AZURE_FRONTEND_APP_URL=`
- `AFAS_OAUTH_REDIRECT_URI=`
- `AFAS_OAUTH_SCOPE=`
- `VITE_API_BASE_URL=https://solvaters-voorcalculatie-api.azurewebsites.net`

Toelichting:

- Laat `AZURE_FRONTEND_APP_URL` eerst leeg. De Bicep-template vult dan standaard `https://<static-web-app-name>.azurestaticapps.net` in voor backend CORS.
- Laat `AFAS_OAUTH_REDIRECT_URI` eerst leeg. De Bicep-template gebruikt dan standaard `https://<web-app-name>.azurewebsites.net/api/afas/oauth/callback`.
- `AFAS_OAUTH_SCOPE` is optioneel en mag leeg blijven zolang AFAS geen extra scope vereist.

## Key Vault Secrets

Deze secrets moeten in `solvaters-kluis` aanwezig zijn.

Verwachte secret-namen volgens het schaalbare patroon:

- `afas-solvaters-voorcalculatie-93567-environment-id`
- `afas-solvaters-voorcalculatie-93567-environment-type`
- `afas-solvaters-voorcalculatie-93567-token`
- `afas-solvaters-voorcalculatie-93567-publickey-secrets`
- `afas-solvaters-voorcalculatie-93567-oauth-client-id`
- `afas-solvaters-voorcalculatie-93567-oauth-client-secret`
- `afas-solvaters-voorcalculatie-93567-encryption-key`
- `afas-solvaters-voorcalculatie-93567-azure-table-storage-connection-string`

Aanbevolen invulling:

- `...-environment-id`: jullie AFAS omgeving-id
- `...-environment-type`: `production` of `test`
- `...-token`: huidige classic token
- `...-publickey-secrets`: JSON zoals `{"<publickey>":"<secret>"}`
- `...-oauth-client-id`: AFAS OAuth client id
- `...-oauth-client-secret`: AFAS OAuth client secret
- `...-encryption-key`: sterke geheime sleutel voor app-level encryptie van OAuth access/refresh tokens in Table Storage
- `...-azure-table-storage-connection-string`: connection string van `solvatersopslag`

## Entra ID / rechten

De GitHub OIDC app/service principal moet minimaal dit kunnen:

- deployments uitvoeren in resource group `Solvaters`
- Web App / Static Web App / App Service Plan aanmaken of bijwerken
- roltoewijzingen zetten op `solvaters-kluis`
- secrets lezen uit `solvaters-kluis` hoeft niet voor GitHub Actions zelf, wel voor de Web App identity na deployment

Praktisch advies:

- geef de GitHub deployment identity `Contributor` op resource group `Solvaters`
- laat Bicep de Key Vault rol voor de Web App identity regelen

## Wat de workflow daarna doet

Bij push naar `main`:

1. build backend
2. build frontend
3. login op Azure via OIDC
4. deploy infra met Bicep
5. deploy backend naar Web App
6. haal Static Web App deployment token op
7. deploy frontend naar Static Web App

## Eerste run checklist

Voor de eerste echte deployment:

- GitHub repo aangemaakt
- eerste push gedaan
- GitHub secrets ingevuld
- GitHub variables ingevuld
- Key Vault secrets ingevuld
- Entra OIDC koppeling actief

Als dat staat, kun je de workflow handmatig starten via `workflow_dispatch` of gewoon pushen naar `main`.
