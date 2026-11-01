// Pure berekening van de eindtijd op exact de halve marathon (21,0975 km) voor een run die langer of korter was.
// Twee methoden, van nauwkeurig naar grof:
//  - "splits":     de run was minstens 21,0975 km en de kilometertijden van Strava zijn bekend; we lezen de tijd af op dat punt.
//  - "geschat":    anders schalen we de tijd met Riegel (T2 = T1 × (D2/D1)^1,06). Voor een iets langere run is dat een kleine correctie omlaag,
//                  voor een iets kortere run komt de ontbrekende afstand op iets lager tempo erbij.
// We gebruiken beweegtijd van Strava. Een officiële nettotijd kan een paar seconden afwijken.

export const HALF_MARATHON_M = 21_097.5;
// Ruim genoeg voor "net te kort" of "extra bocht", maar niet zo groot dat de schatting een gok wordt.
export const HALF_TIME_MIN_M = 20_000;
export const HALF_TIME_MAX_M = 22_500;
const RIEGEL_EXPONENT = 1.06;

export type HalfTime = {
  timeS: number;
  method: "splits" | "geschat";
  /** Afstand van de run min 21,0975 km, in meters. Positief = langer gelopen dan de halve marathon. */
  deltaM: number;
  note: string;
};

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

// Volgorde en afstand van de kilometerdelen. Een ontbrekend of onvolledig deel maakt de uitlezing onbetrouwbaar, dan valt de aanroeper terug.
function timeAtDistance(raw: Record<string, unknown>, targetM: number): number | null {
  const splits = Array.isArray(raw.splits_metric) ? raw.splits_metric : [];
  let distance = 0;
  let time = 0;
  for (const value of splits) {
    if (!value || typeof value !== "object") return null;
    const split = value as Record<string, unknown>;
    const splitDistance = num(split.distance);
    const splitTime = num(split.moving_time);
    if (splitDistance == null || splitTime == null || splitDistance <= 0 || splitTime <= 0) return null;
    if (distance + splitDistance >= targetM) return time + splitTime * ((targetM - distance) / splitDistance);
    distance += splitDistance;
    time += splitTime;
  }
  return null;
}

const formatKm = (meters: number) => `${(Math.abs(meters) / 1000).toFixed(2).replace(".", ",")} km`;

export function estimateHalfMarathonTime(run: { distanceM: number; movingTimeS: number; raw?: Record<string, unknown> | null }): HalfTime | null {
  if (!(run.distanceM >= HALF_TIME_MIN_M && run.distanceM <= HALF_TIME_MAX_M) || !(run.movingTimeS > 0)) return null;
  const deltaM = run.distanceM - HALF_MARATHON_M;

  if (deltaM >= 0 && run.raw) {
    const exact = timeAtDistance(run.raw, HALF_MARATHON_M);
    if (exact != null) {
      return { timeS: Math.round(exact), method: "splits", deltaM, note: `Tijd na 21,0975 km uit je kilometertijden; je liep ${formatKm(deltaM)} verder.` };
    }
  }

  const timeS = run.movingTimeS * (HALF_MARATHON_M / run.distanceM) ** RIEGEL_EXPONENT;
  const note = deltaM >= 0
    ? `Geschat uit je totaaltijd; je liep ${formatKm(deltaM)} verder. Haal de Strava-details op voor de tijd uit je kilometertijden.`
    : `Geschat: je liep ${formatKm(deltaM)} te kort. De ontbrekende afstand is erbij gerekend op een iets lager tempo.`;
  return { timeS: Math.round(timeS), method: "geschat", deltaM, note };
}
