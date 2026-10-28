// Pure aggregation of Apple Health sleep samples (HKCategoryTypeIdentifierSleepAnalysis) into one night per
// wake-up date. Used by scripts/import-apple-health-export.mjs; kept here so it can be tested without a database.

export type SleepStage = "deep" | "rem" | "core" | "unspecified" | "awake" | "inBed";

export type SleepSample = {
  /** Local wall-clock start, "yyyy-MM-dd HH:mm:ss" (the offset in the Apple export is dropped on purpose). */
  start: string;
  end: string;
  durationMin: number;
  stage: SleepStage;
  source: string;
};

export type SleepNight = {
  date: string;
  sleepAsleepMin: number;
  sleepDeepMin: number | null;
  sleepRemMin: number | null;
  sleepCoreMin: number | null;
  sleepAwakeMin: number | null;
  sleepBedtimeMin: number;
  sleepWakeMin: number;
};

const STAGE_BY_VALUE: Record<string, SleepStage> = {
  HKCategoryValueSleepAnalysisAsleepDeep: "deep",
  HKCategoryValueSleepAnalysisAsleepREM: "rem",
  HKCategoryValueSleepAnalysisAsleepCore: "core",
  HKCategoryValueSleepAnalysisAsleepUnspecified: "unspecified",
  HKCategoryValueSleepAnalysisAsleep: "unspecified",
  HKCategoryValueSleepAnalysisAwake: "awake",
  HKCategoryValueSleepAnalysisInBed: "inBed",
};

export const sleepStageFromAppleValue = (value: string | undefined) => (value ? STAGE_BY_VALUE[value] ?? null : null);

const clock = (stamp: string) => Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16));
const DAY_MS = 86_400_000;
const shiftDate = (date: string, days: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

/** Wake-up date of the night a sample belongs to: samples starting from 18:00 count towards the next morning. */
export function nightDate(start: string) {
  const date = start.slice(0, 10);
  return clock(start) >= 18 * 60 ? shiftDate(date, 1) : date;
}

const isDaytimeNap = (start: string) => clock(start) >= 12 * 60 && clock(start) < 18 * 60;

// Per night only the source with the most sleep counts (the Watch), so the iPhone's "in bed" or a second app does not
// double count. Naps that start between 12:00 and 18:00 are left out.
export function buildSleepNights(samples: SleepSample[]): SleepNight[] {
  const perNight = new Map<string, Map<string, SleepSample[]>>();
  for (const sample of samples) {
    if (isDaytimeNap(sample.start) || sample.durationMin <= 0) continue;
    const date = nightDate(sample.start);
    const bySource = perNight.get(date) ?? new Map<string, SleepSample[]>();
    bySource.set(sample.source, [...(bySource.get(sample.source) ?? []), sample]);
    perNight.set(date, bySource);
  }

  const nights: SleepNight[] = [];
  for (const [date, bySource] of perNight) {
    const sum = (list: SleepSample[], stages: SleepStage[]) => list.filter((s) => stages.includes(s.stage)).reduce((total, s) => total + s.durationMin, 0);
    const asleepOf = (list: SleepSample[]) => sum(list, ["deep", "rem", "core", "unspecified"]);
    const best = [...bySource.values()].sort((a, b) => asleepOf(b) - asleepOf(a))[0];
    const asleep = asleepOf(best);
    if (asleep <= 0) continue;
    const asleepSamples = best.filter((s) => s.stage !== "awake" && s.stage !== "inBed");
    const staged = best.some((s) => s.stage === "deep" || s.stage === "rem" || s.stage === "core");
    const bedtime = asleepSamples.map((s) => (clock(s.start) - 18 * 60 + 1440) % 1440).reduce((min, v) => Math.min(min, v), 1440);
    const wake = asleepSamples.map((s) => clock(s.end)).reduce((max, v) => Math.max(max, v), 0);
    const round = (value: number) => Math.round(value * 10) / 10;
    nights.push({
      date,
      sleepAsleepMin: round(asleep),
      sleepDeepMin: staged ? round(sum(best, ["deep"])) : null,
      sleepRemMin: staged ? round(sum(best, ["rem"])) : null,
      sleepCoreMin: staged ? round(sum(best, ["core"])) : null,
      sleepAwakeMin: round(sum(best, ["awake"])),
      sleepBedtimeMin: bedtime,
      sleepWakeMin: wake,
    });
  }
  return nights.sort((a, b) => a.date.localeCompare(b.date));
}
