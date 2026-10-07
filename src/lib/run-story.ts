import { formatPaceSec, formatTime, type AnalysisRun, type PacingAnalysis, type PaceUnit, type RunKind } from "./run-analysis.ts";

export type StoryPoint = { phase: string; title: string; detail: string; tone: "good" | "watch" | "info" };
const n = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function buildRunStory(run: AnalysisRun, kind: RunKind, analysis: PacingAnalysis | null, units: PaceUnit[], laps: PaceUnit[] = []) {
  const raw = run.raw;
  const points: StoryPoint[] = [];
  const full = units.filter((unit) => !unit.partial && unit.distanceM >= 900);
  const signed = (value: number) => `${value > 0 ? "+" : ""}${Math.round(value)}`;
  if (analysis && full.length >= 3) {
    const start = analysis.firstUnitDeltaSec;
    points.push({ phase: "Start", title: start != null && start <= -10 ? "Je begon duidelijk sneller" : start != null && start >= 10 ? "Je kwam rustig op gang" : "Je begon beheerst", detail: `Kilometer 1: ${formatPaceSec(analysis.rows[0].paceSec)}/km. ${start == null ? "" : `${Math.abs(Math.round(start))} s/km ${start < 0 ? "sneller" : "langzamer"} dan de volgende kilometers.`}${start != null && start <= -10 && kind !== "interval" ? " Start de volgende vergelijkbare run 5–10 s/km rustiger." : ""}`, tone: start != null && start <= -10 && kind !== "interval" ? "watch" : "good" });
    const middle = analysis.rows.slice(1, -1).filter((row) => row.distanceM >= 900);
    const middlePace = middle.length ? mean(middle.map((row) => row.paceSec)) : null;
    const climbing = middle.filter((row) => row.elevM >= 8);
    const uphillText = climbing.length ? ` ${climbing.length} kilometer${climbing.length === 1 ? "" : "s"} met minstens 8 m stijging; beoordeel tempoverlies daar met die klim in gedachten.` : "";
    const middleHr = middle.filter((row) => row.hr != null);
    const hrText = middleHr.length >= 2 ? ` Hartslag middenstuk gemiddeld ${Math.round(mean(middleHr.map((row) => row.hr!)))} bpm.` : "";
    points.push({ phase: "Midden", title: analysis.pattern === "intervals" ? "Snelle en rustige blokken" : analysis.cvPct != null && analysis.cvPct > 7 ? "Het tempo schommelde" : "Het middenstuk bleef controleerbaar", detail: `Middenstuk ${middlePace == null ? "onbekend" : `${formatPaceSec(middlePace)}/km`}.${uphillText}${hrText}`, tone: analysis.pattern === "variable" && !analysis.gradeAdjusted ? "watch" : "info" });
    const finish = analysis.rows.filter((row) => row.distanceM >= 900).at(-1)!;
    const drift = analysis.hrDriftPct == null ? "" : ` Hartslag tweede helft ${signed(analysis.hrDriftPct)}% tegenover de eerste.`;
    const finishDetail = `Laatste volle kilometer ${formatPaceSec(finish.paceSec)}/km; tweede helft ${Math.abs(Math.round(analysis.splitDiffSec))} s/km ${analysis.splitDiffSec >= 0 ? "langzamer" : "sneller"}.${drift}`;
    points.push({ phase: "Slot", title: analysis.splitDiffSec >= 5 ? "Tempo viel terug" : analysis.splitDiffSec <= -4 ? "Je versnelde in de tweede helft" : "Je hield het tempo vast", detail: finishDetail, tone: analysis.splitDiffSec >= 5 ? "watch" : "good" });
  }

  const elapsed = n(raw.elapsed_time);
  const paused = elapsed != null && elapsed > run.movingTimeS ? Math.round(elapsed - run.movingTimeS) : null;
  const lapPower = laps.filter((unit) => unit.watts != null);
  const lapCadence = laps.filter((unit) => unit.cadenceSpm != null);
  const weightedLap = (list: PaceUnit[], value: (lap: PaceUnit) => number) => list.reduce((sum, lap) => sum + value(lap) * lap.timeS, 0) / list.reduce((sum, lap) => sum + lap.timeS, 0);
  const avgWatts = n(raw.weighted_average_watts) ?? n(raw.average_watts) ?? (lapPower.length >= 3 ? weightedLap(lapPower, (lap) => lap.watts!) : null);
  const maxWatts = n(raw.max_watts);
  const cadence = run.cadenceSpm ?? (lapCadence.length >= 3 ? weightedLap(lapCadence, (lap) => lap.cadenceSpm!) : null);
  const climb = run.elevationM;
  const suffer = run.sufferScore;
  const rpe = n(raw.perceived_exertion);
  const maxSpeed = n(raw.max_speed);
  const calories = n(raw.calories);
  const kilojoules = n(raw.kilojoules);
  const loadBits = [paused != null && paused >= 30 ? `${Math.round(paused / 60)} min buiten beweegtijd (stops of stilstand)` : null, climb != null && climb >= 10 ? `${Math.round(climb)} m stijging` : null, run.maxHr != null ? `hoogste hartslag ${Math.round(run.maxHr)} bpm` : null, avgWatts != null ? `${Math.round(avgWatts)} W gemiddeld${maxWatts != null ? `, piek ${Math.round(maxWatts)} W` : ""}` : null, cadence != null ? `${Math.round(cadence)} stappen/min cadans` : null, maxSpeed != null && maxSpeed > 0 ? `hoogste snelheid ${(maxSpeed * 3.6).toFixed(1)} km/u` : null, suffer != null ? `Strava-inspanningsscore ${Math.round(suffer)}` : null, rpe != null ? `eigen inspanning ${Math.round(rpe)}/10` : null, calories != null ? `${Math.round(calories)} kcal volgens Strava` : kilojoules != null ? `${Math.round(kilojoules)} kJ volgens Strava` : null].filter((bit): bit is string => bit != null);
  if (loadBits.length) points.push({ phase: "Belasting", title: "Wat de totale inspanning laat zien", detail: `${loadBits.join(" · ")}. ${paused != null && paused >= 30 ? "Het gemiddelde tempo is gebaseerd op beweegtijd; kijk bij onderbrekingen ook naar de verstreken tijd." : ""}`, tone: "info" });

  if (lapPower.length >= 3) {
    const first = mean(lapPower.slice(0, Math.floor(lapPower.length / 2)).map((unit) => unit.watts!));
    const second = mean(lapPower.slice(Math.floor(lapPower.length / 2)).map((unit) => unit.watts!));
    points.push({ phase: "Rondes", title: "Vermogen over de rondes", detail: `${Math.round(first)} W in de eerste rondes en ${Math.round(second)} W in de laatste. ${Math.abs(second - first) >= 10 ? "Gebruik dit naast tempo en hoogte om de inspanning te beoordelen." : "Het vermogen bleef vergelijkbaar."}`, tone: "info" });
  }

  const bestEfforts = Array.isArray(raw.best_efforts) ? raw.best_efforts.filter((effort): effort is Record<string, unknown> => !!effort && typeof effort === "object") : [];
  const effortLabels = bestEfforts.flatMap((effort) => typeof effort.name === "string" && n(effort.elapsed_time) != null ? [`${effort.name}: ${formatTime(n(effort.elapsed_time)!)}`] : []).slice(0, 3);
  if (effortLabels.length) points.push({ phase: "Tussentijden", title: "Gemeten beste stukken", detail: `${effortLabels.join(" · ")}. Dit zijn Strava-best efforts binnen deze activiteit; geen persoonlijk recordclaim.`, tone: "info" });

  const available = ["afstand en beweegtijd", elapsed != null ? "verstreken tijd" : null, run.avgHr != null ? "hartslag" : null, run.maxHr != null ? "maximale hartslag" : null, cadence != null || laps.some((lap) => lap.cadenceSpm != null) ? "cadans" : null, avgWatts != null || lapPower.length ? "vermogen" : null, climb != null ? "hoogteverschil" : null, maxSpeed != null ? "maximale snelheid" : null, suffer != null ? "Strava-inspanningsscore" : null, rpe != null ? "ervaren inspanning" : null, calories != null || kilojoules != null ? "energie" : null, full.length >= 3 ? "kilometersplits" : null, full.some((unit) => unit.gapSpeed != null) ? "hoogtegecorrigeerd tempo" : null, laps.length >= 3 ? "rondes" : null, effortLabels.length ? "beste stukken" : null].filter((item): item is string => item != null);
  const summary = analysis ? points.slice(0, 3).map((point) => `${point.phase}: ${point.title.toLowerCase()}`).join(" · ") : `Gemiddeld ${formatPaceSec(run.paceMinPerKm == null ? null : run.paceMinPerKm * 60)}/km${climb != null ? ` met ${Math.round(climb)} m stijging` : ""}${run.avgHr != null ? ` en ${Math.round(run.avgHr)} bpm gemiddeld` : ""}.`;
  return { summary, points, available, hasSplits: full.length >= 3 };
}
