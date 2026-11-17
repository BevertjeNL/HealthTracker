// activities.id is a PostgreSQL serial (signed 32-bit integer), unlike Strava's text ID.
const MAX_ACTIVITY_ID = 2_147_483_647;

export function parseActivityId(value: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(value)) return null;
  const id = Number(value);
  return id <= MAX_ACTIVITY_ID ? id : null;
}
