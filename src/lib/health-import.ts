export function normalizeHealthMetricValue(
  metricName: string,
  units: string | undefined,
  value: number,
) {
  const normalizedUnits = units?.trim().toLowerCase();
  if (metricName === "active_energy" && normalizedUnits === "kj") {
    return value / 4.184;
  }
  if (
    (metricName === "weight_body_mass" || metricName === "weight_&_body_mass") &&
    (normalizedUnits === "lb" || normalizedUnits === "lbs")
  ) {
    return value * 0.45359237;
  }
  return value;
}
