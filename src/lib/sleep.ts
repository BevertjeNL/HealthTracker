import { dayDifference } from "./recovery.ts";

type SleepRow = { date: string; sleepHours?: number | null };

export function analyzeSleep(rows: SleepRow[], today: string) {
  const valid = rows.filter((row) => row.date <= today && row.sleepHours != null && Number.isFinite(row.sleepHours) && row.sleepHours >= 0.5 && row.sleepHours <= 16)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = valid.at(-1);
  const ageDays = latest ? dayDifference(today, latest.date) : null;
  const recent = valid.filter((row) => dayDifference(today, row.date) <= 6);
  const baseline = valid.filter((row) => dayDifference(today, row.date) >= 7 && dayDifference(today, row.date) <= 34);
  const mean = (items: SleepRow[]) => items.length ? items.reduce((sum, row) => sum + row.sleepHours!, 0) / items.length : null;
  const recentAverage = recent.length >= 3 ? mean(recent) : null;
  const baselineAverage = baseline.length >= 5 ? mean(baseline) : null;
  const fresh = ageDays != null && ageDays <= 1;
  const shortNight = fresh && latest!.sleepHours! < 6;
  const belowNormal = fresh && recentAverage != null && baselineAverage != null && recentAverage < baselineAverage - 0.75;
  const concern = shortNight || belowNormal;
  const detail = !latest ? "Nog geen slaapmetingen ontvangen. Voeg werkelijk geslapen tijd toe aan je Apple Opdracht."
    : !fresh ? `Laatste slaapmeting ${ageDays} dagen geleden; geen actueel slaapadvies.`
    : shortNight ? `Laatste nacht ${latest.sleepHours!.toFixed(1).replace(".", ",")} uur: houd een zware training vandaag achter de hand.`
    : belowNormal ? `Laatste week gemiddeld ${recentAverage!.toFixed(1).replace(".", ",")} uur, ${Math.abs(recentAverage! - baselineAverage!).toFixed(1).replace(".", ",")} uur onder je eigen basis.`
    : recentAverage != null && baselineAverage != null ? `Laatste week ${recentAverage.toFixed(1).replace(".", ",")} uur gemiddeld; gebruikelijke 4 weken ${baselineAverage.toFixed(1).replace(".", ",")} uur.`
    : "Er zijn nog te weinig nachten voor een persoonlijke vergelijking.";
  return { latestHours: latest?.sleepHours ?? null, latestDate: latest?.date ?? null, ageDays, recentAverage, recentCount: recent.length, baselineAverage, baselineCount: baseline.length, concern, detail };
}
