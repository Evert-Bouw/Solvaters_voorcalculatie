# Solvaters Voorcalculatie App

React/Vite frontend en Express backend voor voorcalculatie, bestellen, AFAS-koppeling en gebruik binnen een AFAS iFrame.

## Inhoud

- [Overzicht](#overzicht)
- [Techniek](#techniek)
- [Installatie](#installatie)
- [Configuratie](#configuratie)
- [GitHub Deploy](#github-deploy)
- [Starten](#starten)
- [Builden](#builden)
- [Gebruik in AFAS iFrame](#gebruik-in-afas-iframe)
- [Voorcalculatie](#voorcalculatie)
- [Bestellen](#bestellen)
- [Instellingen](#instellingen)
- [Sneltoetsen](#sneltoetsen)
- [Datamodel en AFAS-gedrag](#datamodel-en-afas-gedrag)
- [API-endpoints](#api-endpoints)
- [Bekende aandachtspunten](#bekende-aandachtspunten)

## Overzicht

De app bestaat uit drie hoofdschermen:

- `/` voorcalculatiebeheer
- `/bestellen` besteloverzicht
- `/settings` app- en AFAS-instellingen

Belangrijkste mogelijkheden:

- projecten, fases en voorcalculaties uit AFAS laden
- regels inline bewerken, toevoegen, dupliceren, verwijderen en verplaatsen
- fase- en projectstructuren beheren
- meerdere regels tegelijk slepen/verplaatsen
- qty- en kostprijs-calculators gebruiken met memo-opslag voor reproduceerbaarheid
- vrije opslagkolommen en vrije opslagregels configureren
- verborgen fase-opslagregels automatisch laten materialiseren naar AFAS
- bestelregels aggregeren, groeperen op leverancier en als PDF exporteren
- AFAS iFrame-context gebruiken voor projectcontext en gebruikerscontext
- locks op voorcalculaties toepassen bij iFrame-methode 1
- standaard en donkere modus ondersteunen

## Techniek

Stack:

- frontend: React 18, TypeScript, Vite, Tailwind
- backend: Express, TypeScript
- PDF-export: `jspdf` + `jspdf-autotable`

Repo-structuur:

- `frontend/` React-app
- `backend/` Express API en AFAS-koppeling

## Installatie

```bash
npm install
npm install --prefix frontend
npm install --prefix backend
```

## Configuratie

### Frontend

Maak `frontend/.env`:

```bash
VITE_API_BASE_URL=http://localhost:3001
```

### Backend

1. Kopieer `backend/.env.example` naar `backend/.env`
2. Vul minimaal deze waardes:

- `AFAS_ENVIRONMENT_ID`
- `AFAS_ENVIRONMENT_TYPE` (`production`, `test`, `accept`)
- `AFAS_TOKEN`

Voor schrijven via `OAuth namens gebruiker` zijn daarnaast nodig:

- `AFAS_OAUTH_CLIENT_ID`
- `AFAS_OAUTH_CLIENT_SECRET`
- `AFAS_OAUTH_REDIRECT_URI`
- optioneel: `AFAS_OAUTH_SCOPE`
- `AFAS_ENCRYPTION_KEY`

Voor persistente OAuth-sessies in Azure Table Storage:

- `AZURE_TABLE_STORAGE_CONNECTION_STRING`
- optioneel: `AZURE_TABLE_STORAGE_OAUTH_STATE_TABLE`
- optioneel: `AZURE_TABLE_STORAGE_OAUTH_SESSION_TABLE`

3. Voor AFAS iFrame methode 1:

- `AFAS_PUBLICKEY_SECRETS={"<publickey>":"<secret>"}`

4. Controleer daarna connectornamen en veldmappingen in `backend/.env`

Belangrijke backend-variabelen:

- AFAS-verbinding:
  - `AFAS_ENVIRONMENT_ID`
  - `AFAS_ENVIRONMENT_TYPE`
  - `AFAS_TOKEN`
  - `AFAS_OAUTH_CLIENT_ID`
  - `AFAS_OAUTH_CLIENT_SECRET`
  - `AFAS_OAUTH_REDIRECT_URI`
  - `AFAS_OAUTH_SCOPE`
  - `AFAS_ENCRYPTION_KEY`
  - `AZURE_TABLE_STORAGE_CONNECTION_STRING`
  - `AZURE_TABLE_STORAGE_OAUTH_STATE_TABLE`
  - `AZURE_TABLE_STORAGE_OAUTH_SESSION_TABLE`
  - `AFAS_PUBLICKEY_SECRETS`
- connectoren:
  - `AFAS_CONNECTOR_PROJECTS`
  - `AFAS_CONNECTOR_STAGES`
  - `AFAS_CONNECTOR_QUOTATIONS`
  - `AFAS_CONNECTOR_QUOTATION_LINES`
  - `AFAS_CONNECTOR_ITEMS`
- veldmappingen:
  - projectvelden
  - fasevelden
  - voorcalculatievelden
  - regelvelden
  - itemvelden

## GitHub Deploy

De repo is ingericht voor deployment via GitHub Actions met Azure OIDC, Bicep en de nieuwe `core` + `app` infra-opzet.

Gebruik voor de volledige setup en de exacte Solvaters-waarden:

- [GITHUB_SETUP_SOLVATERS.md](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/GITHUB_SETUP_SOLVATERS.md)

Technische bronnen:

- deploy infra: [.github/workflows/deploy-infra.yml](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/.github/workflows/deploy-infra.yml)
- deploy backend: [.github/workflows/deploy-backend.yml](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/.github/workflows/deploy-backend.yml)
- deploy frontend: [.github/workflows/deploy-frontend.yml](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/.github/workflows/deploy-frontend.yml)
- infra core: [infra/core/main.bicep](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/infra/core/main.bicep)
- GitHub bootstrapnotities: [.github/README.md](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/.github/README.md)
- infra-notities: [infra/README.md](/c:/Users/EvertBouwSolvatersBV/Downloads/Solvaters_voorcalculatie/infra/README.md)

Samenvatting:

- `Deploy Infra` rolt `App Service Plan`, `Web App`, `Static Web App`, `Key Vault` en `Storage Account` uit of werkt ze bij
- de publieke `Static Web App`-url wordt door Azure bepaald en hoeft niet op de resourcenaam te lijken
- de frontend wordt in GitHub Actions gebouwd en daarna als `frontend/dist` naar `Static Web Apps` geüpload
- de Web App krijgt `AZURE_KEY_VAULT_NAME` en `AFAS_SECRET_APP_NAME` als app settings en leest/schrijft daarna zelf Key Vault secrets via managed identity
- in de instellingenpagina vul je `omgevingsnummer`, `omgevingstype` en `classic token` in; de backend schrijft die naar Key Vault, zet `afas-<appnaam>-active-environment-number` en maakt de overige app-specifieke secret-namen als placeholder `__SET_REAL_VALUE__` aan
- daarna hoeven alleen de resterende echte secretwaarden nog in `Key Vault` ingevuld te worden
- de standaard AFAS OAuth redirect-URL is `https://solvaters-voorcalculatie-api.azurewebsites.net/api/afas/oauth/callback`, tenzij `AFAS_OAUTH_REDIRECT_URI` expliciet is gezet
- de GitHub deployment identity heeft minimaal `Contributor` op resource group `Solvaters` en `Administrator voor gebruikerstoegang` of gelijkwaardig voor de Key Vault role assignment nodig

## Starten

Alles tegelijk:

```bash
npm run dev
```

Losse processen:

```bash
npm run dev:frontend
npm run dev:backend
```

Standaard urls:

- frontend: `http://localhost:5173`
- backend: `http://localhost:3001`

## Builden

Volledige build:

```bash
npm run build
```

Alleen frontend:

```bash
npm --prefix frontend run build
```

Alleen backend:

```bash
npm --prefix backend run build
```

## Gebruik in AFAS iFrame

De app ondersteunt twee integratievormen.

### Methode 1: token exchange + gebruikerscontext

Verwachte queryparameters:

- `tokenurl`
- `code`
- `publickey`
- `sessionid`

Gedrag:

- frontend roept de backend aan om de one-time code om te wisselen
- backend gebruikt `AFAS_PUBLICKEY_SECRETS`
- de app onthoudt de iFrame-sessie
- de gebruiker wordt zichtbaar in de UI
- quotation locks worden actief gebruikt

### Methode 2: alleen projectcontext

Typisch via `PrId` of soortgelijke projectparameter in de URL.

Gedrag:

- project wordt uit de URL gelezen
- projectkeuze verdwijnt uit de header
- de app werkt zonder gebruikerssessie
- lock-mechanisme is dan niet leidend

### Lokaal testen via publieke HTTPS-url

Voor AFAS iFrame is een publieke HTTPS-url nodig. Een bestaande route in dit project is:

```bash
ssh -i "C:\Users\EvertBouwSolvatersBV\.ssh\localhostrun_key2" -o StrictHostKeyChecking=no -R 80:localhost:5173 localhost.run
```

Gebruik de gegenereerde `https://...` url in AFAS.

## Voorcalculatie

### Project, fases en voorcalculaties

De voorcalculatiepagina is de hoofdwerkplek voor calculatiebeheer.

Projectcontext:

- projectselectie op basis van AFAS-projecten
- `BIB` wordt apart gebruikt voor bibliotheekfunctionaliteit
- als `PrId` via URL/iFrame is meegegeven, wordt het project gefixeerd en verdwijnt de projectdropdown
- de header toont altijd het actieve project

Fases:

- linker fasepaneel is inklapbaar
- fases zijn individueel filterbaar
- `Alle fases` toggle aanwezig
- regels zonder fase worden getoond onder `Geen fase`
- nieuwe fase aanmaken vanuit de UI
- fase charge mode instelbaar:
  - `0` conform project
  - `1` nacalculatie doorbelasten
  - `2` nacalculatie niet doorbelasten

Voorcalculaties:

- meerdere voorcalculaties tegelijk selecteren via dropdown met checkboxen
- selector wordt verborgen als er maar 1 voorcalculatie is
- nieuwe voorcalculatie aanmaken
- containers per voorcalculatie in- en uitklapbaar
- globale knop voor alles in- en uitklappen
- per voorcalculatie 3-puntenmenu met acties zoals kopie maken en naam wijzigen

Bibliotheek:

- optioneel rechterpaneel met bibliotheekproject
- bibliotheekquotations zijn sleepbaar
- sleep een bibliotheekvoorcalculatie naar een doelgroep om regels toe te voegen
- bibliotheekpaneel is inklapbaar

### Regels en tabel

De voorcalculatieregels worden inline beheerd.

Ondersteunde acties:

- regel toevoegen
- regel dupliceren
- regel verwijderen
- regel verplaatsen binnen een fase
- regel verplaatsen tussen fases
- regel verplaatsen binnen een voorcalculatie zonder fase
- meerdere regels tegelijk slepen

Velden en gedrag:

- itemcode en itemomschrijving
- inkopen ja/nee
- leverancier
- eenheid
- basis aantal
- berekend aantal
- kostprijs
- inkoopprijs
- verkoopprijs
- regelopslagen `M1..M10` afhankelijk van instellingen

Tabelgedrag:

- kolomvolgorde volgt de instellingen
- zichtbaarheid van kolommen volgt de instellingen
- compacte vaste schaal van `0.75`
- containerdriehoeken gebruiken overal dezelfde UI-stijl (`▾` / `▸`)

### Item- en leverancierselectie

Itemselectie:

- typen in itemveld zoekt via AFAS-items
- dropdown toont code en omschrijving
- keuze van item vult relevante defaults
- standaard L/B en specs worden meegenomen waar beschikbaar

Leveranciersselectie:

- typen in leverancierveld zoekt via AFAS-crediteuren
- dropdown toont id en naam
- keuze wordt op de onderliggende regels weggeschreven

### Qty-calculator

De qty-calculator ondersteunt meetregels en reproduceerbare memo-opslag.

Gedrag:

- calculator opent alleen als het type regel daarvoor geschikt is
- mode afhankelijk van item/eenheid:
  - `m1`
  - `m2`
  - `m3`
- met `Enter` in de popup wordt direct toegepast
- handmatig overschrijven van basis aantal wist de opgeslagen qty-formule
- memo-opslag maakt de berekening later opnieuw uitleesbaar

### Kostprijs-calculator

Optioneel via instellingen.

Gedrag:

- meerdere rekenregels mogelijk
- operatoren zoals optellen, aftrekken en percentages
- `Enter` in de popup voert direct door
- handmatige wijziging van kostprijs wist de memo-gestuurde berekening

### Opslagen

Er zijn twee soorten opslagen:

- vrije opslagkolommen op regelniveau
- vrije opslagregels op fase-/groepsniveau

Vrije opslagkolommen:

- configureerbaar als `M1..M10`
- basis en invoervorm configureerbaar
- zichtbaar of verborgen via instellingen

Vrije opslagregels:

- worden per fase/groep opgebouwd
- worden bij opslaan als echte AFAS-regels gematerialiseerd
- blijven reproduceerbaar via memo-data
- bestaande opslagregels worden leidend uit AFAS teruggelezen
- bestaande opslagregels behouden hun bestaande AFAS-identiteit en artikelinformatie
- opslagregels zijn niet inkoopbaar
- opslagregels behouden hun eigen `lineType`
- in de UI worden ze voor `Inkopen` behandeld zoals tekstregels

### Slepen en multi-select

Regels kunnen direct worden versleept via het handvat in de actiekolom.

Ondersteund:

- drag & drop binnen dezelfde voorcalculatie
- tussen fases
- naar het einde van een fasegroep
- naar groepen zonder fase

Multi-select:

- `Ctrl + klik` of `Cmd + klik` op het drag-handvat toggelt selectie van een regel
- daarna kun je de selectie in één keer slepen
- de actieve selectie krijgt een visuele highlight
- de selectie wordt na afronden van de sleepactie leeggemaakt

### Opslaan en locks

Opslaan:

- app verwerkt create/update/delete in één saveflow
- dubbele save-aanroepen worden tegengehouden in de frontend
- na opslaan worden regels opnieuw geladen

Locks:

- actief bij iFrame methode 1
- locks worden per voorcalculatie opgeëist
- heartbeat houdt locks levend
- locks worden vrijgegeven bij verlaten van de pagina
- conflictstatus wordt in de UI verwerkt

## Bestellen

De bestelpagina bouwt een besteloverzicht op basis van de geselecteerde voorcalculatieregels.

### Selectie en filtering

- zelfde projectcontext als de voorcalculatiepagina
- projectselector verdwijnt als project via URL/iFrame is vastgezet
- fasefilter links
- multi-select voor voorcalculaties
- regels worden gescheiden in:
  - `Inkopen`
  - `Niet inkopen`

Niet-inkoopbare regels:

- `lineType 3` wordt niet ingekocht
- verborgen fase-opslagregels worden ook niet ingekocht

### Aggregatie

De app groepeert regels tot bestelregels.

Per bestelregel:

- code
- omschrijving
- leverancier
- eenheid
- totaal
- aantal bronregels
- unieke delen / specificaties

Extra gedrag:

- `Inkopen` checkbox per gegroepeerde bestelregel
- bulkselectie per blok
- leverancier op gegroepeerde regel overschrijven
- wijzigingen worden teruggeschreven naar alle onderliggende regels

### Theoretisch en geoptimaliseerd

Per bestelregel kan tussen twee berekeningswijzen worden gewisseld:

- `Theoretisch`
- `Geoptimaliseerd`

Toelichting staat als tooltip op:

- het `i`-icoon
- de knoppen zelf

#### Theoretisch

Bedoeld als eenvoudige handelsmaat-benadering zonder indeling.

Berekening:

- `m1`: totale benodigde lengte / standaard handelslengte
- `m2`: totale benodigde oppervlakte / standaard plaatoppervlakte

#### Geoptimaliseerd

Bedoeld als praktische besteloptimalisatie op basis van bekende maten.

`m1`:

- snijlengtes worden verdeeld over handelslengtes
- resultaat toont besteld aantal, benutting, rest en compact snijplan

`m2`:

- rechthoekige delen worden pragmatisch op platen ingedeeld
- resultaat toont besteld aantal platen, benutting, rest en compact plaatplan

Belangrijk:

- dit is een praktische greedy-optimalisatie, geen mathematisch perfecte nesting-engine

### Detailblokken

Per bestelregel kunnen details worden in- of uitgeklapt via de driehoekknop.

Verberg/tonen:

- het berekeningsblok
- de tabel met stukken/specificaties

In de totaalcel:

- hoofdwaarde staat normaal
- berekend aantal stuks staat daaronder cursief

### PDF-export

De bestelpagina kan een PDF downloaden.

Eigenschappen van de export:

- titel: `Besteloverzicht`
- indeling per leverancierblok
- kolom `Inkooprelatie` staat niet per regel in de PDF, omdat de PDF al per leverancier groepeert
- secundaire optimalisatie-/stukinformatie wordt kleiner afgedrukt dan de hoofdregel
- export bevat ook de extra theoretische of geoptimaliseerde berekeningsinformatie

### Donkere modus

Voor de bestelpagina is donkere modus specifiek afgestemd op:

- bestel-tabellen
- inline specificatietabellen
- hoverstaten
- actie-elementen
- betere contrasten voor blauwe en groene informatieteksten

## Instellingen

De instellingenpagina beheert zowel appgedrag als AFAS-configuratie.

### AFAS verbinding

Bevat:

- omgevings-id
- omgevingstype
- classic token
- schrijfmethode voor mutaties: `Classic token` of `OAuth namens gebruiker`
- tokenstatus
- iFrame session-id
- iFrame user-id
- weergave van de bekende iFrame-gebruiker

Belangrijk:

- classic token blijft backend-only
- frontend ziet alleen status en preview
- lezen blijft altijd via classic token
- schrijven volgt de globale app-instelling
- bij `OAuth namens gebruiker` moet de huidige browser eerst via AFAS aangemeld zijn
- als `AZURE_TABLE_STORAGE_CONNECTION_STRING` is ingevuld, worden OAuth states en gebruikerssessies persistent in Azure Table Storage opgeslagen
- access en refresh tokens in Table Storage worden extra versleuteld met `AFAS_ENCRYPTION_KEY`
- zonder die storage-config valt de backend automatisch terug op in-memory OAuth-opslag

### Functionele schakelaars

- werken met fases
- bibliotheekpaneel tonen
- kostprijs calculator tonen

### Kolomvolgorde tabel

Hier beheer je:

- zichtbaarheid van standaardkolommen
- zichtbaarheid van vrije opslagkolommen
- volgorde van kolommen
- instellingen per vrije opslagkolom

Per vrije opslagkolom configureerbaar:

- zichtbaar ja/nee
- basis
- invoervorm
- itemcode
- omschrijving
- AFAS-id
- voorkeurwaarde

### Vrije regel opslagen

Hier beheer je:

- zichtbaarheid van vrije opslagregels
- volgorde van `M1..M10`
- basis
- invoervorm
- itemcode
- omschrijving
- AFAS-id
- voorkeurwaarde

### Regelveld koppeling AFAS

Toont het overzicht van appvelden versus AFAS-koppelingen.

Mogelijkheden:

- status per veld zien
- vereiste en optionele mapping onderscheiden
- slot open/dicht zetten per wijzigbaar veld
- AFAS-veld-id handmatig invullen
- standaardwaardes automatisch laten invullen

### Kleur instellingen

Ondersteund:

- `Standaard`
- `Standaard (donkere modus)`
- `Custom`

Bij `Custom` zijn kleurpickers beschikbaar voor onder meer:

- appachtergrond
- paneelachtergrond
- subtiele achtergronden
- randen
- primaire tekst
- secundaire tekst

## Sneltoetsen

Voorcalculatie:

- `Alt + +` voegt een regel toe in de actieve/gehoverde groep
- `Alt + C` dupliceert de actieve/gehoverde regel
- `Alt + Delete` verwijdert de actieve/gehoverde regel

Regelinvoer:

- in `Basis aantal`: toets `C` opent de qty-calculator als die voor de regel beschikbaar is

Calculatorpopups:

- `Enter` voert de calculator direct door

Sleepselectie:

- `Ctrl + klik` of `Cmd + klik` op het handvat selecteert of deselecteert een regel voor multi-drag

## Datamodel en AFAS-gedrag

### Databron

- de app werkt met AFAS als bron
- backend normalizeert het tokengebruik
- frontend gaat via de backend-API

### Memo-velden

De app gebruikt memo-opslag om berekeningen reproduceerbaar te houden.

Toegepast voor:

- qty-formules
- kostformules
- fase-opslagregels

### Fase-opslagregels

Gedrag:

- worden als echte AFAS-regels opgeslagen
- bestaande regels worden vanuit AFAS teruggelezen en bijgewerkt
- artikelcode/omschrijving/eenheid van bestaande opslagregels blijven intact
- alleen de reproduceerbare waarden worden bijgewerkt
- nieuwe opslagregels gebruiken de actuele instellingen als default

### Niet-inkoopbare regels

De app behandelt deze regels als niet inkoopbaar:

- tekstregels (`lineType 3`)
- fase-opslagregels op basis van memo `phase_markup_line`

## API-endpoints

Belangrijkste backend-endpoints:

- `GET /api/health`
- `GET /api/afas/status`
- `GET /api/afas/config`
- `POST /api/afas/config`
- `GET /api/afas/write-auth-status`
- `GET /api/afas/oauth/start`
- `GET /api/afas/oauth/callback`
- `POST /api/afas/oauth/logout`
- `GET /api/afas/metainfo`
- `GET /api/afas/metainfo/get/:connector`
- `GET /api/projects`
- `GET /api/projects/:projectId`
- `PUT /api/projects/:projectId`
- `GET /api/projects/:projectId/stages`
- `POST /api/projects/:projectId/stages`
- `PUT /api/projects/:projectId/stages/:stageId`
- `GET /api/projects/:projectId/quotations`
- `POST /api/projects/:projectId/quotations`
- `PUT /api/projects/:projectId/quotations/:quotationId`
- `GET /api/projects/:projectId/quotation-lines`
- `POST /api/projects/:projectId/quotation-lines/save`
- `GET /api/items?query=...`
- `GET /api/creditors?query=...`
- `POST /api/iframe/exchange`
- `GET /api/iframe/session/:sessionId`
- `POST /api/locks/claim`
- `POST /api/locks/heartbeat`
- `POST /api/locks/release`
- `GET /api/locks/:projectId/:quotationId`
- `GET /api/settings`
- `POST /api/settings`
- `GET /api/quotation-line-field-mappings`

## Bekende aandachtspunten

- `TOKEN_ALREADY_RETRIEVED`: de one-time AFAS-code is al gebruikt. Open de app opnieuw vanuit AFAS.
- projectcontext via URL verbergt de projectselector bewust.
- zonder geldige standaardmaat kan optimalisatie op de bestelpagina terugvallen op de theoretische methode.
- `Geoptimaliseerd` voor `m2` is een praktische benadering, geen volledige nesting-optimizer.
- bestaande opslagregels moeten AFAS-leidend blijven; forceer geen nieuwe artikelcode of eenheid op een bestaande opslagregel.
