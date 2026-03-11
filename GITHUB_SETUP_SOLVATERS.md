# GitHub Setup Solvaters

Dit project is voorbereid voor deployment via GitHub Actions naar Azure.

Bestaande Azure-resources:

- Abonnement: `Azure-abonnement-Solvaters`
- Resource Group: `Solvaters`
- Storage Account: `solvatersopslag`
- Key Vault: `solvaters-kluis`

## Volgorde

1. Push de repo naar GitHub.
2. Zet de GitHub secrets.
3. Zet de GitHub variables.
4. Controleer de Entra OIDC koppeling en rechten.
5. Start de workflow.
6. Open daarna de app-instellingen en vul `omgevingsnummer`, `omgevingstype` en `classic token` in.
7. Vul in Key Vault de overige placeholder-secrets met echte waarden.
8. Start de workflow nog een keer of herstart de Web App.

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

Deze moeten als `Repository variables` in GitHub komen:

- `AZURE_RESOURCE_GROUP=Solvaters`
- `AZURE_LOCATION=westeurope`
- `AZURE_APP_SERVICE_PLAN_NAME=solvaters-voorcalculatie-plan`
- `AZURE_WEBAPP_NAME=solvaters-voorcalculatie-api`
- `AZURE_STATIC_WEB_APP_NAME=solvaters-voorcalculatie-web`
- `AZURE_KEY_VAULT_NAME=solvaters-kluis`
- `AFAS_SECRET_APP_NAME=solvaters-voorcalculatie`
- `VITE_API_BASE_URL=https://solvaters-voorcalculatie-api.azurewebsites.net`

Deze variables juist niet aanmaken zolang je de defaults wilt gebruiken:

- `AZURE_FRONTEND_APP_URL`
- `AFAS_OAUTH_REDIRECT_URI`
- `AFAS_OAUTH_SCOPE`

## Eerste Workflow-run

Bij de eerste workflow-run gebeurt automatisch:

- uitrollen of bijwerken van `App Service Plan`, `Web App` en `Static Web App`
- toekennen van een schrijvende Key Vault-rol aan de Web App identity
- deployen van backend en frontend

Na deze eerste run open je de instellingenpagina van de app en vul je in:

- `omgevingsnummer`
- `omgevingstype`
- `classic token`

Bij opslaan schrijft de backend deze drie waarden naar Key Vault, zet hij het actieve omgevingsnummer vast en maakt hij automatisch de overige secret-namen aan met placeholder `__SET_REAL_VALUE__`.

## Key Vault Secrets

De backend gebruikt altijd eerst dit centrale secret:

- `afas-solvaters-voorcalculatie-active-environment-number`

Dat secret bepaalt welke AFAS-omgeving op dat moment actief is voor deze app.

Daarna horen bij dat omgevingsnummer deze secrets:

- `afas-solvaters-voorcalculatie-<omgevingsnummer>-environment-id`
- `afas-solvaters-voorcalculatie-<omgevingsnummer>-environment-type`
- `afas-solvaters-voorcalculatie-<omgevingsnummer>-token`
- `afas-solvaters-voorcalculatie-<omgevingsnummer>-publickey-secrets`
- `afas-solvaters-voorcalculatie-<omgevingsnummer>-oauth-client-id`
- `afas-solvaters-voorcalculatie-<omgevingsnummer>-oauth-client-secret`
- `afas-solvaters-voorcalculatie-<omgevingsnummer>-encryption-key`
- `afas-solvaters-voorcalculatie-<omgevingsnummer>-azure-table-storage-connection-string`

Aanbevolen invulling:

- `...-environment-id`: jullie AFAS omgeving-id
- `...-environment-type`: `production`, `test` of `accept`
- `...-token`: huidige classic token
- `...-publickey-secrets`: JSON zoals `{"<publickey>":"<secret>"}`
- `...-oauth-client-id`: AFAS OAuth client id
- `...-oauth-client-secret`: AFAS OAuth client secret
- `...-encryption-key`: sterke geheime sleutel voor app-level encryptie van OAuth tokens in Table Storage
- `...-azure-table-storage-connection-string`: connection string van `solvatersopslag`

Na opslaan in de instellingenpagina:

1. open `solvaters-kluis`
2. controleer dat `afas-solvaters-voorcalculatie-active-environment-number` op het ingevulde omgevingsnummer staat
3. zoek op `afas-solvaters-voorcalculatie-<omgevingsnummer>-`
4. vervang elke placeholder `__SET_REAL_VALUE__` door de echte secretwaarde

Belangrijk:

- verander je later in de app het `omgevingsnummer`, dan schrijft de backend automatisch een nieuwe secretset onder dat nieuwe nummer en werkt hij `afas-solvaters-voorcalculatie-active-environment-number` bij
- bestaande secrets onder oude omgevingsnummers worden niet automatisch hernoemd of verwijderd
- je hoeft dus niet handmatig Key Vault-namen "te fixen"; de app schakelt via het actieve-omgevingsnummer-secret naar de juiste set

## Entra ID / rechten

De GitHub OIDC app/service principal moet minimaal dit kunnen:

- deployments uitvoeren in resource group `Solvaters`
- Web App / Static Web App / App Service Plan aanmaken of bijwerken
- roltoewijzingen zetten op `solvaters-kluis`

Praktisch advies:

- geef de GitHub deployment identity `Contributor` op resource group `Solvaters`
- geef diezelfde identity `Administrator voor gebruikerstoegang` of gelijkwaardig als de workflow role assignments op `solvaters-kluis` moet zetten
- laat Bicep de Key Vault schrijfrechten voor de Web App identity regelen

## Checklist

- GitHub repo aangemaakt
- eerste push gedaan
- GitHub secrets ingevuld
- GitHub variables ingevuld
- Entra OIDC koppeling actief
- eerste workflow-run gedaan
- in de app-instellingen `omgevingsnummer`, `omgevingstype` en `classic token` opgeslagen
- placeholder secrets in `solvaters-kluis` vervangen door echte waarden
- tweede workflow-run gedaan of Web App herstart
