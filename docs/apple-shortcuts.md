# Apple Health synchroniseren met Apple Opdrachten

Pulse kan Apple Health-data zonder betaald abonnement ontvangen via de ingebouwde app **Opdrachten** op de iPhone. De opdracht leest de vorige kalenderdag uit en verstuurt alleen dagsamenvattingen naar Pulse.

## Benodigd

- De URL `https://health-tracker-mu-six.vercel.app/api/health/ingest`
- De bestaande waarde van `HEALTH_INGEST_SECRET` uit de Vercel-projectinstellingen
- Leesrechten voor de gewenste categorieën in Apple Health

Behandel `HEALTH_INGEST_SECRET` als een wachtwoord. Deel geen schermafbeelding van de opdracht waarop deze waarde zichtbaar is.

## 1. Datumbereik maken

Maak in **Opdrachten** een nieuwe opdracht met de naam `Pulse Health-sync`.

1. Voeg **Huidige datum** toe.
2. Voeg **Pas datum aan** toe en trek `1 dag` af. Noem het resultaat `Gisteren`.
3. Voeg **Begin van dag ophalen** voor `Gisteren` toe. Noem dit `Start gisteren`.
4. Voeg nogmaals **Pas datum aan** toe: tel bij `Start gisteren` precies `1 dag` op en trek daarna `1 seconde` af. Noem dit `Einde gisteren`.
5. Voeg **Formatteer datum** toe voor `Gisteren`, kies **Aangepast** en gebruik `yyyy-MM-dd`. Noem het resultaat `Datumtekst`.

Gebruik bij alle zoekacties hieronder het filter: begindatum is tussen `Start gisteren` en `Einde gisteren`.

## 2. Dagsamenvattingen ophalen

Voeg voor iedere gewenste categorie **Zoek gezondheidssteekproeven** toe. Voeg voor gemiddelden en totalen daarna **Bereken statistieken** toe. Sorteer voor `Laatste` op begindatum (nieuwste eerst), beperk het resultaat tot één steekproef en haal daarvan de waarde op.

| Apple Health-categorie | Bewerking | JSON-veld | Eenheid |
|---|---|---|---|
| Hartslagvariabiliteit (SDNN) | Gemiddelde | `heart_rate_variability` | ms |
| Rusthartslag | Gemiddelde | `resting_heart_rate` | bpm |
| Cardioherstel | Gemiddelde | `cardio_recovery` | bpm |
| Gemiddelde wandelhartslag | Gemiddelde | `walking_heart_rate_average` | bpm |
| Cardioconditie / VO₂max | Laatste | `vo2_max` | mL/kg/min |
| Stappen | Som | `step_count` | aantal |
| Actieve energie | Som | `active_energy` | kcal |
| Gewicht | Laatste | `weight_body_mass` | kg |

Geef ieder resultaat een herkenbare variabelenaam. Het is niet erg wanneer een categorie op een dag geen waarde heeft; een leeg JSON-veld wordt overgeslagen. Begin eventueel alleen met HRV, rusthartslag, stappen en actieve energie en voeg de rest later toe.

Wanneer zowel de iPhone als Apple Watch stappen registreren, filter **Stappen** bij voorkeur op de bron die je meestal draagt. Anders kan een eenvoudige som overlappende steekproeven dubbel tellen. Pulse bewaart precies het dagtotaal dat de opdracht aanlevert.

## 3. Naar Pulse versturen

1. Voeg **Haal inhoud van URL op** toe.
2. URL: `https://health-tracker-mu-six.vercel.app/api/health/ingest`
3. Methode: `POST`.
4. Voeg de header `x-ingest-secret` toe met de waarde van `HEALTH_INGEST_SECRET`.
5. Kies voor de aanvraagbody `JSON`.
6. Voeg `source` toe als tekst met waarde `apple-shortcuts`.
7. Voeg `date` toe met de variabele `Datumtekst`.
8. Voeg de JSON-velden uit de tabel toe met hun berekende variabele. Pulse accepteert zowel kale getallen als waarden met de verwachte eenheid, bijvoorbeeld `48` en `48 ms`.

Een volledige body heeft deze vorm; de getallen hieronder zijn uitsluitend een vormvoorbeeld:

```json
{
  "source": "apple-shortcuts",
  "date": "2026-08-26",
  "heart_rate_variability": 40,
  "resting_heart_rate": 50,
  "cardio_recovery": 30,
  "walking_heart_rate_average": 90,
  "vo2_max": 45,
  "step_count": 10000,
  "active_energy": 500,
  "weight_body_mass": 70
}
```

## 4. Testen en automatiseren

1. Voer de opdracht eenmaal handmatig uit.
2. Geef bij de eerste uitvoering toestemming voor alle gekozen Health-categorieën en netwerktoegang.
3. Een geslaagde reactie bevat `"source":"apple-shortcuts"` en `"upserted":1`.
4. Open Pulse opnieuw. De Health-datum hoort nu op gisteren te staan.
5. Open in Opdrachten het tabblad **Automatisering** en maak een persoonlijke automatisering voor iedere ochtend, nadat de iPhone normaal gesproken is ontgrendeld.
6. Kies `Voer onmiddellijk uit` en laat de automatisering `Pulse Health-sync` starten.

Bij `401 Unauthorized` klopt de geheime header niet. Bij `upserted:0` waren alle meegestuurde metriekvelden leeg of ongeldig. De respons noemt wel veldnamen, maar geeft nooit gezondheidswaarden terug.

## 5. Bestaande gewichtshistorie eenmalig aanvullen

De dagelijkse opdracht leest alleen gisteren. Maak daarom een aparte opdracht `Pulse gewicht-backfill` om oudere, werkelijk gemeten gewichten met hun eigen meetdatum te bewaren:

1. Zoek **Gewicht** in Gezondheid, met begindatum in de laatste twee jaar. Sorteer op begindatum, oudste eerst, zonder limiet.
2. Voeg **Herhaal met elk onderdeel** toe voor de gevonden gezondheidswaarden.
3. Haal binnen de herhaling de **Begindatum** en **Waarde** van het herhaalonderdeel op.
4. Formatteer de begindatum als `yyyy-MM-dd`.
5. Voeg binnen de herhaling dezelfde `POST`-actie en geheime koptekst toe als in `Pulse Health-sync`.
6. Gebruik als JSON-body alleen `source: apple-shortcuts`, `date: [geformatteerde begindatum]` en `weight_body_mass: [waarde]`.
7. Voer deze backfill één keer handmatig uit. Automatiseer hem niet en verwijder hem na een geslaagde import.

Pulse zet metingen niet kunstmatig door op dagen zonder weging. Daardoor blijft de gewichtsgrafiek gebaseerd op echte Health-metingen.
