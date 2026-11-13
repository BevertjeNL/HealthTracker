# Apple Health synchroniseren met Apple Opdrachten

Pulse kan Apple Health-data zonder betaald abonnement ontvangen via de ingebouwde app **Opdrachten** op de iPhone. De opdracht leest de afgelopen 7 kalenderdagen uit en verstuurt per dag een samenvatting naar Pulse. Pulse overschrijft per datum, dus gemiste dagen worden bij de volgende uitvoering vanzelf ingehaald.

## Benodigd

- De URL `https://health-tracker-mu-six.vercel.app/api/health/ingest`
- De bestaande waarde van `HEALTH_INGEST_SECRET` uit de Vercel-projectinstellingen
- Leesrechten voor de gewenste categorieën in Apple Health

Behandel `HEALTH_INGEST_SECRET` als een wachtwoord. Deel geen schermafbeelding van de opdracht waarop deze waarde zichtbaar is.

## 1. Dagen doorlopen

Maak in **Opdrachten** een nieuwe opdracht met de naam `Pulse Health-sync`.

De opdracht verwerkt iedere keer vandaag en de 7 dagen daarvoor. Zo komt een weging van vandaag meteen mee en vult een gemiste automatisering zich de volgende keer vanzelf aan. Een opdracht die alleen gisteren verstuurt, laat een gat achter zodra een uitvoering wordt overgeslagen (iPhone vergrendeld, lege batterij, automatisering uit).

Bouw bovenaan de opdracht deze acties. Alles wat daaronder staat (stap 2 en 3) hoort binnen de herhaling.

1. **Herhaal**, `8` keer. Binnen de herhaling bestaat de variabele **Herhaal index**: 1 bij de eerste ronde, 8 bij de laatste.
2. **Bereken**: `Herhaal index` min `1`. Tik op het eerste vakje en kies de variabele **Herhaal index** (niet intypen). Het resultaat is 0 voor vandaag, 1 voor gisteren, tot en met 7.
3. **Huidige datum**.
4. **Pas datum aan**: **Trek af** `Resultaat berekening` **dagen** van `Datum`. Tik op het getal, kies **Selecteer variabele** en tik op het blauwe vakje met het rekenmachine-icoon onder de berekening. Datumvariabelen zijn hier fout: een datum kun je niet als aantal dagen aftrekken. De uitkomst van deze actie heet `Aangepaste datum`.
5. **Formatteer datum** voor `Aangepaste datum`: klap de actie open, zet de datumnotatie op **Aangepast** en de formatteer-tekenreeks op `yyyy-MM-dd`. De uitkomst heet `Geformatteerde datum`.

Er hoeft geen aparte begin- en einddatum van de dag te worden gemaakt. Elke zoekactie in stap 2 vergelijkt met de datum zelf.

Stappen en actieve energie van vandaag zijn een tussenstand. De volgende uitvoering overschrijft ze met het volledige dagtotaal.

## 2. Dagsamenvattingen ophalen

Voeg binnen de herhaling voor iedere gewenste categorie **Zoek gezondheidssteekproeven** toe. Stel bij elke zoekactie twee filters in: het type (bijvoorbeeld Steps) en **Begindatum** **is aan** `Aangepaste datum`. Controleer dat dit bij elke zoekactie dezelfde datumvariabele is. Een vaste datum of een andere variabele laat die metriek op de verkeerde dag ophalen. Voeg voor gemiddelden en totalen daarna **Bereken statistieken** toe. Sorteer voor `Laatste` op begindatum (nieuwste eerst), beperk het resultaat tot één steekproef en haal daarvan de waarde op.

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
| Slaap (alleen daadwerkelijk geslapen tijd) | Som van de niet overlappende slaapfasen van de nacht die op `Aangepaste datum` eindigde | `asleep_minutes` | minuten |

Voor slaap geldt binnen elke herhaling een apart datumbereik: van de avond vóór `Aangepaste datum` tot het einde van `Aangepaste datum`. Neem alleen de slaapregistratie van de nacht die op die datum eindigde. Tel `In slaap / Kern / Diep / REM` mee en stuur de totale minuten als `asleep_minutes` (of uren als `sleep_hours`). Tel overlappende registraties van meerdere bronnen niet dubbel. `In bed` is geen slaaptijd. Koppel de meting aan de datum waarop je wakker werd. Als je Watch geen slaapfasen of duur vastlegt, laat dit veld leeg; Pulse verzint geen slaapuren.

### Uitbreiding voor hardlopers (aanbevolen)

Deze metingen staan in Apple Health, maar de basisopdracht stuurt ze niet mee. Zonder ze mist Pulse de koppeling tussen je loopvorm en je prestaties op de pagina's **Vorm** en **Lichaam**. Pulse accepteert ze al; voeg alleen de zoekacties en JSON-velden toe.

| Apple Health-categorie | Bewerking | JSON-veld | Eenheid |
|---|---|---|---|
| Loopvermogen | Gemiddelde | `running_power` | W |
| Looplengte (pasbreedte) | Gemiddelde | `running_stride_length` | m |
| Verticale beweging bij hardlopen | Gemiddelde | `running_vertical_oscillation` | cm |
| Grondcontacttijd | Gemiddelde | `running_ground_contact_time` | ms |
| Trainingsminuten | Som | `exercise_minutes` | min |
| Ademhalingsfrequentie | Gemiddelde | `respiratory_rate` | per min |
| Zuurstofverzadiging | Gemiddelde | `oxygen_saturation` | % |

Ademhaling en zuurstof helpen Pulse een naderende ziekte te herkennen. Loopvermogen, pasbreedte, grondcontact en verticale beweging worden alleen op hardloopdagen geregistreerd; een leeg veld op rustdagen is normaal.

Geef ieder resultaat een herkenbare variabelenaam. Het is niet erg wanneer een categorie op een dag geen waarde heeft; een leeg JSON-veld wordt overgeslagen. Begin eventueel alleen met HRV, rusthartslag, stappen en actieve energie en voeg de rest later toe.

Wanneer zowel de iPhone als Apple Watch stappen registreren, filter **Stappen** bij voorkeur op de bron die je meestal draagt. Anders kan een eenvoudige som overlappende steekproeven dubbel tellen. Pulse bewaart precies het dagtotaal dat de opdracht aanlevert.

## 3. Naar Pulse versturen

1. Voeg binnen de herhaling **Haal inhoud van URL op** toe. Er gaat dan per dag één aanvraag naar Pulse.
2. URL: `https://health-tracker-mu-six.vercel.app/api/health/ingest`
3. Methode: `POST`.
4. Voeg de header `x-ingest-secret` toe met de waarde van `HEALTH_INGEST_SECRET`.
5. Kies voor de aanvraagbody `JSON`.
6. Voeg `source` toe als tekst met waarde `apple-shortcuts`.
7. Voeg `date` toe met de variabele `Geformatteerde datum`.
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
  "asleep_minutes": 435,
  "weight_body_mass": 70
}
```

Zet **Stop en genereer uitvoer** niet binnen de herhaling. Die actie beëindigt de hele opdracht zodra hij wordt bereikt, dus er gaat dan alleen vandaag naar Pulse en de andere zeven dagen worden nooit verstuurd. Zet de actie weg of onder het einde van de herhaling (in iOS heet dat blok **Stop herhalen**). `Haal inhoud van URL op` blijft het laatste in de herhaling.

## 4. Testen en automatiseren

1. Voer de opdracht eenmaal handmatig uit.
2. Geef bij de eerste uitvoering toestemming voor alle gekozen Health-categorieën en netwerktoegang.
3. Een geslaagde reactie bevat `"source":"apple-shortcuts"` en `"upserted":1`. Een dag zonder enige waarde geeft `"upserted":0`; dat is normaal. De reactie hoort bij één dag. Of alle acht dagen zijn aangekomen, zie je in Pulse onder **Lichaam**.
4. Open Pulse opnieuw. De Health-datum hoort nu op vandaag of gisteren te staan.
5. Open in Opdrachten het tabblad **Automatisering** en maak een persoonlijke automatisering voor iedere ochtend, nadat de iPhone normaal gesproken is ontgrendeld.
6. Kies `Voer onmiddellijk uit` en laat de automatisering `Pulse Health-sync` starten.

De website kan Apple Health niet rechtstreeks uitlezen: iOS staat alleen apps en Opdrachten toe om de Health-database te benaderen. Een webapp kan Opdrachten ook niet op de achtergrond starten. Pulse vertrouwt daarom op automatiseringen op de iPhone zelf (zie stap 6). De knop **Gegevens verversen** in Pulse blijft in de app: hij synchroniseert Strava en leest alles opnieuw wat de iPhone al heeft aangeleverd, met een voortgangsanimatie.

Bij `401 Unauthorized` klopt de geheime header niet. Bij `upserted:0` waren alle meegestuurde metriekvelden leeg of ongeldig. De respons noemt wel veldnamen, maar geeft nooit gezondheidswaarden terug.

## 5. Bestaande gewichtshistorie eenmalig aanvullen

De dagelijkse opdracht kijkt maar 7 dagen terug. Maak daarom een aparte opdracht `Pulse gewicht-backfill` om oudere, werkelijk gemeten gewichten met hun eigen meetdatum te bewaren:

1. Zoek **Gewicht** in Gezondheid, met begindatum in de laatste twee jaar. Sorteer op begindatum, oudste eerst, zonder limiet.
2. Voeg **Herhaal met elk onderdeel** toe voor de gevonden gezondheidswaarden.
3. Haal binnen de herhaling de **Begindatum** en **Waarde** van het herhaalonderdeel op.
4. Formatteer de begindatum als `yyyy-MM-dd`.
5. Voeg binnen de herhaling dezelfde `POST`-actie en geheime koptekst toe als in `Pulse Health-sync`.
6. Gebruik als JSON-body alleen `source: apple-shortcuts`, `date: [geformatteerde begindatum]` en `weight_body_mass: [waarde]`.
7. Voer deze backfill één keer handmatig uit. Automatiseer hem niet en verwijder hem na een geslaagde import.

Pulse zet metingen niet kunstmatig door op dagen zonder weging. Daardoor blijft de gewichtsgrafiek gebaseerd op echte Health-metingen.

Als je later een foutieve weging uit Apple Health verwijdert, verdwijnt die niet vanzelf uit Pulse: de opdracht stuurt alleen aanwezige waarden door. Kies onder de gewichtsgrafiek de meetdatum en gebruik **Verwijder meting**. Alleen het gewicht van die dag wordt gewist; andere Health-gegevens blijven staan.

## 6. Gewicht en Health meerdere keren per dag laten bijwerken

De dagelijkse opdracht verwerkt maar zo vaak als hij draait. Een weging na de laatste uitvoering komt dan pas bij de volgende. Een lichte opdracht die alleen gewicht stuurt, kun je vaker laten draaien, bijvoorbeeld ook bij het openen van een andere app. Maak daarom een tweede opdracht `Pulse gewicht-sync`:

1. Zoek **Gewicht** in Gezondheid met begindatum in de laatste 7 dagen, sorteer op begindatum, zonder limiet.
2. Gebruik **Herhaal met elk onderdeel** en haal per onderdeel de **Begindatum** en **Waarde** op.
3. Formatteer de begindatum als `yyyy-MM-dd`.
4. Verstuur per onderdeel dezelfde `POST` met header `x-ingest-secret` en als body `source: apple-shortcuts`, `date: [geformatteerde begindatum]` en `weight_body_mass: [waarde]`.

Pulse overschrijft per meetdatum, dus herhaald versturen geeft geen dubbele metingen en vult gaten van de afgelopen week vanzelf aan.

Maak daarna in **Automatisering** meerdere persoonlijke automatiseringen, bijvoorbeeld om 07:00, 12:00 en 19:00, die `Pulse gewicht-sync` en `Pulse Health-sync` starten. Kies `Voer onmiddellijk uit` en zet `Melden bij uitvoeren` uit, dan draaien ze op de achtergrond. Een weging is in Pulse zichtbaar na de eerstvolgende uitvoering en een druk op **Gegevens verversen**.

## 7. Controleren of de synchronisatie nog loopt

Pulse toont geen melding als de iPhone niets stuurt. Controleer het zo:

- Een geslaagde reactie op `Haal inhoud van URL op` bevat `upserted` en de lijst `importedMetrics`. De reactie bevat geen datum en geen waarden.
- Staat de datum van vandaag of gisteren niet in Pulse, dan heeft de opdracht die dag niet gedraaid of waren de velden leeg. Draai hem met ontgrendelde iPhone handmatig.
- Bij `upserted:0` voor een dag mét metingen klopt het datumfilter niet. Controleer of elke zoekactie **Begindatum is aan** `Aangepaste datum` gebruikt.
- Komt alleen vandaag binnen en geen eerdere dag, dan staat er waarschijnlijk **Stop en genereer uitvoer** binnen de herhaling (zie stap 3).
- Een dag zonder meting blijft leeg in Pulse. Bij een test kreeg een dag zonder gewicht geen gewicht van een andere dag.
