import { formatPaceSec, type DigestRow, type PacingAnalysis, type RunKind } from "./run-analysis.ts";
import type { PaceReserve } from "./run-prescription.ts";

export type RunLesson = { headline: string; meaning: string; keep: string; improve: string; nextRun: string; tone: "good" | "warning" | "critical" };

export function buildRunLesson(kind: RunKind, digest: DigestRow | null | undefined, pacing: PacingAnalysis | null, nextStep: string, reserve: PaceReserve | null = null): RunLesson {
  const start = pacing?.firstUnitDeltaSec;
  const fade = pacing?.splitDiffSec;
  const even = pacing ? formatPaceSec((pacing.firstHalfPaceSec + pacing.secondHalfPaceSec) / 2) : "";
  const evenSlower = pacing ? formatPaceSec((pacing.firstHalfPaceSec + pacing.secondHalfPaceSec) / 2 + 3) : "";
  const subject = kind === "race" ? "wedstrijd" : kind === "long" ? "lange duurloop" : "loop";
  if (pacing && fade != null && fade >= 15 && kind !== "interval") return {
    headline: "Je tempo zakte fors in de tweede helft",
    meaning: `De tweede helft was ${Math.round(fade)} seconden per kilometer langzamer. Je snelheid aan het begin was niet vol te houden tot de finish.`,
    keep: "Je hebt de afstand afgemaakt. Die duurcapaciteit is een sterke basis.",
    improve: `Gelijk verdelen had betekend: beide helften op ongeveer ${even}/km. Je liep ${formatPaceSec(pacing.firstHalfPaceSec)} en daarna ${formatPaceSec(pacing.secondHalfPaceSec)}. Start de volgende ${subject} op ${even}–${evenSlower}/km en bewaar je versnelling voor het laatste derde.`,
    nextRun: nextStep,
    tone: "critical",
  };
  if (pacing && start != null && start <= -10 && kind !== "interval") return {
    headline: "Je startte te snel",
    meaning: `De eerste kilometer was ${Math.abs(Math.round(start))} seconden per kilometer sneller dan de kilometers erna. Dat maakte een gelijkmatige loop moeilijker.`,
    keep: "Je snelle opening laat zien dat je snelheid hebt.",
    improve: `Start op ongeveer ${formatPaceSec(pacing.avgPaceSec)}/km, je gemiddelde van deze loop. Kijk na 10 minuten of ademhaling en hartslag stabiel zijn en bouw dan pas verder op.`,
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
    improve: `Een gelijk tempo had rond ${even}/km gelegen. Start daar en controleer halverwege of je ademhaling nog beheerst is.`,
    nextRun: nextStep,
    tone: "warning",
  };
  if (pacing && (pacing.pattern === "negative" || pacing.pattern === "even")) {
    const negative = pacing.pattern === "negative";
    const base = { keep: negative ? "Herhaal deze beheerste start: je kwam sterker terug." : "Herhaal deze gelijkmatige verdeling: je hield het vol.", nextRun: nextStep };
    if (reserve?.hasReserve && reserve.push) {
      const push = `${formatPaceSec(reserve.push.fast)}–${formatPaceSec(reserve.push.slow)}/km`;
      const improve = kind === "race" ? `Loop de eerste helft opnieuw op ${formatPaceSec(reserve.firstHalfPaceSec)}/km en versnel vanaf de helft naar ${push}. Is je hartslag daarbij stabiel, dan houd je die versnelling vast tot de finish.`
        : kind === "long" ? `Maak het laatste derde progressief: ${push}. Hou de eerste twee derde op hetzelfde tempo als nu.`
        : `Houd de rustige kilometers zoals nu en sluit de laatste 1–2 kilometer vlotter af op ${push}. Dat blijft ruim onder je drempel en traint je om moe snel te lopen.`;
      return { headline: "Je had ruimte voor een snellere tweede helft", meaning: `Je tweede helft lag op ${formatPaceSec(reserve.secondHalfPaceSec)}/km en ${reserve.reason}. Dat is reserve die je nog niet gebruikte.`, ...base, improve, tone: "good" };
    }
    return { headline: negative ? "Je bouwde de loop sterk op" : "Je hield je tempo goed vast", meaning: negative ? "Je tweede helft was sneller dan de eerste." : "Je eerste en tweede helft bleven dicht bij elkaar.", ...base, improve: kind === "race" ? "Herhaal deze verdeling. Je cijfers laten geen duidelijke reserve zien, dus een snellere tweede helft is nu geen aanbeveling. Winst komt uit training, niet uit een snellere start." : "Herhaal deze verdeling. Er is geen aanwijzing dat je meer had, dus houd het tempo gelijk.", tone: "good" };
  }
  if (kind === "interval") return {
    headline: "Je deed een snelheidstraining",
    meaning: digest?.detail || "Snelle blokken geven een andere prikkel dan een rustige duurloop.",
    keep: "Houd de herstelstukken echt rustig, zodat de snelle blokken technisch netjes blijven.",
    improve: "Maak de eerste snelle herhaling niet de snelste. Probeer je laatste herhaling even vlot en beheerst te lopen.",
    nextRun: nextStep,
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
