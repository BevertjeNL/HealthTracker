import { formatPaceSec, type DigestRow, type PacingAnalysis, type RunKind } from "./run-analysis.ts";
import { coreSegments, segmentRange } from "./run-structure.ts";
import type { PaceReserve } from "./run-prescription.ts";

export type RunLesson = { headline: string; meaning: string; keep: string; improve: string; nextRun: string; tone: "good" | "warning" | "critical" };

const pace = (sec: number) => `${formatPaceSec(sec)}/km`;
const withHr = (hr: number | null) => (hr != null ? ` (hartslag ${Math.round(hr)})` : "");

/** Lesson for a run with a clear structure: judged per part, never as one fading effort. */
function structureLesson(pacing: PacingAnalysis, nextStep: string): RunLesson {
  const structure = pacing.structure!;
  const core = coreSegments(structure);
  const fast = core.filter((segment) => segment.role === "snel");
  const easy = core.filter((segment) => segment.role === "rustig" || segment.role === "herstel");
  const watch = pacing.advice.find((item) => item.tone === "watch");
  const good = pacing.advice.find((item) => item.tone === "good");
  const block = fast[0], rest = easy[0];
  const km = (meters: number) => (meters / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 });
  if (structure.shape === "intervals") return {
    headline: `${fast.length} snelle delen met herstel`,
    meaning: `Snelle delen op ${pace(structure.fastPaceSec)}, herstel op ${pace(structure.easyPaceSec)}. ${(watch ?? good ?? pacing.advice[0])?.detail ?? ""}`.trim(),
    keep: good ? good.detail : "Houd het herstel rustig.",
    improve: watch ? watch.detail : "Loop het laatste snelle deel net zo vlot als het eerste. Maak de eerste herhaling niet de snelste.",
    nextRun: nextStep,
    tone: watch ? "warning" : "good",
  };
  const facts = `${block ? `${segmentRange(block)} liep je op ${pace(block.paceSec)}${withHr(block.hr)}` : ""}${block && rest ? ", " : ""}${rest ? `${segmentRange(rest)} op ${pace(rest.paceSec)}${withHr(rest.hr)}` : ""}. Dat is ${Math.round(structure.separationSec)} s/km verschil.`;
  const whole = pacing.avgPaceSec;
  if (pacing.needsConfirmation) return {
    headline: structure.shape === "fast-finish" ? "Je liep rustig en eindigde snel" : structure.shape === "mid-block" ? "Je liep een blok in het midden sneller" : "Je liep in twee delen",
    meaning: facts,
    keep: "Elk deel was gelijkmatig; het verschil is een stap, geen wegzakken.",
    improve: `Was het snelle deel bedoeld, dan beoordeel ik elk deel apart. Wilde je één rustige loop, dan startte je te snel: begin op ${pace(whole)}.`,
    nextRun: nextStep,
    tone: "good",
  };
  const shapeHeadline = structure.shape === "fast-start" ? `Snel deel${block ? ` van ${km(block.distanceM)} km` : ""}, daarna rustig` : structure.shape === "fast-finish" ? "Rustig opgebouwd naar een snel einde" : "Tempoblok met in- en uitloop";
  const keep = watch?.tone === "watch" ? "Je voerde de opzet uit: een snel deel en een rustig deel." : (good?.detail ?? "Je voerde de opzet uit: een snel deel en een rustig deel.");
  const improve = watch ? watch.detail : block && rest && block.hr != null && rest.hr != null ? `Het rustige deel zat ${Math.round(block.hr - rest.hr)} slagen lager: goed zo. Maak het snelle deel niet langer zonder extra herstel.` : "Houd het rustige deel minstens 20 s/km langzamer dan het snelle.";
  return { headline: shapeHeadline, meaning: facts, keep, improve, nextRun: nextStep, tone: watch ? "warning" : "good" };
}

export function buildRunLesson(kind: RunKind, digest: DigestRow | null | undefined, pacing: PacingAnalysis | null, nextStep: string, reserve: PaceReserve | null = null): RunLesson {
  const start = pacing?.firstUnitDeltaSec;
  const fade = pacing?.splitDiffSec;
  const even = pacing ? formatPaceSec((pacing.firstHalfPaceSec + pacing.secondHalfPaceSec) / 2) : "";
  const evenSlower = pacing ? formatPaceSec((pacing.firstHalfPaceSec + pacing.secondHalfPaceSec) / 2 + 3) : "";
  const subject = kind === "race" ? "wedstrijd" : kind === "long" ? "lange duurloop" : "loop";
  if (pacing?.structure && pacing.structureApplied) return structureLesson(pacing, nextStep);
  if (pacing && fade != null && fade >= 15 && kind !== "interval") return {
    headline: "Je tempo zakte in de tweede helft",
    meaning: `Tweede helft ${Math.round(fade)} s/km langzamer: je begin was te snel voor deze afstand.`,
    keep: "Je hebt de afstand afgemaakt.",
    improve: `Gelijk had gekund op ${even}/km. Je liep ${formatPaceSec(pacing.firstHalfPaceSec)}, daarna ${formatPaceSec(pacing.secondHalfPaceSec)}. Start de volgende ${subject} op ${even}–${evenSlower}/km en versnel pas in het laatste derde.`,
    nextRun: nextStep,
    tone: "critical",
  };
  if (pacing && start != null && start <= -10 && kind !== "interval") return {
    headline: "Je startte te snel",
    meaning: `Kilometer 1 was ${Math.abs(Math.round(start))} s/km sneller dan de rest.`,
    keep: "Je opening laat zien dat je snelheid hebt.",
    improve: `Start op ${formatPaceSec(pacing.avgPaceSec)}/km, je gemiddelde van deze loop. Check na 10 minuten of ademhaling en hartslag stabiel zijn.`,
    nextRun: nextStep,
    tone: "warning",
  };
  if (pacing?.pattern === "variable" && kind !== "interval" && !pacing.gradeAdjusted) return {
    headline: "Je tempo schommelde",
    meaning: "Snelle en langzame kilometers wisselden af.",
    keep: "Je liep door.",
    improve: "Kies een vlak parcours, loop de eerste 10 minuten rustig en houd daarna elke kilometer even snel.",
    nextRun: nextStep,
    tone: "warning",
  };
  if (pacing && fade != null && fade >= 5 && kind !== "interval") return {
    headline: "Je verloor tempo richting de finish",
    meaning: `Tweede helft ${Math.round(fade)} s/km langzamer.`,
    keep: "Je liep de volledige afstand.",
    improve: `Gelijk tempo had rond ${even}/km gelegen. Start daar en check halverwege je ademhaling.`,
    nextRun: nextStep,
    tone: "warning",
  };
  if (pacing && (pacing.pattern === "negative" || pacing.pattern === "even")) {
    const negative = pacing.pattern === "negative";
    const base = { keep: negative ? "Herhaal deze beheerste start." : "Herhaal deze verdeling.", nextRun: nextStep };
    if (reserve?.hasReserve && reserve.push) {
      const push = `${formatPaceSec(reserve.push.fast)}–${formatPaceSec(reserve.push.slow)}/km`;
      const improve = kind === "race" ? `Loop de eerste helft weer op ${formatPaceSec(reserve.firstHalfPaceSec)}/km en versnel vanaf de helft naar ${push}. Blijft je hartslag stabiel, houd het vast tot de finish.`
        : kind === "long" ? `Maak het laatste derde progressief: ${push}. Houd de eerste twee derde gelijk.`
        : `Houd de rustige kilometers zoals nu en sluit de laatste 1–2 km vlotter af op ${push}.`;
      return { headline: "Je had ruimte voor een snellere tweede helft", meaning: `Je tweede helft lag op ${formatPaceSec(reserve.secondHalfPaceSec)}/km en ${reserve.reason}. Die reserve gebruikte je niet.`, ...base, improve, tone: "good" };
    }
    return { headline: negative ? "Je bouwde sterk op" : "Je hield je tempo vast", meaning: negative ? "Tweede helft sneller dan de eerste." : "Beide helften dicht bij elkaar.", ...base, improve: kind === "race" ? "Herhaal deze verdeling. Je cijfers tonen geen reserve, dus een snellere tweede helft is nu geen advies." : "Herhaal deze verdeling. Meer zat er niet in: houd het tempo gelijk.", tone: "good" };
  }
  if (kind === "interval") return {
    headline: "Je deed een snelheidstraining",
    meaning: digest?.detail || "Snelle blokken geven een andere prikkel dan een duurloop.",
    keep: "Houd de herstelstukken rustig, dan blijven de snelle blokken netjes.",
    improve: "Maak de eerste herhaling niet de snelste en loop de laatste net zo vlot.",
    nextRun: nextStep,
    tone: digest?.tone === "watch" ? "warning" : "good",
  };
  return {
    headline: digest && digest.tone !== "info" ? digest.verdict : kind === "long" ? "Lange loop: uithoudingsvermogen" : kind === "race" ? "Wedstrijd: kijk naar je tempokeuze" : "Rustige loop: houd het laag",
    meaning: digest && digest.tone !== "info" ? digest.detail : kind === "long" ? "De lange loop traint het volhouden van de afstand. Het tempo mag laag." : kind === "race" ? "Bij een wedstrijd telt een beheerste start meer dan een snelle eerste kilometer." : "Houd rustige loopjes rustig, dan blijft je tempotraining scherp.",
    keep: kind === "long" ? "Houd de lange loop rustig." : kind === "race" ? "Behoud de afstand die je al aankunt." : "Houd een tempo waarop je kunt praten.",
    improve: kind === "race" ? "Begin je volgende wedstrijd beheerst en loop vanaf het midden gelijkmatig." : "Maak van deze loop geen wedstrijd. Bewaar snelle stukken voor je tempotraining.",
    nextRun: nextStep,
    tone: digest?.tone === "watch" ? "warning" : "good",
  };
}
