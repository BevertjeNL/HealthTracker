## HealthTracker

Verzamelt je wekelijkse Strava-runs en dagelijkse Apple Health-data (via Health Auto Export) in één Neon Postgres-database, met een dashboard erbovenop.

### Stack
- Next.js (App Router) op Vercel
- Neon Postgres + Drizzle ORM
- Strava API (OAuth2)
- Health Auto Export (iOS-app) → eigen ingest-endpoint

### 1. Neon database
1. Maak een project aan op [neon.tech](https://neon.tech).
2. Kopieer de connection string naar `DATABASE_URL` in `.env.local` (zie `.env.local.example`).
3. Push het schema:
   ```
   npm run db:push
   ```

### 2. Strava API
1. Maak een app aan op [strava.com/settings/api](https://www.strava.com/settings/api).
2. Zet "Authorization Callback Domain" op je Vercel-domein (of `localhost` voor lokaal testen).
3. Vul `STRAVA_CLIENT_ID` en `STRAVA_CLIENT_SECRET` in `.env.local`.
4. Ga naar `/api/strava/auth` in de browser om te verbinden (eenmalig).
5. Activiteiten ophalen gebeurt via `/api/strava/sync` (POST/GET, met `Authorization: Bearer <CRON_SECRET>` header). `vercel.json` bevat een dagelijkse cron die dit automatisch aanroept.

### 3. Health Auto Export
1. Installeer de app "Health Auto Export" op je iPhone.
2. Stel een automatisatie in die dagelijks post naar:
   `https://<jouw-domein>/api/health/ingest`
   met header `x-ingest-secret: <HEALTH_INGEST_SECRET>` en de metrics: resting heart rate, HRV, VO2 max, sleep analysis, step count, active energy, weight.

### 4. Lokaal draaien
```
npm install
cp .env.local.example .env.local   # vul de waarden in
npm run db:push
npm run dev
```

### 5. Deployen
Push naar GitHub en importeer de repo in Vercel. Zet dezelfde env vars (`DATABASE_URL`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `CRON_SECRET`, `HEALTH_INGEST_SECRET`) in de Vercel-projectinstellingen.

### Volgende stappen
- Dashboard uitbreiden met grafieken (pace-trend, HRV vs. run-kwaliteit, hersteltijd).
- AI-advies: periodieke samenvatting van recente data naar de Claude API sturen voor coaching-inzichten.
