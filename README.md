# Pulse HealthTracker

Pulse is een persoonlijk, afgeschermd dashboard dat hardloopdata uit **Strava** combineert met dagelijkse gezondheidsdata uit **Apple Health**. Apple Health wordt gratis aangeleverd via **Apple Opdrachten** op de iPhone; het bestaande Health Auto Export-formaat blijft compatibel. De app zet die bronnen om in trends, conclusies en praktische trainingsaanbevelingen op basis van de persoonlijke historie van de gebruiker.

## Live omgeving

- Publieke productie-URL: [health-tracker-mu-six.vercel.app](https://health-tracker-mu-six.vercel.app)
- `main`-alias: [health-tracker-git-main-bevertje.vercel.app](https://health-tracker-git-main-bevertje.vercel.app)
- Repository: [github.com/BevertjeNL/HealthTracker](https://github.com/BevertjeNL/HealthTracker)

Beide app-URL's horen naar dezelfde actuele productie-deployment te wijzen. De applicatie zelf vereist een wachtwoord; sommige Vercel-aliases kunnen daarnaast door Vercel SSO zijn afgeschermd.

## Wat de app doet

- **Pulse-branding als app-identiteit** — logo in de app, favicon voor browsertabbladen, Apple touch-icon, Safari pinned-tab-icon en PWA-iconen/manifest.
- **Afgeschermde single-user toegang** — wachtwoordlogin met een ondertekende HttpOnly-sessiecookie.
- **Strava-koppeling** — OAuth met `state`-controle, volledige synchronisatie en dagelijkse cronjob.
- **Persoonlijk inzichtendashboard** — actuele datadekking, gewicht, VO2max, tempo, trainingsbelasting, herstel en recente runs.
- **Uitgebreide conclusies** — vergelijkt recente HRV en rusthartslag met de eigen basislijn, signaleert verouderde Health-data en beoordeelt trainingsvolume, frequentie, aerobe efficiëntie en gewichtsverloop.
- **Concrete aanbevelingen** — geeft terughoudend trainingsadvies met zichtbaar betrouwbaarheidsniveau en minimale steekproefgroottes.
- **Runs-overzicht en detailpagina's** — bereikfilters, trendgrafieken, totalen en alle beschikbare Strava-metrics per activiteit.

De inzichten zijn observationeel en persoonlijk; ze zijn geen diagnose of vervanging voor medisch advies.

## Apple Health: wat wordt geïmporteerd

Apple Opdrachten stuurt dagelijks een POST-verzoek naar `/api/health/ingest`. De import accepteert ook nog bestaande Health Auto Export-verzoeken en deze metriek-namen:

| API-naam | Opslag/gebruik | Aggregatie per dag |
|---|---|---|
| `heart_rate_variability` | HRV in ms, herstel t.o.v. eigen basislijn | Gemiddelde |
| `resting_heart_rate` | Rusthartslag, herstel t.o.v. eigen basislijn | Gemiddelde |
| `cardio_recovery` / `heart_rate_recovery_one_minute` | Hartslagherstel één minuut na inspanning | Gemiddelde |
| `walking_heart_rate_average` | Gemiddelde wandelhartslag | Gemiddelde |
| `vo2_max` | VO2max-trend | Laatste meting |
| `step_count` | Dagelijkse activiteit en datadekking | Som |
| `active_energy` | Actieve energie in kcal | Som |
| `weight_&_body_mass` / `weight_body_mass` | Gewicht in kg en gewichtstrend | Laatste meting |

Eenheden worden waar nodig genormaliseerd: kJ naar kcal en lb/lbs naar kg. Het endpoint retourneert alleen de namen van ontvangen, geïmporteerde en genegeerde metrics; er worden geen gezondheidswaarden gelogd.

### Bewust niet geïmporteerd

Slaapdata wordt momenteel bewust overgeslagen omdat de aangesloten export geen bruikbare slaapgegevens levert. `sleep_hours` en `sleep_score` bestaan nog als ongebruikte legacy-kolommen in het databaseschema, maar de ingest-route accepteert of vult ze niet en de analyse trekt er geen conclusies uit.

### Aanbevolen Apple Health-selectie

Selecteer bij voorkeur:

1. Heart Rate Variability
2. Resting Heart Rate
3. Cardio Recovery
4. Walking Heart Rate Average
5. VO2 Max
6. Step Count
7. Active Energy
8. Weight & Body Mass

Ontbrekende metrics blokkeren de import niet. De app toont de werkelijke dekking en maakt alleen een conclusie wanneer voldoende metingen beschikbaar zijn.

## Techniek

| Onderdeel | Keuze |
|---|---|
| Framework | Next.js 16.3.1, App Router, React 19, TypeScript, Tailwind CSS v4 |
| Hosting | Vercel, automatisch vanaf GitHub |
| Database | Neon serverless Postgres |
| ORM | Drizzle ORM met Neon HTTP-driver |
| Grafieken | Recharts |
| Databronnen | Strava API en Apple Opdrachten (Health Auto Export blijft compatibel) |
| CI | GitHub Actions: audit, lint, typecheck, tests en productiebuild |

```text
Strava ──OAuth/REST──► Next.js API ──► Neon Postgres
                           ▲                 │
Apple Opdrachten ──POST──┘                  ▼
                                      Pulse-dashboard
```

## Setup

### 1. Omgevingsvariabelen

Maak `.env.local` op basis van `.env.local.example`:

| Variabele | Doel |
|---|---|
| `DATABASE_URL` | Neon Postgres-verbinding |
| `STRAVA_CLIENT_ID` | Strava OAuth-client |
| `STRAVA_CLIENT_SECRET` | Strava OAuth-secret |
| `CRON_SECRET` | Beveiliging van `/api/strava/sync` |
| `HEALTH_INGEST_SECRET` | Beveiliging van `/api/health/ingest` |
| `APP_PASSWORD` | Uniek app-wachtwoord van minimaal 16 tekens |
| `SESSION_SECRET` | Sessiesigning, minimaal 32 tekens |

Sterke waarden genereren:

```bash
openssl rand -base64 24 # APP_PASSWORD
openssl rand -base64 32 # SESSION_SECRET
```

### 2. Installeren en lokaal draaien

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### 3. Database koppelen

Koppel het project aan Vercel en haal de ontwikkelvariabelen op:

```bash
npx vercel link
npx vercel env pull .env.local
npm run db:push
```

Schemawijzigingen worden momenteel rechtstreeks met `db:push` uitgevoerd; beoordeel vooraf altijd of een wijziging bestaande productiegegevens kan verwijderen of herinterpreteren.

### 4. Strava configureren

1. Registreer een app via [Strava API Settings](https://www.strava.com/settings/api).
2. Zet het callback-domein op het gebruikte Vercel-domein.
3. Configureer `STRAVA_CLIENT_ID` en `STRAVA_CLIENT_SECRET` lokaal en in Vercel.
4. Log in op Pulse en open `/api/strava/auth` om de koppeling te voltooien.
5. De cronjob synchroniseert dagelijks om 05:00 UTC; handmatig kan ook via de beveiligde sync-route.

### 5. Apple Opdrachten configureren

Maak een dagelijkse Apple-opdracht die een eenvoudige JSON-body verstuurt naar:

```text
POST https://health-tracker-mu-six.vercel.app/api/health/ingest
x-ingest-secret: <HEALTH_INGEST_SECRET>
```

De volledige Nederlandstalige configuratie staat in [docs/apple-shortcuts.md](docs/apple-shortcuts.md). Een `GET` op hetzelfde endpoint geeft de actuele veldnamen, verwachte eenheden en ondersteunde formaten terug, zonder privédata te tonen.

## Scripts

```bash
npm run dev          # ontwikkelserver
npm run build        # productiebuild
npm run start        # gebouwde app starten
npm run lint         # ESLint
npm run typecheck    # Next.js route-types + TypeScript
npm test             # regressietests
npm run db:push      # schema rechtstreeks naar Neon pushen
npm run db:generate  # SQL-migratiebestanden genereren
npm run db:studio    # Drizzle Studio
```

## Publicatie en definitie van klaar

Voor dit project betekent een implementatie-opdracht standaard: bouwen, lokaal controleren, via een feature branch en pull request publiceren, CI groen krijgen, naar `main` mergen en de productie-URL daadwerkelijk controleren. Alleen wanneer de gebruiker expliciet om een lokaal concept of analyse zonder publicatie vraagt, stopt het werk vóór productie.

Minimale controles:

```bash
npm audit --omit=dev --audit-level=high
npm run lint
npm run typecheck
npm test
npm run build
```

Controleer daarna GitHub Actions, de Vercel-deployment, de publieke URL, de `main`-alias en alle gewijzigde live routes/assets. Een groene lokale build alleen is niet voldoende.

## Bekende beperkingen en vervolgwerk

- De persoonlijke Apple-automatisering moet dagelijks blijven draaien; het dashboard waarschuwt wanneer de laatste Health-dag ouder dan twee dagen is.
- De Health-import heeft synthetische regressietests voor zowel Apple Opdrachten als het compatibele Health Auto Export-formaat; echte gezondheidswaarden worden niet als fixtures bewaard.
- Databasewijzigingen gebruiken nog directe `db:push`; versieerbare migraties en een geteste herstelprocedure ontbreken.
- Cardio Recovery en Walking Heart Rate Average leveren pas conclusies nadat voldoende nieuwe metingen zijn verzameld.
- De aanbevelingen zijn regelgebaseerd; er is nog geen LLM-gegenereerde coachinglaag.

## Privacy en beveiliging

- Gezondheidswaarden, Strava-tokens en ruwe payloads mogen nooit in logs, issues, commits, CI-output of documentatie verschijnen.
- Dashboardroutes en handmatige acties vereisen een geldige sessie.
- Cron- en ingest-routes hebben afzonderlijke secrets en weigeren toegang wanneer configuratie ontbreekt.
- OAuth-callbacks vereisen een passende, kortlevende `state`-cookie.
- De app is ingesteld op `noindex, nofollow`.

Voor de operationele afspraken voor coding agents: zie [CLAUDE.md](CLAUDE.md).
