# HealthTracker

Persoonlijk dashboard dat wekelijkse hardloopdata uit **Strava** combineert met dagelijkse gezondheidsdata uit **Apple Health** (via de iOS-app **Health Auto Export**), zodat je op één plek trends kan zien — en er later AI-advies bovenop kan bouwen.

## Waarom dit bestaat

De gebruiker loopt ongeveer één keer per week (Strava is daarvoor de bron), maar draagt dagelijks een Apple Watch die veel meer gezondheidsdata verzamelt (rust-hartslag, HRV, slaap, stappen, VO2 max, actieve energie). Apple biedt geen cloud-API voor die HealthKit-data — de enige praktische weg naar een eigen backend is een iOS-app die de data automatisch exporteert. Het idee is dat de dagelijkse gezondheidsdata context geeft aan de wekelijkse run: was je uitgerust, hoe was je herstel, is er een patroon tussen slaap/HRV en hoe de run voelde.

## Stack

| Onderdeel | Keuze | Waarom |
|---|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Tailwind v4) | Eén repo voor frontend én API-routes |
| Hosting | Vercel | Automatische deploys vanaf GitHub, ingebouwde cron |
| Database | Neon (serverless Postgres), geprovisioned via Vercel Storage | Geen eigen server nodig, gratis tier ruim genoeg voor 1 gebruiker |
| ORM | Drizzle ORM (`drizzle-orm/neon-http`) | Lichtgewicht, type-safe, werkt goed met Neon's HTTP-driver |
| Grafieken | Recharts | Eenvoudige React-integratie voor de trendlijnen |
| Databronnen | Strava API (OAuth2) + Health Auto Export (iOS-app, custom REST-export) | Strava heeft een goede publieke API; Apple Health heeft dat niet, dus Health Auto Export overbrugt dat |

## Functionaliteit

- **Afgeschermde single-user toegang** — dashboardpagina's en handmatige acties vereisen een login; sessies worden ondertekend en in een HttpOnly-cookie bewaard.
- **Strava-koppeling** — OAuth-autorisatie met `state`-controle, daarna haalt een dagelijkse cronjob of de knop in het dashboard de volledige runhistorie op.
- **Inzichtendashboard** (`/`) — gewicht, VO2max, tempo, recente runs en voorzichtige regelgebaseerde observaties over herstel en prestaties.
- **Runs-dashboard** (`/runs`) — totale afstand, gemiddeld tempo, gemiddelde hartslag en hoogtemeters; bereikfilter, trendgrafieken en volledige tabel.
- **Detailpagina per run** (`/runs/[id]`) — alle metrics van één activiteit, met link naar Strava.
- **Dagelijkse gezondheidsdata** — rust-hartslag, HRV, slaap, stappen, VO2max, actieve energie en gewicht, gevuld door Health Auto Export.

## Architectuur in het kort

```
┌─────────────┐   OAuth2    ┌──────────────────┐
│   Strava     │◄───────────►│  /api/strava/*   │
└─────────────┘   REST API  └────────┬─────────┘
                                      │
┌──────────────────┐   REST POST     │        ┌────────────┐
│ Health Auto Export│───────────────►│  Drizzle ORM  │──────►│   Neon DB   │
│  (iOS, dagelijks) │  /api/health/  │                │      └────────────┘
└──────────────────┘   ingest        │                        │
                                      │                        │
                              ┌───────▼────────┐               │
                              │  Next.js pages  │◄──────────────┘
                              │  (/ en /runs)   │
                              └────────────────┘
```

## Setup vanaf nul

### 0. Applicatietoegang

Genereer twee sterke, verschillende waarden en zet ze lokaal én in Vercel:

```bash
openssl rand -base64 24   # APP_PASSWORD (minimaal 16 tekens)
openssl rand -base64 32   # SESSION_SECRET (minimaal 32 tekens)
```

Zonder beide waarden blijft de applicatie fail-closed: er kan dan niet worden ingelogd.

### 1. Database (Neon via Vercel)
1. Maak een Vercel-project van deze repo (**Add New → Project**, importeer vanaf GitHub).
2. Ga naar **Storage → Create Database → Neon** en koppel 'm aan het project. Zet als **Custom Environment Variable Prefix** `DATABASE`, zodat de variabele `DATABASE_URL` heet (exact wat de code verwacht).
3. Lokaal env vars ophalen:
   ```bash
   npx vercel login
   npx vercel link       # kies team + project
   npx vercel env pull .env.local
   ```
4. Schema naar Neon pushen:
   ```bash
   npm run db:push
   ```

### 2. Strava API
1. Registreer een app op [strava.com/settings/api](https://www.strava.com/settings/api) (vereist een app-icoon, willekeurige afbeelding is prima).
2. Zet **Authorization Callback Domain** op je Vercel-domein (zonder `https://`, zonder pad) — voor lokaal testen tijdelijk `localhost`. Let op: dit veld ondersteunt maar één domein tegelijk.
3. Zet `STRAVA_CLIENT_ID` en `STRAVA_CLIENT_SECRET` in `.env.local` én in Vercel (**Settings → Environment Variables**, voor Production + Preview).
4. Verbind eenmalig door naar `/api/strava/auth` te navigeren (lokaal of live) en Strava-toestemming te geven.
5. Runs ophalen gebeurt automatisch via de cron in `vercel.json` (dagelijks), of handmatig:
   ```bash
   curl -X POST https://<jouw-domein>/api/strava/sync \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

### 3. Health Auto Export
1. Installeer **Health Auto Export** op je iPhone.
2. Stel een automatisatie (REST API-export) in die dagelijks POST't naar:
   `https://<jouw-domein>/api/health/ingest`
   met header `x-ingest-secret: <HEALTH_INGEST_SECRET>`.
3. Selecteer de metrics: resting heart rate, HRV, VO2 max, sleep analysis, step count, active energy, weight.

### 4. Lokaal draaien
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

### 5. Environment variables — volledig overzicht

| Variabele | Verplicht | Bron |
|---|---|---|
| `DATABASE_URL` | ✅ | Automatisch via Vercel's Neon-integratie |
| `STRAVA_CLIENT_ID` | ✅ | strava.com/settings/api |
| `STRAVA_CLIENT_SECRET` | ✅ | strava.com/settings/api |
| `CRON_SECRET` | ✅ | Zelf verzinnen (willekeurige string) |
| `HEALTH_INGEST_SECRET` | ✅ | Zelf verzinnen (willekeurige string) |
| `APP_PASSWORD` | ✅ | Uniek wachtwoord van minimaal 16 tekens voor de eigenaar |
| `SESSION_SECRET` | ✅ | Willekeurige waarde van minimaal 32 tekens voor ondertekende sessies |

Zie `.env.local.example` voor het exacte formaat.

## Scripts

```bash
npm run dev          # lokale dev-server
npm run build         # productie-build
npm run lint          # eslint
npm run typecheck     # TypeScript-controle
npm test              # regressietests
npm run db:push       # schema naar Neon pushen
npm run db:generate   # SQL-migratiebestanden genereren
npm run db:studio     # Drizzle Studio (GUI voor de database)
```

## Bekende beperkingen

- De Health Auto Export-mapping en eenheden moeten nog met geanonimiseerde echte exports als regressiefixtures worden vastgelegd.
- De inzichten zijn eenvoudige observationele regels, geen medische conclusies of vervanging voor professioneel advies.
- Er zijn nog geen versieerbare database-migraties of gedocumenteerde back-up/hersteltest.
- Cadans ontbreekt soms per activiteit, afhankelijk van wat Strava/het horloge meestuurt.
- `health_metrics.sleep_score` staat in het schema maar wordt nog niet gevuld.

## Privacy en beveiliging

- Dashboardpagina's, Strava-koppeling en handmatige synchronisatie vereisen een geldige login.
- De cron- en ingest-endpoints gebruiken afzonderlijke secrets en weigeren toegang als configuratie ontbreekt.
- OAuth-callbacks worden met een kortlevende `state`-cookie aan de initiërende browser gekoppeld.
- Gezondheidswaarden, tokens en ruwe payloads horen nooit in logs, issues, commits of CI-output.
- De app is een persoonlijk hulpmiddel en geeft geen medisch advies.

## Kwaliteitscontrole

GitHub Actions draait bij iedere pull request en push naar `main`: productie-dependency-audit, lint, typecheck, tests en productiebuild. Schemawijzigingen worden nog niet automatisch uitgevoerd.

## Roadmap

- Health Auto Export-fixtures en uitgebreidere ingestvalidatie.
- Betrouwbaarheid en steekproefgrootte expliciet tonen bij inzichten.
- Versieerbare migraties, back-upcontrole en operationele monitoring.
- AI-coaching: periodieke samenvatting van recente data naar een LLM sturen voor concreet advies.

## Voor AI coding assistants

Zie [CLAUDE.md](CLAUDE.md) voor architectuurdetails, bestandsstructuur en niet-voor-de-hand-liggende valkuilen (env var-loading voor drizzle-kit, Neon HTTP-driver-beperkingen, Strava callback-domain-gedrag, etc.).
