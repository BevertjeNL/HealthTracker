export function watchWorkout(detail: string) {
  if (!/\d+\s*×\s*\d+\s*(?:min|seconden)/i.test(detail)) return null;
  const steps = detail.split(" · ").map((part) => part.trim().replace(/\. Samen.*$/i, "")).filter(Boolean);
  if (steps.length < 3) return null;
  return steps;
}
