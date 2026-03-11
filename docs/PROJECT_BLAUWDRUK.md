# Project Blauwdruk - Voorcalculatie MVP

## 1. Projectoverzicht
- **Projectnaam:** `Solvaters Voorcalculatie MVP`
- **Doel in 1 zin:** Voorcalculatieregels per project beheren met fases, opslagen en totalen, iframe-ready.
- **Doelgroep:** Calculators, werkvoorbereiders, projectleiding.
- **MVP scope:** Regels/fases beheren, berekeningen, instellingen, mock API per `PrId`, classic-only connectiemodel.
- **Buiten scope (nu nog niet):** Echte AFAS connectorcalls, persistente database, autorisatie per gebruiker.

## 2. Functionele eisen
### Kernfuncties
1. Regels beheren met aantallen, prijzen, kostprijzen en opslagen.
2. Fases beheren met fase-opslagen en totalen.
3. Instellingen beheren voor kolommen, fasegebruik en classic connectie.

### Gebruikersflow
1. Open app met `?PrId=<projectnummer>`.
2. Bekijk/wijzig regels en fases, inclusief totalen.
3. Sla instellingen en classic connectie op.

### Acceptatiecriteria
- Aantal/Kosten/Bedrag worden direct en correct herberekend.
- Fase- en regelkolommen reageren op instellingen.
- Backend levert project-gescheiden data op basis van `prId`.

## 3. Technische architectuur
### Structuur
- `frontend/`: UI, state, routing, API-client
- `backend/`: mock API, validatie, in-memory opslag
- `docs/`: projectblauwdruk
- root: scripts, gedeelde config

### Waarom gescheiden frontend/backend
- Secrets/token blijven backend-only.
- Frontend en backend los deploybaar.
- AFAS integratielaag kan backend-side vervangen worden zonder UI-herschrijving.

## 4. Frontend ontwerp
### Stack
- Framework: React
- Build tool: Vite
- Styling: Tailwind CSS
- State: React hooks

### Structuur
- `src/pages/`
- `src/components/`
- `src/utils/`
- `src/api/`
- `src/types/`

### Richtlijnen
- API-calls centraal in `src/api/client.ts`.
- Loading state aanwezig.
- Responsive basislayout.

## 5. Backend ontwerp
### Stack
- Runtime: Node.js
- Framework: Express
- Datalaag: in-memory per `prId`

### Structuur
- `src/index.ts`
- `src/data/`
- `src/types/`

### Richtlijnen
- Input sanitization op numerieke velden.
- Health endpoint beschikbaar via `/api/health`.

## 6. API contracten
### Endpoints
- `GET /api/health`
- `GET/POST /api/settings`
- `GET/POST /api/classic-config`
- `GET/POST/PUT /api/phases`
- `GET/POST/PUT/DELETE /api/lines`
- `GET /api/items`

### Request/response afspraken
- `prId` query parameter verplicht voor projectgebonden endpoints.
- IDs zijn UUIDs.
- Numerieke velden backend-side gevalideerd naar `>= 0`.

## 7. Configuratie en beveiliging
### Environment variables
- Backend:
  - `CORS_ORIGIN`
  - `AFAS_ENCRYPTION_KEY` (voor echte encryptie in productie)
- Frontend:
  - `VITE_API_BASE_URL`

### Security basis
- Geen classic token in frontend storage.
- Token wordt backend-side verwerkt en opgeslagen.

## 8. Lokale ontwikkelsetup
### Vereisten
- Node versie: moderne LTS
- Package manager: npm

### Commands
- Installeren: `npm install` + `npm install --prefix frontend` + `npm install --prefix backend`
- Beide starten: `npm run dev`
- Alleen frontend: `npm run dev:frontend`
- Alleen backend: `npm run dev:backend`
- Build: `npm run build`

## 9. CI/CD (target)
- Backend deploy op wijzigingen in `backend/**`.
- Frontend deploy op wijzigingen in `frontend/**`.
- Secrets/variables volgens technische richtlijn.

## 10. Teststrategie
### Minimaal
- Typecheck frontend/backend
- Build check
- Handmatige kernflow test (`P000123`)

## 11. Operationeel beheer
- Health endpoint periodiek monitoren.
- Fouten/logging via backend runtime logs.

## 12. Opleverchecklist
- [x] Frontend/backend gescheiden
- [x] Configuratie via env vars voorbereid
- [x] Health endpoint werkt
- [x] Kernflow aanwezig
- [x] Classic connectiemodel toegevoegd

## 13. Projectspecifieke notities
- Classic tokenopslag is in deze MVP mock-versleuteld en in-memory.
- Backend is voorbereid om mock data later te vervangen door AFAS calls.
