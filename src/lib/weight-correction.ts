export type WeightCorrection = { date: string; weightKg: number | null };

export function parseWeightCorrection(date: FormDataEntryValue | null, operation: FormDataEntryValue | null, rawWeight: FormDataEntryValue | null): WeightCorrection | null {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (parsedDate.toISOString().slice(0, 10) !== date) return null;
  if (operation === "remove") return { date, weightKg: null };
  if (operation !== "save" || typeof rawWeight !== "string") return null;
  const normalized = rawWeight.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const weightKg = Number(normalized);
  if (weightKg < 20 || weightKg > 400) return null;
  return { date, weightKg };
}
