import type { activities } from "@/db/schema";

type Activity = typeof activities.$inferSelect;
export type HalfMarathonPlan = { phase: string; phaseReason: string; summary: string; longestRunKm: number; distanceProgressPct: number; last28DaysKm: number; runsPerWeek: number; activeWeeks: number; adjustments: Array<{ label: string; title: string; detail: string; action: string }>; week: Array<{ day: string; title: string; detail: string; tone: "rest" | "easy" | "quality" | "long" }> };
const DAY_MS = 86_400_000;
const km = (run: Activity) => Math.max(0, run.distanceM ?? 0) / 1000;
function formatPace(value: number) { let minutes = Math.floor(value); let seconds = Math.round((value - minutes) * 60); if (seconds === 60) { minutes += 1; seconds = 0; } return `${minutes}:${String(seconds).padStart(2, "0")}`; }

export function buildHalfMarathonPlan(runs: Activity[], now = new Date()): HalfMarathonPlan {
  const recent = runs.filter((run) => run.startDate.getTime() >= now.getTime() - 42 * DAY_MS);
  const last28 = runs.filter((run) => run.startDate.getTime() >= now.getTime() - 28 * DAY_MS);
  const longestRunKm = recent.reduce((max, run) => Math.max(max, km(run)), 0);
  const last28DaysKm = last28.reduce((sum, run) => sum + km(run), 0);
  const runsPerWeek = recent.length / 6;
  const activeWeeks = new Set(recent.map((run) => Math.min(5, Math.floor((now.getTime() - run.startDate.getTime()) / (7 * DAY_MS))))).size;
  const validPaces = recent.flatMap((run) => run.avgPaceMinPerKm && run.avgPaceMinPerKm > 2 ? [run.avgPaceMinPerKm] : []);
  const averagePace = validPaces.length ? validPaces.reduce((sum, pace) => sum + pace, 0) / validPaces.length : null;
  const nextLongRun = Math.min(18, Math.max(6, Math.round((longestRunKm + (longestRunKm < 10 ? 1 : 1.5)) * 2) / 2));
  let phase = "Basis bouwen";
  let phaseReason = "Eerst een betrouwbaar weekritme, daarna pas meer snelheid.";
  if (runsPerWeek >= 2.5 && longestRunKm >= 12) { phase = "Specifiek voorbereiden"; phaseReason = "Je ritme en lange duur zijn sterk genoeg om gericht aan halve-marathonsnelheid te werken."; }
  else if (runsPerWeek >= 2 && longestRunKm >= 8) { phase = "Afstand uitbreiden"; phaseReason = "Je basis staat; vergroot nu geleidelijk je lange duurloop."; }
  const easyPace = averagePace == null ? "praattempo" : `${formatPace(averagePace + 0.45)}–${formatPace(averagePace + 1.05)}/km`;
  const consistencyAction = runsPerWeek < 2 ? "Begin met 2 loopdagen" : runsPerWeek < 3 ? "Bouw naar 3 loopdagen" : "Houd 3–4 loopdagen vast";
  const summary = longestRunKm >= 18 ? "De afstand is binnen bereik. De meeste winst zit nu in regelmaat en gecontroleerde tempoblokken." : longestRunKm >= 10 ? `Je bent op weg: ${longestRunKm.toFixed(1)} km is al ${Math.round((longestRunKm / 21.1) * 100)}% van de afstand. Bouw zonder haast door.` : "De snelste route naar 21,1 km begint met rustige, herhaalbare weken. Eerst belastbaarheid, daarna wedstrijdtempo.";
  return {
    phase, phaseReason, summary, longestRunKm, distanceProgressPct: Math.min(100, Math.round((longestRunKm / 21.1) * 100)), last28DaysKm, runsPerWeek, activeWeeks,
    adjustments: [
      { label: "Regelmaat", title: consistencyAction, detail: "Verspreid de trainingen over de week en houd minstens één hersteldag na een zware prikkel.", action: `${Math.max(2, Math.min(4, Math.ceil(runsPerWeek || 2)))}× per week` },
      { label: "Lange duur", title: `Werk rustig naar ${nextLongRun.toFixed(1)} km`, detail: "Verleng alleen als de vorige lange duur comfortabel herstelde. Een stap terug in een drukke week is ook trainen.", action: "1× per week" },
      { label: "Snelheid", title: "Eén kwaliteitsprikkel is genoeg", detail: runsPerWeek < 2.5 ? "Maak eerst je rustige loopritme stabiel. Voeg daarna korte, beheerste tempoblokken toe." : "Loop bijvoorbeeld 3 × 8 minuten stevig, met 3 minuten rustig herstel. Niet voluit.", action: runsPerWeek < 2.5 ? "Later toevoegen" : "Max. 1× per week" },
      { label: "Rustig tempo", title: `Richtwaarde: ${easyPace}`, detail: "Je moet in volledige zinnen kunnen praten. Hartslag loopt per dag uiteen; het gevoel blijft leidend.", action: "Meeste kilometers" },
    ],
    week: [
      { day: "Ma", title: "Herstel", detail: "Rust of wandelen", tone: "rest" }, { day: "Di", title: "Rustig", detail: `30–45 min · ${easyPace}`, tone: "easy" }, { day: "Wo", title: "Herstel", detail: "Mobiliteit of rust", tone: "rest" }, { day: "Do", title: runsPerWeek >= 2.5 ? "Tempo" : "Rustig", detail: runsPerWeek >= 2.5 ? "3 × 8 min beheerst" : `30 min · ${easyPace}`, tone: runsPerWeek >= 2.5 ? "quality" : "easy" }, { day: "Vr", title: "Rust", detail: "Slaap en voeding", tone: "rest" }, { day: "Za", title: "Losmaken", detail: "20–30 min optioneel", tone: "easy" }, { day: "Zo", title: "Lange duur", detail: `Opbouwen naar ${nextLongRun.toFixed(1)} km`, tone: "long" },
    ],
  };
}
