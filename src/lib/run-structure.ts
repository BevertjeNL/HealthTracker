import type { PaceUnit } from "./run-analysis.ts";

/**
 * Pure structure detection from kilometer splits or laps. Finds abrupt step changes in pace
 * (a fast block followed by easy running, a tempo block in the middle, repeated fast blocks) and
 * leaves gradual slides and one-off fast kilometers to the normal pacing analysis.
 */

export type SegmentClass = "snel" | "rustig";
export type SegmentRole = "inloop" | "snel" | "rustig" | "herstel" | "uitloop";
export type StructureShape = "intervals" | "fast-start" | "fast-finish" | "mid-block";

export type StructureSegment = {
  role: SegmentRole;
  startM: number;
  endM: number;
  distanceM: number;
  timeS: number;
  paceSec: number;
  hr: number | null;
  units: number;
  /** Tempo tweede helft min eerste helft binnen het deel; positief = langzamer. null onder 3 eenheden. */
  trendSec: number | null;
  /** Verschil tussen snelste en langzaamste eenheid in het deel. null onder 2 eenheden. */
  spreadSec: number | null;
};

export type RunStructure = {
  shape: StructureShape;
  segments: StructureSegment[];
  fastPaceSec: number;
  easyPaceSec: number;
  /** Verschil in s/km tussen het snelle en het rustige deel. */
  separationSec: number;
  confidence: "hoog" | "matig";
};

const MIN_UNITS = 4;
const MIN_SEPARATION_SEC = 20;
const MIN_BLOCK_M = 1800;
const EDGE_MAX_M = 3000;
const EDGE_MAX_SHARE = 0.15;
const paceOf = (unit: PaceUnit) => unit.timeS / (unit.distanceM / 1000);
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** One-dimensional two-class split (Jenks): the cut that minimises the within-class variance. */
function twoClassCut(values: number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  let best: { cut: number; sse: number } | null = null;
  for (let index = 1; index < sorted.length; index++) {
    const low = sorted.slice(0, index), high = sorted.slice(index);
    const sse = low.reduce((sum, value) => sum + (value - mean(low)) ** 2, 0) + high.reduce((sum, value) => sum + (value - mean(high)) ** 2, 0);
    if (!best || sse < best.sse) best = { cut: (sorted[index - 1] + sorted[index]) / 2, sse };
  }
  return best?.cut ?? null;
}

type Raw = { cls: SegmentClass; from: number; to: number }; // unit index range, inclusive

export function detectStructure(units: PaceUnit[]): RunStructure | null {
  const full = units.filter((unit) => !unit.partial && unit.distanceM >= 200 && unit.timeS > 0);
  if (full.length < MIN_UNITS) return null;
  const useGap = full.every((unit) => unit.gapSpeed != null);
  const paces = full.map((unit) => (useGap ? 1000 / unit.gapSpeed! : paceOf(unit)));
  const cut = twoClassCut(paces);
  if (cut == null) return null;
  const fastValues = paces.filter((pace) => pace < cut), easyValues = paces.filter((pace) => pace >= cut);
  if (!fastValues.length || !easyValues.length) return null;
  const fastMean = mean(fastValues), easyMean = mean(easyValues);
  const separationSec = easyMean - fastMean;
  if (separationSec < MIN_SEPARATION_SEC) return null;

  // consecutive units of one class form a segment
  const raw: Raw[] = [];
  // Without grade-adjusted pace, a single slow kilometre up a climb (or fast one down a slope) is terrain, not a change of effort.
  const classes: SegmentClass[] = paces.map((pace, index) => {
    const cls: SegmentClass = pace < cut ? "snel" : "rustig";
    if (useGap) return cls;
    const lone = (other: SegmentClass) => index > 0 && index < paces.length - 1 && (paces[index - 1] < cut ? "snel" : "rustig") === other && (paces[index + 1] < cut ? "snel" : "rustig") === other;
    if (cls === "rustig" && full[index].elevM >= 8 && lone("snel")) return "snel";
    if (cls === "snel" && full[index].elevM <= -8 && lone("rustig")) return "rustig";
    return cls;
  });
  if (!classes.includes("snel") || !classes.includes("rustig")) return null;
  classes.forEach((cls, index) => {
    const last = raw.at(-1);
    if (last && last.cls === cls) last.to = index; else raw.push({ cls, from: index, to: index });
  });

  // every boundary must be a real step, not a slide: a gradual fade or build-up is left to the normal analysis
  const steps = raw.slice(1).map((segment) => Math.abs(paces[segment.from] - paces[segment.from - 1]));
  const splitLike = [...full].map((unit) => unit.distanceM).sort((a, b) => a - b)[Math.floor(full.length / 2)] >= 800;
  const stepNeeded = raw.length >= 4 ? 0.35 : 0.45;
  if (steps.some((step) => step < separationSec * stepNeeded)) return null;

  const totalM = full.reduce((sum, unit) => sum + unit.distanceM, 0);
  const distanceOf = (segment: Raw) => full.slice(segment.from, segment.to + 1).reduce((sum, unit) => sum + unit.distanceM, 0);

  // a short easy stretch at the start or end next to a fast block is a warm-up or cool-down, not a part of its own
  let core = [...raw];
  const roles = new Map<Raw, SegmentRole>();
  const first = core[0], last = core.at(-1)!;
  const isEdge = (segment: Raw) => segment.cls === "rustig" && distanceOf(segment) <= Math.min(EDGE_MAX_M, totalM * EDGE_MAX_SHARE);
  if (core.length >= 2 && isEdge(first)) { roles.set(first, "inloop"); core = core.slice(1); }
  if (core.length >= 2 && isEdge(last) && last !== first) { roles.set(last, "uitloop"); core = core.slice(0, -1); }
  if (!core.some((segment) => segment.cls === "snel")) return null;

  const fastSegments = core.filter((segment) => segment.cls === "snel");
  let shape: StructureShape;
  if (core.length >= 4 || (core.length === 3 && core[0].cls === "snel")) {
    shape = "intervals";
    if (fastSegments.length < 2 || fastSegments.some((segment) => distanceOf(segment) < 300)) return null;
    // with kilometre splits a lone slow kilometre between fast ones is too thin to call recovery
    if (splitLike && core.filter((segment) => segment.cls === "rustig").every((segment) => distanceOf(segment) < 1500)) return null;
  } else {
    const fastM = fastSegments.reduce((sum, segment) => sum + distanceOf(segment), 0);
    const easyM = totalM - fastM - [...roles.keys()].reduce((sum, segment) => sum + distanceOf(segment), 0);
    const hasEdges = roles.size > 0;
    if (fastM < MIN_BLOCK_M) return null;
    if (core.length === 1) { if (!hasEdges) return null; shape = "mid-block"; }
    else if (core.length === 2) { if (easyM < MIN_BLOCK_M) return null; shape = core[0].cls === "snel" ? "fast-start" : "fast-finish"; }
    else if (core.length === 3 && core[0].cls === "rustig") { if (easyM < MIN_BLOCK_M) return null; shape = "mid-block"; }
    else return null;
  }

  const build = (segment: Raw, role: SegmentRole): StructureSegment => {
    const list = full.slice(segment.from, segment.to + 1);
    const startM = full.slice(0, segment.from).reduce((sum, unit) => sum + unit.distanceM, 0);
    const distanceM = list.reduce((sum, unit) => sum + unit.distanceM, 0);
    const timeS = list.reduce((sum, unit) => sum + unit.timeS, 0);
    const withHr = list.filter((unit) => unit.hr != null);
    const hrDistance = withHr.reduce((sum, unit) => sum + unit.distanceM, 0);
    const half = Math.floor(list.length / 2);
    const trendSec = list.length >= 3 ? mean(list.slice(list.length - half).map(paceOf)) - mean(list.slice(0, half).map(paceOf)) : null;
    const unitPaces = list.map(paceOf);
    return { role, startM, endM: startM + distanceM, distanceM, timeS, paceSec: timeS / (distanceM / 1000), hr: hrDistance > 0 ? withHr.reduce((sum, unit) => sum + unit.hr! * unit.distanceM, 0) / hrDistance : null, units: list.length, trendSec, spreadSec: list.length >= 2 ? Math.max(...unitPaces) - Math.min(...unitPaces) : null };
  };

  const segments = raw.map((segment) => {
    const role = roles.get(segment) ?? (segment.cls === "snel" ? "snel" : shape === "intervals" ? "herstel" : "rustig");
    return build(segment, role);
  });
  const minStep = Math.min(...steps);
  return { shape, segments, fastPaceSec: fastMean, easyPaceSec: easyMean, separationSec, confidence: separationSec >= 30 && minStep >= separationSec * 0.6 ? "hoog" : "matig" };
}

/** Segments that carry the training itself, without warm-up and cool-down. */
export const coreSegments = (structure: RunStructure) => structure.segments.filter((segment) => segment.role !== "inloop" && segment.role !== "uitloop");

const km = (meters: number) => (meters / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
export const segmentRange = (segment: StructureSegment) => `km ${km(segment.startM)}–${km(segment.endM)}`;

const paceText = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0").replace(/^60$/, "59")}`;
/** One line for the question to the athlete: "km 0–5,2 op 5:14/km, daarna km 5,2–19,5 op 5:40/km". */
export function structureSummary(structure: RunStructure) {
  const parts = coreSegments(structure).slice(0, 3).map((segment) => `${segmentRange(segment)} op ${paceText(segment.paceSec)}/km`);
  return parts.join(", daarna ");
}
