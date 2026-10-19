import type { HealthKey, HealthTrend } from "./training-health.ts";

// Pure uitleg bij de Health-kaarten: wat de meting is, hoe je hem leest en wat het verschil met je basis betekent.
// Alleen type-imports uit training-health, zodat dit veilig in een client component kan.

export type MetricGuide = {
  what: string;
  read: string;
  causesWorse?: string[];
  tips: string[];
  lowWord: string;
  highWord: string;
};

export const METRIC_GUIDE: Partial<Record<HealthKey, MetricGuide>> = {
  hrvMs: {
    what: "Hartslagvariabiliteit (HRV) meet hoeveel de tijd tussen twee hartslagen van slag tot slag verschilt. Het zegt hoe flexibel je zenuwstelsel schakelt tussen inspanning en rust.",
    read: "Hoger is meestal beter: je lichaam herstelt goed en heeft ruimte voor belasting. HRV is erg persoonlijk. Vergelijk jezelf alleen met jezelf, nooit met een ander. Een enkele lage dag zegt weinig, een aanhoudende daling wel.",
    causesWorse: ["te weinig of onrustige slaap", "een zware of lange training in de afgelopen dagen", "alcohol of een late maaltijd", "stress of een beginnende ziekte"],
    tips: ["Draag je Watch ook 's nachts: HRV wordt vooral dan gemeten.", "Beoordeel de trend over meerdere dagen, niet één dag.", "Een lage HRV samen met een hoge rusthartslag is een sterker signaal dan één van beide."],
    lowWord: "lager",
    highWord: "hoger",
  },
  restingHeartRate: {
    what: "Je rusthartslag is het laagste aantal slagen per minuut als je rustig en uitgerust bent. Een getraind hart pompt meer per slag en hoeft dus minder vaak te kloppen.",
    read: "Lager is fitter. Een stijging van enkele slagen ten opzichte van je normaal wijst op vermoeidheid, stress, te weinig slaap, warmte of een beginnende ziekte.",
    causesWorse: ["onvoldoende herstel na een zware training", "slecht geslapen", "alcohol of dehydratie", "stress of een beginnende infectie"],
    tips: ["Een stijging van 1 tot 2 slagen is ruis; let op 3 of meer die meerdere dagen blijven.", "Combineer met HRV: beide signalen samen zijn betrouwbaarder."],
    lowWord: "lager",
    highWord: "hoger",
  },
  vo2Max: {
    what: "VO₂max is de schatting van je Apple Watch van de maximale hoeveelheid zuurstof die je lichaam per minuut en per kilo kan gebruiken. Het is de belangrijkste enkele maat voor je aerobe conditie.",
    read: "Hoger is beter en verandert langzaam, in weken tot maanden. De Watch schat dit uit je tempo en hartslag tijdens buitenruns, dus warmte, wind en weinig metingen geven schommelingen.",
    tips: ["Loop regelmatig buiten met de Watch om de schatting actueel te houden.", "Kijk naar de trend over maanden, niet naar één meting."],
    lowWord: "lager",
    highWord: "hoger",
  },
  weightKg: {
    what: "Je lichaamsgewicht in kilo, zoals vastgelegd in Apple Gezondheid.",
    read: "Voor hardlopers is gewicht geen doel op zich. Een lager gewicht maakt lopen zuiniger, maar te snel afvallen kost spiermassa en herstelvermogen. Dagschommelingen van een kilo zijn normaal.",
    tips: ["Weeg jezelf op hetzelfde moment, bijvoorbeeld 's ochtends na het toilet.", "Kijk naar het gemiddelde van een paar weken, niet naar één weging."],
    lowWord: "lager",
    highWord: "hoger",
  },
  respiratoryRate: {
    what: "Je ademhalingsfrequentie is het aantal ademhalingen per minuut in rust, meestal gemeten tijdens de slaap.",
    read: "Een gezonde volwassene zit meestal tussen 12 en 20 per minuut. Een stijging van enkele ademhalingen ten opzichte van je normaal kan wijzen op ziekte of zware vermoeidheid.",
    causesWorse: ["een beginnende luchtweginfectie", "zware vermoeidheid", "een warme of benauwde slaapkamer"],
    tips: ["Een waarde die ver buiten 8 tot 30 ligt is vrijwel zeker een meetfout of een foute koppeling, geen gezondheidssignaal."],
    lowWord: "lager",
    highWord: "hoger",
  },
  oxygenSaturationPct: {
    what: "Zuurstofsaturatie is het percentage van je bloed dat zuurstof bevat. Je Watch meet dit sporadisch.",
    read: "Gezonde waarden liggen rond 95 tot 100%. Een daling van een paar procent ten opzichte van je normaal kan wijzen op ziekte of hoogte.",
    causesWorse: ["een beginnende luchtweginfectie", "verblijf op grote hoogte", "een slechte meting door een losse Watch"],
    tips: ["Eén lage meting is vaak een meetfout. Let op een patroon over meerdere dagen."],
    lowWord: "lager",
    highWord: "hoger",
  },
  steps: {
    what: "Het aantal stappen per dag, inclusief je hardlooprondes.",
    read: "Stappen zijn een maat voor je dagelijkse beweging buiten training. Een lager aantal na een zware week is normaal; een aanhoudend laag aantal betekent dat je veel zit.",
    tips: ["Dagelijkse beweging buiten je runs helpt het herstel."],
    lowWord: "lager",
    highWord: "hoger",
  },
  exerciseMinutes: {
    what: "Trainingsminuten zijn de minuten per dag dat je Watch je inspanning als training telt (de groene ring).",
    read: "Dit telt al je beweging op stevig tempo, niet alleen hardlopen. Het zegt iets over je totale belasting naast je runs.",
    tips: ["Veel trainingsminuten op een dag zonder run betekent extra belasting voor je herstel."],
    lowWord: "lager",
    highWord: "hoger",
  },
  runningPowerW: {
    what: "Loopvermogen is het vermogen in watt dat je Watch schat dat je tijdens het hardlopen levert.",
    read: "Hoger betekent meer inspanning, niet per se beter. Vermogen is handig om inspanning op heuvels en bij wind te vergelijken.",
    tips: ["Vergelijk het vermogen bij gelijk tempo over tijd: gelijk vermogen bij hoger tempo is vooruitgang."],
    lowWord: "lager",
    highWord: "hoger",
  },
  runningStrideLengthM: {
    what: "Pasbreedte is de afstand die je per stap aflegt tijdens het hardlopen.",
    read: "Een langere pas komt vaak met een hoger tempo. De pasbreedte hoeft niet te verbeteren om sneller te worden.",
    tips: ["Zie het als context bij je tempo, niet als doel."],
    lowWord: "korter",
    highWord: "langer",
  },
  runningGroundContactTimeMs: {
    what: "Grondcontacttijd is hoe lang je voet per stap de grond raakt, in milliseconden.",
    read: "Korter is meestal efficiënter en komt bij een hoger tempo vanzelf. Het loopt op bij vermoeidheid.",
    tips: ["Een stijging op het einde van een lange run is normaal."],
    lowWord: "korter",
    highWord: "langer",
  },
  runningVerticalOscillationCm: {
    what: "Verticale beweging is hoeveel je lichaam per stap op en neer gaat tijdens het hardlopen, in centimeters.",
    read: "Minder op en neer betekent dat meer van je energie naar voren gaat. Het verschilt per loper en per tempo.",
    tips: ["Alleen een duidelijke stijging over meerdere runs is de moeite waard om op te letten."],
    lowWord: "lager",
    highWord: "hoger",
  },
};

function fmt(value: number, digits: number) {
  return value.toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const digitsFor = (trend: HealthTrend) => (trend.key === "runningStrideLengthM" ? 2 : trend.key === "vo2Max" || trend.key === "weightKg" || trend.key === "respiratoryRate" || trend.key === "oxygenSaturationPct" || trend.key === "runningVerticalOscillationCm" ? 1 : 0);

/** Korte kaartlabel. Kleur komt uit `direction`, de tekst beschrijft alleen wat er gebeurt. */
export function badgeLabel(trend: HealthTrend, guide: MetricGuide | undefined = METRIC_GUIDE[trend.key]) {
  if (trend.severity == null || trend.zScore == null) return "Nog geen basislijn";
  if (trend.severity === "normal") return "Normaal voor jou";
  const word = trend.zScore < 0 ? guide?.lowWord ?? "lager" : guide?.highWord ?? "hoger";
  return trend.severity === "mild" ? `Iets ${word} dan normaal` : `Duidelijk ${word} dan normaal`;
}

export function badgeTone(trend: HealthTrend): "better" | "worse" | "mild" | "flat" | "changed" | "unknown" {
  if (trend.severity == null) return "unknown";
  if (trend.direction === "worse" && trend.severity === "mild") return "mild";
  return trend.direction;
}

/** Leg in gewone taal uit wat het verschil tussen "nu" en "basis" betekent voor deze meting. */
export function describeTrend(trend: HealthTrend, guide: MetricGuide | undefined = METRIC_GUIDE[trend.key]) {
  const digits = digitsFor(trend);
  if (trend.current == null) {
    return { headline: "Geen recente meting", body: trend.currentAgeDays != null ? `De laatste meting is ${trend.currentAgeDays} dagen oud. Pulse gebruikt waarden die ouder zijn dan de beoordelingsperiode niet voor een oordeel.` : "Pulse heeft deze meting nog nooit ontvangen.", conclusion: null as string | null };
  }
  const nu = `${fmt(trend.current, digits)} ${trend.unit}`;
  if (trend.baseline == null || trend.severity == null || trend.deltaPct == null || trend.baselineSd == null) {
    return { headline: `${nu} (nu)`, body: `Je gemiddelde over de laatste ${trend.recentDays} dagen is ${nu}. Er zijn nog te weinig eerdere metingen (${trend.baselineCount} van minimaal 3 in de ${trend.baselineDays} dagen ervoor) om te zeggen wat voor jou normaal is.`, conclusion: null };
  }
  const direction = trend.deltaPct >= 0 ? guide?.highWord ?? "hoger" : guide?.lowWord ?? "lager";
  const sd = `${fmt(trend.baselineSd, digits === 0 ? 1 : digits)} ${trend.unit}`;
  const body = `Nu is het gemiddelde van je laatste ${trend.recentDays} dagen ${nu}. Je basis is het gemiddelde van de ${trend.baselineDays} dagen daarvoor: ${fmt(trend.baseline, digits)} ${trend.unit}. Dat is ${fmt(Math.abs(trend.deltaPct), 1)}% ${direction}. Van dag tot dag schommelt deze waarde bij jou normaal met ongeveer ${sd} rond je basis.`;
  let conclusion: string;
  let headline: string;
  if (trend.severity === "normal") {
    headline = "Binnen je normale schommeling";
    conclusion = "Het verschil is kleiner dan je gebruikelijke schommeling: dit is ruis, geen signaal. Je hoeft niets te doen.";
  } else if (trend.severity === "mild") {
    headline = trend.direction === "worse" ? "Lichte afwijking, let erop" : trend.direction === "better" ? "Lichte verbetering" : "Lichte verandering";
    conclusion = trend.direction === "worse"
      ? "Het verschil is groter dan je gewone schommeling, maar nog niet groot. Eén dag zegt weinig: kijk of het de komende dagen aanhoudt voordat je iets aanpast."
      : "Het verschil is groter dan je gewone schommeling, in een gunstige of neutrale richting.";
  } else if (trend.direction === "worse") {
    headline = "Duidelijke afwijking";
    conclusion = `Het verschil is groter dan je volledige gebruikelijke schommeling, in de ongunstige richting. Veelvoorkomende oorzaken: ${(guide?.causesWorse ?? ["vermoeidheid", "stress"]).join(", ")}. Houd je training rustig als dit samengaat met andere signalen.`;
  } else if (trend.direction === "better") {
    headline = "Duidelijke verbetering";
    conclusion = "Het verschil is groter dan je gebruikelijke schommeling, in een gunstige richting. Dat past bij een betere conditie of goed herstel.";
  } else {
    headline = "Duidelijke verandering";
    conclusion = "Het verschil is groter dan je gebruikelijke schommeling. Voor deze meting is hoger of lager niet per se beter; het is vooral een verandering om te volgen.";
  }
  return { headline, body, conclusion };
}
