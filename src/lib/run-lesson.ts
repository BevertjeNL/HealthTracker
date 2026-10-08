import type { DigestRow, PacingAnalysis, RunKind } from "./run-analysis.ts";

export type RunLesson = { headline: string; meaning: string; keep: string; improve: string; nextRun: string; tone: "good" | "warning" | "critical" };

export function buildRunLesson(kind: RunKind, digest: DigestRow | null | undefined, pacing: PacingAnalysis | null, nextStep: string): RunLesson {
  const start = pacing?.firstUnitDeltaSec;
  const fade = pacing?.splitDiffSec;
  if (pacing && fade != null && fade >= 15 && kind !== "interval") return {
    headline: "Je tempo zakte fors in de tweede helft",
    meaning: `De tweede helft was ${Math.round(fade)} seconden per kilometer langzamer. Je snelheid aan het begin was niet vol te houden tot de finish.`,
    keep: "Je hebt de afstand afgemaakt. Die duurcapaciteit is een sterke basis.",
    improve: "Open de volgende vergelijkbare loop rustiger: de eerste 2 kilometer 10–15 seconden per kilometer langzamer. Zoek daarna een tempo dat je tot het einde gelijk kunt houden.",
    nextRun: nextStep,
    tone: "critical",
  };
  if (pacing && start != null && start <= -10 && kind !== "interval") return {
    headline: "Je startte te snel",
    meaning: `De eerste kilometer was ${Math.abs(Math.round(start))} seconden per kilometer sneller dan de kilometers erna. Dat maakte een gelijkmatige loop moeilijker.`,
    keep: "Je snelle opening laat zien dat je snelheid hebt.",
    improve: "Loop de eerste 10 minuten bewust rustig. Kijk pas daarna op je doeltempo en verhoog stap voor stap.",
    nextRun: nextStep,
    tone: "warning",
  };
  if (pacing?.pattern === "variable" && kind !== "interval" && !pacing.gradeAdjusted) return {
    headline: "Je tempo schommelde te veel",
    meaning: "De snelle en langzame kilometers wisselden elkaar af. Daardoor was de inspanning minder gelijkmatig.",
    keep: "Je bleef doorlopen; dat is de basis voor een betere verdeling.",
    improve: "Kies voor de volgende rustige duurloop een vlak parcours. Loop de eerste 10 minuten rustig en houd daarna elke kilometer ongeveer hetzelfde tempo.",
    nextRun: nextStep,
    tone: "warning",
  };
  if (pacing && fade != null && fade >= 5 && kind !== "interval") return {
    headline: "Je verloor wat tempo richting de finish",
    meaning: `De tweede helft was ${Math.round(fade)} seconden per kilometer langzamer. Dat is een teken om de verdeling te verbeteren.`,
    keep: "Je liep de volledige afstand; behoud die regelmaat.",
    improve: "Start de volgende vergelijkbare loop iets rustiger en controleer halverwege of je ademhaling nog beheerst is.",
    nextRun: nextStep,
    tone: "warning",
  };
  if (pacing && (pacing.pattern === "negative" || pacing.pattern === "even")) return {
    headline: pacing.pattern === "negative" ? "Je bouwde de loop sterk op" : "Je hield je tempo goed vast",
    meaning: pacing.pattern === "negative" ? "Je tweede helft was sneller dan de eerste. Je had je inspanning goed verdeeld." : "Je eerste en tweede helft bleven dicht bij elkaar. Dat is precies wat je bij een beheerste loop zoekt.",
    keep: "Herhaal deze rustige start en gelijkmatige verdeling in je volgende vergelijkbare training.",
    improve: "Ga niet harder starten om tijd te winnen. Versnel pas in het laatste deel als je nog controle hebt.",
    nextRun: nextStep,
    tone: "good",
  };
  if (kind === "interval") return {
    headline: "Je deed een snelheidstraining",
    meaning: digest?.detail || "Snelle blokken geven een andere prikkel dan een rustige duurloop.",
    keep: "Houd de herstelstukken echt rustig, zodat de snelle blokken technisch netjes blijven.",
    improve: "Maak de eerste snelle herhaling niet de snelste. Probeer je laatste herhaling even vlot en beheerst te lopen.",
    nextRun: "Loop je volgende training rustig op praattempo; herhaal geen zware sessie op opeenvolgende dagen.",
    tone: digest?.tone === "watch" ? "warning" : "good",
  };
  return {
    headline: digest && digest.tone !== "info" ? digest.verdict : kind === "long" ? "Lange loop: bouw je uithoudingsvermogen" : kind === "race" ? "Wedstrijd: kijk naar je tempokeuze" : "Rustige loop: houd de inspanning laag",
    meaning: digest && digest.tone !== "info" ? digest.detail : kind === "long" ? "De lange loop traint je om de afstand langer vol te houden. Het tempo hoeft hierbij niet hoog te zijn." : kind === "race" ? "Bij een wedstrijd is een beheerste start belangrijker dan een snelle eerste kilometer." : "Deze training moet gemakkelijk genoeg blijven om je volgende tempotraining goed te kunnen doen.",
    keep: kind === "long" ? "Behoud de rustige lange duurloop: die oefent het volhouden van de afstand." : kind === "race" ? "Behoud de afstand die je al aankunt. Daarop kun je een gelijkmatiger race bouwen." : "Behoud een rustig tempo waarop je nog een gesprek kunt voeren.",
    improve: kind === "race" ? "Begin je volgende wedstrijd beheerst en probeer vanaf het midden gelijkmatig te lopen." : "Maak van deze loop geen wedstrijd. Bewaar snelle stukken voor de geplande tempotraining.",
    nextRun: nextStep,
    tone: digest?.tone === "watch" ? "warning" : "good",
  };
}
