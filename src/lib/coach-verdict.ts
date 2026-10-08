import type { DigestRow } from "./run-analysis.ts";

export type CoachTone = "good" | "warning" | "critical" | "unknown";
export type CoachVerdict = { tone: CoachTone; label: string; reason: string; action: string };

export function loadVerdict(changePct: number | null, weeklyKm: number): CoachVerdict {
  if (changePct == null) return { tone: "unknown", label: "Weekbasis ontbreekt", reason: "Er zijn nog te weinig actieve weken voor een betrouwbare vergelijking.", action: "Loop regelmatig en beoordeel de weekbelasting opnieuw zodra er minstens drie eerdere loopweken zijn." };
  if (changePct > 30) return { tone: "critical", label: "Belasting te snel gestegen", reason: `${changePct}% boven je eigen vierweekse basis bij ${weeklyKm.toFixed(1).replace(".", ",")} km in zeven dagen.`, action: "Voeg deze week geen extra intensieve sessie toe; houd je volgende loop rustig." };
  if (changePct < -30) return { tone: "warning", label: "Ritme teruggevallen", reason: `${Math.abs(changePct)}% onder je eigen vierweekse basis.`, action: "Herpak je normale ritme met een korte rustige loop. Probeer gemiste kilometers niet in te halen." };
  return { tone: "good", label: "Belasting onder controle", reason: `${Math.abs(changePct)}% ${changePct >= 0 ? "boven" : "onder"} je eigen vierweekse basis.`, action: "Houd dit ritme vast en voer alleen de geplande sessie uit." };
}

export function recoveryVerdict(score: number | null, stale: boolean): CoachVerdict {
  if (stale) return { tone: "unknown", label: "Hersteldata zijn verouderd", reason: "De Apple Health-meting is ouder dan één dag of ontbreekt.", action: "Synchroniseer Apple Health voordat je een zware training op herstel baseert." };
  if (score == null) return { tone: "unknown", label: "Herstel nog niet beoordeelbaar", reason: "Er zijn minder dan twee actuele signalen met een eigen basislijn.", action: "Synchroniseer dagelijks. Houd de training voorlopig comfortabel en beoordeel ook je eigen gevoel." };
  if (score < 58) return { tone: "critical", label: "Herstel onder druk", reason: `Herstelscore ${score}/100 op basis van jouw recente basislijn.`, action: "Sla intensiteit vandaag over. Kies rust of zeer rustig bewegen en beoordeel morgen opnieuw." };
  if (score < 78) return { tone: "warning", label: "Herstel vraagt om beheersing", reason: `Herstelscore ${score}/100; dit is geen groen licht voor extra intensiteit.`, action: "Voer alleen de rustige geplande training uit en voeg geen extra snelle blokken toe." };
  return { tone: "good", label: "Herstel geeft ruimte", reason: `Herstelscore ${score}/100 ten opzichte van je eigen basislijn.`, action: "Volg de geplande training. Schakel terug als je benen of ademhaling anders aanvoelen." };
}

export function goalVerdict(level: "basis opbouwen" | "afstand uitbreiden" | "gericht voorbereiden", daysUntilRace: number): CoachVerdict {
  if (daysUntilRace < 0) return { tone: "unknown", label: "Wedstrijd voorbij", reason: "De ingestelde wedstrijddatum is verlopen.", action: "Stel een nieuwe datum en een realistisch doeltempo in." };
  if (level === "basis opbouwen") return { tone: "critical", label: "Doel nog niet gedragen door je loopbasis", reason: "Je recente regelmaat en lange duurloop zijn nog onvoldoende voor gerichte voorbereiding.", action: "Bouw nu rustige, regelmatige loopdagen op. Forceer de doelpace of een grote sprong in afstand niet." };
  if (level === "afstand uitbreiden") return { tone: "warning", label: "Afstand is je belangrijkste werkpunt", reason: "Je loopritme is aanwezig, maar de recente lange duurloop blijft achter op het doel.", action: "Volg de geplande rustige lange duurlopen. Voeg pas snelheid toe als de afstand goed gaat." };
  return { tone: "good", label: "Basis voor gerichte voorbereiding aanwezig", reason: "Je recente ritme en lange duurloop ondersteunen een gericht schema.", action: "Volg het dagschema en houd zware en rustige dagen gescheiden." };
}

export function runVerdict(digest: DigestRow | null | undefined, nextStep: string): CoachVerdict {
  if (!digest) return { tone: "unknown", label: "Run nog niet beoordeelbaar", reason: "Er zijn nog geen bruikbare gegevens voor deze loop.", action: "Haal de Strava-details op en open de analyse opnieuw." };
  const tone = digest.tone === "watch" ? "critical" : digest.tone === "good" ? "good" : "warning";
  return { tone, label: digest.verdict, reason: digest.detail, action: nextStep };
}

export function journalAction(digest: DigestRow | null | undefined) {
  if (!digest) return "Haal de Strava-details op en open de run opnieuw.";
  if (!digest.hasSplits) return "Open de run en haal kilometersplits op voor een oordeel over het verloop.";
  if (digest.pattern === "fade" || digest.pattern === "heavy-fade") return "Begin je volgende vergelijkbare run rustiger en houd het middenstuk gelijkmatig.";
  if (digest.tone === "watch") return "Loop je volgende training rustig en controleer het aandachtspunt in de volledige analyse.";
  if (digest.tone === "good") return "Herhaal wat hier goed ging; voeg alleen de geplande volgende trainingsprikkel toe.";
  return "Gebruik de splits als context en volg je geplande volgende training.";
}
