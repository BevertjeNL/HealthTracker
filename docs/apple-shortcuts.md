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

De website kan Apple Health niet rechtstreeks uitlezen: iOS staat alleen apps en Opdrachten toe om de Health-database te benaderen. Een webapp kan Opdrachten ook niet op de achtergrond starten. Pulse vertrouwt daarom op automatiseringen op de iPhone zelf (zie stap 6). De knop **Gegevens verversen** in Pulse blijft in de app: hij synchroniseert Strava en leest alles opnieuw wat de iPhone al heeft aangeleverd, met een voortgangsanimatie.

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

Als je later een foutieve weging uit Apple Health verwijdert, verdwijnt die niet vanzelf uit Pulse: de opdracht stuurt alleen aanwezige waarden door. Kies onder de gewichtsgrafiek de meetdatum en gebruik **Verwijder meting**. Alleen het gewicht van die dag wordt gewist; andere Health-gegevens blijven staan.

## 6. Gewicht en Health meerdere keren per dag laten bijwerken

De dagelijkse opdracht leest alleen gisteren. Een weging van vandaag, of een weging na de laatste uitvoering, komt dan te laat of niet in Pulse. Maak daarom een tweede opdracht `Pulse gewicht-sync`:

1. Zoek **Gewicht** in Gezondheid met begindatum in de laatste 7 dagen, sorteer op begindatum, zonder limiet.
2. Gebruik **Herhaal met elk onderdeel** en haal per onderdeel de **Begindatum** en **Waarde** op.
3. Formatteer de begindatum als `yyyy-MM-dd`.
4. Verstuur per onderdeel dezelfde `POST` met header `x-ingest-secret` en als body `source: apple-shortcuts`, `date: [geformatteerde begindatum]` en `weight_body_mass: [waarde]`.

Pulse overschrijft per meetdatum, dus herhaald versturen geeft geen dubbele metingen en vult gaten van de afgelopen week vanzelf aan.

Maak daarna in **Automatisering** meerdere persoonlijke automatiseringen, bijvoorbeeld om 07:00, 12:00 en 19:00, die `Pulse gewicht-sync` en `Pulse Health-sync` starten. Kies `Voer onmiddellijk uit` en zet `Melden bij uitvoeren` uit, dan draaien ze op de achtergrond. Een weging is in Pulse zichtbaar na de eerstvolgende uitvoering en een druk op **Gegevens verversen**.

## 7. Slaap toevoegen (Pulse slaap-sync)

Slaap gaat via een eigen opdracht, omdat een nacht bij de ochtend hoort waarop je wakker wordt en de andere opdracht gisteren leest. Pulse bewaart per `date` alleen de velden die je meestuurt, dus de slaap-opdracht overschrijft niets van de Health-sync.

Je Apple Watch moet slaap registreren (Slaapfocus of de Slaap-app op de Watch) en je moet de Watch 's nachts dragen. Zonder Watch levert iOS alleen `In bed`-tijd en dan blijven de fasen leeg.

Maak een opdracht `Pulse slaap-sync`:

1. Voeg **Huidige datum** toe. Formatteer als `yyyy-MM-dd` en noem het `Datumtekst`. Dit is de ontwaakdatum, dus vandaag.
2. Bereken `Begin nacht`: gisteren om 18:00. Gebruik **Pas datum aan** (trek 1 dag af van het begin van vandaag) en **Pas datum aan** (tel 18 uur op).
3. Bereken `Einde nacht`: vandaag om 12:00 (begin van vandaag plus 12 uur).
4. Zoek per fase **Zoek gezondheidssteekproeven** van het type **Slaap**, met einddatum tussen `Begin nacht` en `Einde nacht`, en filter op **Waarde** is `Diep`, `REM`, `Kern` of `Wakker`. Haal de **Duur** van de steekproeven op in minuten en tel ze op met **Bereken statistieken** (Som).
5. Haal de **Begindatum** van de eerste steekproef met een slaapfase (diep, REM of kern) op, formatteer als `HH:mm` en noem het `Inslaaptijd`. Doe hetzelfde met de **Einddatum** van de laatste en noem het `Wektijd`.
6. Voeg **Haal inhoud van URL op** toe: dezelfde URL, `POST`, header `x-ingest-secret`, JSON-body:

| JSON-veld | Waarde | Eenheid |
|---|---|---|
| `source` | `apple-shortcuts` | tekst |
| `date` | `Datumtekst` | `yyyy-MM-dd` |
| `sleep_deep` | som diep | min |
| `sleep_rem` | som REM | min |
| `sleep_core` | som kern | min |
| `sleep_awake` | som wakker | min |
| `sleep_bedtime` | `Inslaaptijd` | `HH:mm` |
| `sleep_wake` | `Wektijd` | `HH:mm` |

`sleep_asleep` (totale slaap, zonder wakker) hoef je niet mee te sturen: Pulse telt diep, REM en kern bij elkaar op. Heeft je Watch geen fasen, stuur dan alleen `sleep_asleep` (de som van `Onbepaald`/`Slaap`), `sleep_bedtime` en `sleep_wake`.

Een geslaagde reactie bevat `"upserted":1` en onder `importedMetrics` de `sleep_*`-velden. Staan ze onder `ignoredMetrics` of is `upserted` 0, dan zijn de waarden leeg of onrealistisch (een nacht korter dan 30 minuten telt niet).

Automatiseer de opdracht met een persoonlijke automatisering die loopt wanneer je Wekker wordt uitgezet, of vast om 09:00. Pulse toont slaapadvies pas als de laatste nacht hoogstens drie dagen oud is.

### Historie aanvullen uit een Apple Health-export

Het importscript leest de slaapregistraties uit `export.zip` en vult per ontwaakdatum de lege slaapvelden aan (nooit een bestaande waarde overschrijven):

```bash
node --env-file=.env.local scripts/import-apple-health-export.mjs --dry-run /pad/naar/export.zip
```

Per nacht telt alleen de bron met de meeste slaap (meestal de Watch), dutjes tussen 12:00 en 18:00 tellen niet mee en `In bed`-registraties van de iPhone worden genegeerd. Controleer met `--dry-run` eerst hoeveel nachten erin zitten: bevat de export na een bepaalde datum alleen `In bed`, dan krijg je daarvoor geen slaapnachten.
