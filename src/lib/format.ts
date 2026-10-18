export function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtPace(minPerKm?: number | null) {
  if (!minPerKm) return "-";
  const min = Math.floor(minPerKm);
  const sec = Math.round((minPerKm - min) * 60);
  return `${min}:${sec.toString().padStart(2, "0")} /km`;
}

export function fmtDuration(seconds?: number | null) {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fmtKm(meters?: number | null) {
  if (!meters) return "-";
  return (meters / 1000).toFixed(2) + " km";
}

export function fmtNum(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtSigned(value: number | null | undefined, digits = 0, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`;
}

// yyyy-MM-dd is al de juiste kalenderdag; geen tijdzoneconversie.
export function fmtDay(date: string, withYear = false) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("nl-NL", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
}
